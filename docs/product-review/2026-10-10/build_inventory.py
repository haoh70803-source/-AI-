"""Produce a static, secret-free review snapshot. Does not execute application code."""
from pathlib import Path
import hashlib
import json
import re
import subprocess

ROOT = Path(__file__).resolve().parents[3]
OUT = Path(__file__).resolve().parent

def rel(path):
    return path.relative_to(ROOT).as_posix()

def read(path):
    return path.read_text(encoding="utf-8-sig")

def references(path, pattern):
    return [{"file": rel(path), "line": i, "text": line.strip()} for i, line in enumerate(read(path).splitlines(), 1) if re.search(pattern, line)]

def route(path):
    parts = path.relative_to(ROOT / "apps/web/app").parts[:-1]
    return "/" + "/".join(p for p in parts if not p.startswith("(") and not p.startswith("@"))

def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

pages = []
apis = []
for path in sorted((ROOT / "apps/web/app").rglob("*")):
    if path.name == "page.tsx":
        pages.append({"file": rel(path), "routeCandidate": route(path), "sha256": digest(path), "intercepted": any(p.startswith("@") or p.startswith("(.)") for p in path.parts), "evidence": references(path, r"^import |redirect\(|notFound\(|return ")})
    elif path.name == "route.ts":
        body = read(path)
        apis.append({"file": rel(path), "routeCandidate": route(path), "sha256": digest(path), "methods": re.findall(r"export\s+(?:async\s+)?function\s+(GET|POST|PATCH|PUT|DELETE|OPTIONS|HEAD)\b|export\s+(?:const|let)\s+(GET|POST|PATCH|PUT|DELETE|OPTIONS|HEAD)\b", body), "evidence": references(path, r"^import |^export |requireApi|requireWorkspace|requireSession|actor")})
controls = []
for base in ["apps/web/components", "apps/web/app"]:
    for path in sorted((ROOT / base).rglob("*.tsx")):
        # JSX source references, not a count of visible or functioning buttons.
        controls.extend(references(path, r"<button\b|<Button\b|<select\b|<input\b|<textarea\b|<Link\b|<a\b"))
services = []
for base in ["apps/web/server", "apps/worker/src", "packages/integrations/src", "packages/providers/src"]:
    for path in sorted((ROOT / base).rglob("*.ts")):
        if re.search(r"\.(test|spec)\.", path.name):
            continue
        exports = references(path, r"^export (?:async )?function |^export class |^export (?:const|type|interface) ")
        services.append({"file": rel(path), "sha256": digest(path), "exports": exports})
schema = ROOT / "packages/db/prisma/schema.prisma"
models = references(schema, r"^model |^enum ")
tests = sorted(rel(path) for base in ["apps", "packages", "scripts", "services"] for path in (ROOT / base).rglob("*") if path.is_file() and "node_modules" not in path.parts and ".next" not in path.parts and (re.search(r"\.(test|spec)\.[cm]?[jt]sx?$", path.name) or path.name.startswith("test_") and path.suffix == ".py"))
status = subprocess.run(["git", "status", "--short"], cwd=ROOT, capture_output=True, text=True, encoding="utf-8", check=True).stdout
snapshot = {"date": "2026-10-10", "basis": "working tree, including existing uncommitted changes", "verification": "V0 static inventory; runtime, database contents, credentials and integrations not queried", "pages": pages, "apis": apis, "controlSourceReferences": controls, "serviceFiles": services, "schemaDeclarations": models, "testFiles": tests, "gitStatus": status}
(OUT / "implementation-inventory.json").write_text(json.dumps(snapshot, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

def link(file, line=None):
    target = ROOT.joinpath(file).as_posix() + (f":{line}" if line else "")
    return f"[{file}](<{target}>)"

lines = ["# 鑫世界现有实现索引", "", "快照日期：2026-10-10。覆盖当前工作树，含未提交改动。路由是按文件路径提取的候选，未验证可访问性；拦截路由、重定向和动态参数不能作为独立功能数量。控件索引是 JSX 源码位置，不代表可见按钮总数。API 方法来自静态导出匹配，转导出或动态绑定须人工复核。", "", f"页面文件 {len(pages)} 个，Route Handler 文件 {len(apis)} 个，控件源码位置 {len(controls)} 处，服务与适配器文件 {len(services)} 个，Prisma model {sum(x['text'].startswith('model ') for x in models)} 个，enum {sum(x['text'].startswith('enum ') for x in models)} 个，测试文件 {len(tests)} 个。均为资产计数，不是功能完成率。", "", "完整源码引用、SHA256 和既有 Git 状态见 implementation-inventory.json。测试只登记文件，本次未执行。", "", "## 页面与路由", "", "| 路由候选 | 页面源码 | 备注 |", "| --- | --- | --- |"]
for x in pages:
    redirects = [e for e in x["evidence"] if "redirect(" in e["text"]]
    note = "拦截页面" if x["intercepted"] else "普通页面文件"
    if redirects:
        note += "；含重定向，请查看源码"
    lines.append(f"| `{x['routeCandidate']}` | {link(x['file'])} | {note} |")
lines += ["", "## API", "", "| 路由候选 | 导出方法 | 源码 |", "| --- | --- | --- |"]
for x in apis:
    methods = sorted({v for pair in x["methods"] for v in pair if v})
    lines.append(f"| `{x['routeCandidate']}` | {', '.join(methods) or '需查看转导出'} | {link(x['file'])} |")
lines += ["", "## 数据模型与枚举", "", "模型存在仅证明 Schema 声明，不证明 migration 已执行或有真实数据。", "", "| 声明 | 源码 |", "| --- | --- |"]
for x in models:
    lines.append(f"| `{x['text'].rstrip('{').strip()}` | {link(x['file'], x['line'])} |")
lines += ["", "## 测试资产", "", "以下均为测试文件存在证据，不是本次通过结果。", ""]
lines.extend(f"- {link(x)}" for x in tests)
(OUT / "implementation-index.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
print(json.dumps({"pages": len(pages), "apiFiles": len(apis), "controlReferences": len(controls), "serviceFiles": len(services), "models": sum(x['text'].startswith('model ') for x in models), "enums": sum(x['text'].startswith('enum ') for x in models), "testFiles": len(tests)}, ensure_ascii=False))
