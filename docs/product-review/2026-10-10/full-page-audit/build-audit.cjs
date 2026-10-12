/* Read-only application inventory. Writes only this audit delivery directory. */
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), ts = require('typescript');
const ROOT = path.resolve(__dirname, '../../../..'), OUT = __dirname;
const rel = p => path.relative(ROOT, p).replaceAll('\\', '/');
const read = p => fs.readFileSync(path.resolve(ROOT, p), 'utf8').replace(/^\uFEFF/, '');
const hash = p => crypto.createHash('sha256').update(fs.readFileSync(path.resolve(ROOT, p))).digest('hex');
function walk(dir) { return fs.readdirSync(dir, {withFileTypes:true}).filter(e=>!['node_modules','.next','.git','test-results','playwright-report'].includes(e.name)).flatMap(e => e.isDirectory() ? walk(path.join(dir,e.name)) : [rel(path.join(dir,e.name))]); }
const old = JSON.parse(read('docs/product-review/2026-10-10/implementation-inventory.json'));
const decisions = JSON.parse(read('docs/product-review/2026-10-10/feature-decisions.json'));
const files = walk(path.join(ROOT, 'apps/web')).filter(f => !f.includes('/node_modules/') && !f.includes('/.next/') && /\.[jt]sx?$/.test(f) && !/\.(test|spec)\./.test(f));
const fileSet = new Set(files), cache = new Map();
function resolve(from, spec) {
  let base = spec.startsWith('@/') ? 'apps/web/'+spec.slice(2) : spec.startsWith('.') ? path.posix.normalize(path.posix.join(path.posix.dirname(from),spec)) : null;
  if (!base) return null;
  return [base,base+'.ts',base+'.tsx',base+'/index.ts',base+'/index.tsx'].find(f=>fileSet.has(f)) ?? null;
}
const models = [...read('packages/db/prisma/schema.prisma').matchAll(/^model (\w+)/gm)].map(m=>m[1]);
const modelNames = new Map(models.map(m=>[m[0].toLowerCase()+m.slice(1),m]));
function analyze(file) {
  if(cache.has(file)) return cache.get(file);
  const source = read(file), ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest,true,file.endsWith('.tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS);
  const data = {file,sha256:hash(file),imports:[],controls:[],requests:[],redirects:[],texts:[],functions:[],modelOperations:[]}; cache.set(file,data);
  const txt = n => n?.getText(ast) ?? '';
  const line = n => ast.getLineAndCharacterOfPosition(n.getStart(ast)).line+1;
  const clean = s => s.replace(/\s+/g,' ').trim();
  const bindings=[];function bindingsVisit(n){if(ts.isVariableDeclaration(n)&&n.initializer)bindings.push({name:txt(n.name),value:txt(n.initializer),pos:n.pos});ts.forEachChild(n,bindingsVisit);}bindingsVisit(ast);
  function resolveExpr(n){const s=txt(n);if(ts.isIdentifier(n)){const b=bindings.filter(b=>b.name===s&&b.pos<n.pos).at(-1);if(b)return b.value;}return s;}
  function owner(n) { for(let p=n.parent;p;p=p.parent){if(ts.isFunctionDeclaration(p))return txt(p.name)||'(匿名函数)';if(ts.isVariableDeclaration(p)&&p.initializer&&(ts.isArrowFunction(p.initializer)||ts.isFunctionExpression(p.initializer)))return txt(p.name);}return '(内联回调或页面渲染)'; }
  function conditions(n) { const result=[];for(let p=n.parent;p;p=p.parent){if(ts.isBinaryExpression(p)&&p.operatorToken.kind===ts.SyntaxKind.AmpersandAmpersandToken&&n.pos>=p.right.pos)result.push(clean(txt(p.left)));if(ts.isConditionalExpression(p))result.push((n.pos>=p.whenTrue.pos&&n.end<=p.whenTrue.end?'':'非：')+clean(txt(p.condition)));}return result.reverse(); }
  function label(n) { let parts=[]; function sub(x){if(ts.isJsxText(x)&&x.text.trim())parts.push(clean(x.text));if(ts.isJsxExpression(x)&&x.expression&&!/=>/.test(txt(x.expression)))parts.push('{'+clean(txt(x.expression))+'}');ts.forEachChild(x,sub);}if(ts.isJsxElement(n))n.children.forEach(sub);return parts.join(' ').slice(0,600); }
  function visit(n) {
    if(ts.isImportDeclaration(n)||ts.isExportDeclaration(n)) {const spec=n.moduleSpecifier&&ts.isStringLiteral(n.moduleSpecifier)?n.moduleSpecifier.text:null;if(spec)data.imports.push({spec,file:resolve(file,spec),clause:txt(n.importClause)||txt(n.exportClause),typeOnly:!!n.importClause?.isTypeOnly,line:line(n)});}
    if(ts.isFunctionDeclaration(n))data.functions.push({name:txt(n.name),line:line(n)});
    if(ts.isCallExpression(n)) {
      const callee=txt(n.expression), code=txt(n);
      if(callee==='redirect'||callee.endsWith('.redirect'))data.redirects.push({expression:txt(n.arguments[0]),line:line(n)});
      // Include fetch and explicit request-wrapper call sites; never infer frontend wiring from route existence.
      if(callee==='fetch'||(/fetch|request|post|mutate|api|json/i.test(callee)&&n.arguments.some(a=>/\/api\//.test(txt(a))))){
        const arg=n.arguments[0]?resolveExpr(n.arguments[0]):'';let method='待核验（动态参数/包装函数）';
        const init=n.arguments[1];
        if(init&&ts.isObjectLiteralExpression(init)){const m=init.properties.find(p=>p.name&&txt(p.name).replace(/["']/g,'')==='method');method=m?txt(m.initializer).replace(/["']/g,''):callee==='fetch'?'GET':'待核验（包装函数接收对象）';}
        else if(callee==='fetch'&&!init)method='GET';
        else if(init&&ts.isStringLiteral(init)&&/^(GET|POST|PUT|PATCH|DELETE)$/.test(init.text))method=init.text;
        else if(callee==='post')method='POST';
        else if(!init&&/request/i.test(callee))method='GET（包装函数默认值需核对）';
        data.requests.push({file,line:line(n),function:owner(n),callee,urlExpression:arg,method,code:clean(code),conditions:conditions(n)});
      }
      const m=callee.match(/(?:db|tx|transaction|client)\.(\w+)\.(\w+)$/);if(m&&modelNames.has(m[1]))data.modelOperations.push({model:modelNames.get(m[1]),operation:m[2],line:line(n)});
    }
    if(ts.isJsxElement(n)||ts.isJsxSelfClosingElement(n)){
      const opening=ts.isJsxElement(n)?n.openingElement:n, tag=txt(opening.tagName), attrs={};
      for(const a of opening.attributes.properties){if(ts.isJsxAttribute(a))attrs[txt(a.name)]=a.initializer?ts.isStringLiteral(a.initializer)?a.initializer.text:txt(a.initializer):'true';}
      if(/^(h1|h2|h3|PageHeader)$/.test(tag))data.texts.push({tag,text:attrs.title||label(n),line:line(n)});
      if(/^(button|Button|input|Input|textarea|Textarea|select|Select|Link|a|summary|form|Field|Form|VoiceInput|NameDialog)$/.test(tag)){
        const events=Object.fromEntries(Object.entries(attrs).filter(([k])=>/^on[A-Z]/.test(k)));
        let formAction=null;for(let p=n.parent;p;p=p.parent){if(ts.isJsxElement(p)&&['form','Form'].includes(txt(p.openingElement.tagName))){const a=p.openingElement.attributes.properties.find(a=>ts.isJsxAttribute(a)&&['action','onSubmit'].includes(txt(a.name)));if(a)formAction=txt(a.initializer);break;}}
        data.controls.push({id:file+':'+line(n)+':'+n.pos,file,line:line(n),tag,label:attrs['aria-label']||attrs.label||attrs.placeholder||attrs.title||attrs.confirmLabel||label(n)||attrs.name||attrs.type||'动态控件（见源码）',events,href:attrs.href||null,formAction,action:attrs.action||null,attrs,conditions:conditions(n),function:owner(n)});
      }
    }
    ts.forEachChild(n,visit);
  }
  visit(ast);return data;
}
function uiGraph(start) { const seen=new Set();function go(f){if(!f||seen.has(f))return;seen.add(f);for(const i of analyze(f).imports){if(!i.typeOnly&&i.file&&!i.file.includes('/server/')&&!i.file.includes('/lib/auth'))go(i.file);}}go(start);return [...seen]; }
function route(file) {return '/'+file.slice('apps/web/app/'.length).split('/').slice(0,-1).filter(s=>!s.startsWith('@')&&!/^\((?!\.\))/.test(s)).map(s=>s.replace(/^\(\.\)/,'')).join('/');}
function apiServices(file){return analyze(file).imports.filter(i=>i.file?.includes('/server/')).map(i=>({file:i.file,clause:i.clause,line:i.line,models:analyze(i.file).modelOperations}));}
const apiFiles=files.filter(f=>f.startsWith('apps/web/app/api/')&&f.endsWith('/route.ts'));
const apis=apiFiles.map(f=>{const s=read(f);const methods=[...new Set([...s.matchAll(/export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)\b|export\s+(?:const|let)\s+(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)\b/g)].map(m=>m[1]||m[2]))];if(!methods.length&&/export\s*\{/.test(s))for(const m of s.matchAll(/\b(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)\b/g))if(!methods.includes(m[1]))methods.push(m[1]);return {route:route(f),file:f,methods,services:apiServices(f),sha256:hash(f)};});
function urls(expr){
  let s=expr.replace(/encodeURIComponent\(([^()]*)\)/g,'$1');
  s=s.replace(/\$\{[^}]*\}/g,'[param]');
  if(s.includes(' + '))s=s.replace(/["'`]\s*\+\s*[^"'`]*?\s*\+\s*["'`]/g,'[param]');
  const m=s.match(/\/api\/[A-Za-z0-9_\-/\[\].]+/);return m?m[0].replace(/\/+$/,''):null;
}
function matchApi(url){if(!url)return [];return apis.filter(a=>{const aParts=a.route.split('/'),uParts=url.split('/');return aParts.length===uParts.length&&aParts.every((p,i)=>p===uParts[i]||p.startsWith('['));}).map(a=>a.route);}
const pageFiles=files.filter(f=>f.startsWith('apps/web/app/')&&f.endsWith('/page.tsx'));
const pages=pageFiles.map((f,index)=>{const a=analyze(f),slot=f.includes('/@'),graph=uiGraph(f),r=route(f);const mode=read(f).match(/mode=["'](topics|review|knowledge|facts|context)["']/)?.[1];let controls=graph.flatMap(g=>analyze(g).controls);
  if(mode)controls=controls.filter(c=>!c.conditions.some(cond=>{const ms=[...cond.matchAll(/mode\s*===\s*['"](\w+)['"]/g)].map(m=>m[1]);return ms.length&&!ms.includes(mode)&&!cond.startsWith('非：');}));
  const requests=graph.flatMap(g=>analyze(g).requests).map(req=>({...req,urlCandidate:urls(req.urlExpression),apiCandidates:matchApi(urls(req.urlExpression)),wiringStatus:'源码调用；未运行'}));
  return {id:'P'+String(index+1).padStart(3,'0'),route:r,file:f,slot,mode,sha256:a.sha256,redirects:a.redirects,graph,controls,requests,serverImports:a.imports.filter(i=>i.file?.includes('/server/')),headings:a.texts,status:'代码存在；运行待核验'};});
const shellFiles=['apps/web/components/app-shell.tsx','apps/web/components/sidebar-foundation.tsx','apps/web/components/global-search.tsx','apps/web/app/(app)/settings/layout.tsx','apps/web/app/(app)/@settings/(.)settings/layout.tsx'].filter(f=>fileSet.has(f));
const shellGraph=[...new Set(shellFiles.flatMap(uiGraph))];
const shell={id:'SHELL',route:'应用外壳（登录页面除外）',file:shellFiles.join(', '),graph:shellGraph,controls:shellGraph.flatMap(f=>analyze(f).controls),requests:shellGraph.flatMap(f=>analyze(f).requests).map(r=>({...r,urlCandidate:urls(r.urlExpression),apiCandidates:matchApi(urls(r.urlExpression))}))};
const snapshots=[...cache.values()].map(v=>({file:v.file,sha256:v.sha256}));
const changedSincePrior=[...old.pages,...old.apis,...old.serviceFiles].filter(x=>fs.existsSync(path.join(ROOT,x.file))&&hash(x.file)!==x.sha256).map(x=>x.file);
const allControls=[...new Map([...pages.flatMap(p=>p.controls),...shell.controls].map(c=>[c.id,c])).values()];
const noEffects=allControls.filter(c=>/^(button|Button)$/.test(c.tag)&&Object.values(c.events).some(s=>/=>\s*\{\s*\}|=>\s*undefined\b/.test(s)));
const gaps=allControls.filter(c=>/^(button|Button)$/.test(c.tag)&&!Object.keys(c.events).length&&c.attrs.type!=='submit'&&!c.formAction);
const inventory={date:'2026-10-10',basis:'current working tree; static AST evidence, no application tests executed',previousInventoryChanges:changedSincePrior,pages,apis,shell,noEffectCandidates:noEffects,buttonWithoutDirectHandlerCandidates:gaps,sourceSnapshots:snapshots,models,counts:{pageFiles:pages.length,ordinaryPageFiles:pages.filter(p=>!p.slot).length,slotPageFiles:pages.filter(p=>p.slot).length,apiRouteFiles:apis.length,uniqueControlDeclarations:allControls.length},runtime:{probedPorts:[3000,3001,3022,55438,19020],result:'all closed at audit probe; application page accessibility not verified',newApplicationScreenshots:0}};
fs.writeFileSync(path.join(OUT,'page-control-api-inventory.json'),JSON.stringify(inventory,null,2));
fs.writeFileSync(path.join(OUT,'initial-source-snapshot.json'),JSON.stringify(snapshots,null,2));
console.log(JSON.stringify({counts:inventory.counts,priorChanged:changedSincePrior.length,noEffects:noEffects.length,unboundButtonCandidates:gaps.length,requestDeclarations:pages.reduce((s,p)=>s+p.requests.length,0)}));
