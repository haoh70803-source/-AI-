import { creationOptionsSchema, type CreationOptions } from "@/lib/contracts/creation";

export function resolveCreationPolicy(content: string, options?: Partial<CreationOptions>, taskText = content) {
  const settings = creationOptionsSchema.parse(options ?? {});
  const edit = /只改|仅改|修改.{0,6}段|改开头|优化.{0,8}开头|局部|润色|更自然|短一点|长一点|精简|改短|缩短|改写|重写/u.test(content);
  const question = /^(什么是|什么叫|解释一下|如何理解|为什么)/u.test(content);
  const task = question && settings.task === "AUTO" ? "QA" : edit ? "EDIT" : settings.task !== "AUTO" ? settings.task : /策划|制定.{0,12}计划|执行方案|落地方案/u.test(taskText) ? "PLAN" : /朋友圈/u.test(taskText) ? "MOMENTS" : /私信|短信|私聊/u.test(taskText) ? "MESSAGE" : /选题|创意|角度|方向/u.test(taskText) ? "TOPIC" : /口播|脚本|课程介绍|成稿|文案/u.test(taskText) ? "SCRIPT" : /方案|计划/u.test(taskText) ? "PLAN" : /分析|拆解|研究/u.test(taskText) ? "ANALYSIS" : "QA";
  const mode = edit ? "EXECUTE" : settings.mode !== "AUTO" ? settings.mode : /按.{0,8}(方向|方案)|第[一二三四五\d]+个|确定|写成|成稿/u.test(content) || edit ? "EXECUTE" : task === "TOPIC" || /多角度|发散|探索|不同.*方案/u.test(content) ? "EXPLORE" : "EXECUTE";
  const depth = /简短|短一点|精简|一句话/u.test(content) ? "BRIEF" : /详细|深入|完整策划/u.test(content) ? "DEEP" : settings.depth === "AUTO" ? ["PLAN", "ANALYSIS"].includes(task) ? "DEEP" : task === "QA" || task === "MESSAGE" ? "BRIEF" : "STANDARD" : settings.depth;
  const naturalness = settings.naturalness === "AUTO" ? ["SCRIPT", "MOMENTS", "MESSAGE"].includes(task) ? "SPOKEN" : "BALANCED" : settings.naturalness;
  const strategies: Record<string, string> = {
    QA: "先直接回答，需要时给理由和例子，不套创作模板。",
    TOPIC: "给可用选题、切入冲突、目标读者与适用场景，不能只换标题。所有虚构开头必须逐个标注‘假设示例’，不可把纸条、聊天记录、群人数等编成用户亲历。招生资格未知时，注明适用于符合官方资格的人，不推断毕业或在职人员可报考。",
    SCRIPT: "完成可直接读出的正文。开头进入具体问题，中间展开观点及有依据的例子，自然收尾。按指定时长组织信息，不能只给提纲；用户要求时才附镜头建议。",
    MOMENTS: "围绕一个真实场景或明确观点写可发布的朋友圈。招生内容说清适合谁及已提供的课程信息；课程流程未提供时，不替机构承诺具体教学安排。避免制造焦虑、虚构成绩和硬塞口号，不默认附配图或策划说明。",
    MESSAGE: "面向一个收件人写自然私信，目的明确、尊重对方，避免群发宣传腔与重复寒暄。",
    PLAN: "展开目标、人群、内容安排、步骤、交付物与检查办法；关键未知标明，不伪造预算或效果。",
    ANALYSIS: "展开结论、证据、解释、局限与可执行建议，区分事实和判断，不能只给空泛总结。",
    EDIT: "仅执行本轮修改，保留事实、身份、已选方向及未要求修改的内容，不顺手重构全文。用户仅要一个开头时只给开头，不默认附时长、解释或续写。",
  };
  const count = settings.divergence === "WIDE" ? 5 : settings.divergence === "FOCUSED" ? 2 : 3;
  const instruction = `【本轮创作策略】\n任务=${task}；模式=${mode}；深度=${depth}；表达=${naturalness}。\n${strategies[task]}\n${mode === "EXPLORE" ? `默认提供${count}个实质不同的角度，用户指定数量优先。每个方向在叙事视点、情绪立场、目标人群和内容结构中至少改变两个维度；说明适用场景并给具体开头，不能用同义换词冒充发散。` : "完成已确定的方向，不再附无关方案或要求用户重新选择。"}\n${depth === "DEEP" ? "充分展开必要论证和执行细节，不重复观点，不强制最低字数。" : depth === "BRIEF" ? "凝练交付，仍保留所有必需交付物。" : "完整交付正文与必要配套，不用过短概括代替成果。"}\n${naturalness === "SPOKEN" ? "像这个身份与具体的人说话，句子长短有变化，术语准确；不反复加口头禅，不机械转折、无意义排比或总结升华。具体细节只能来自真实输入，未知场景可作明确建议，不能写成亲历事件。" : naturalness === "PROFESSIONAL" ? "清楚专业，保留行业术语，用事实支撑，避免宣传腔。" : "自然清楚，表达具体，避免模板化套话。"}\n${settings.persona ? `表达身份（写作角色，不代表已验证履历）：${JSON.stringify(settings.persona)}。保持称谓视角一致，不编造资历、成绩或经历。` : "无明确身份时不编造职位或经历。"}\n本轮明确要求优先于默认策略。`;
  return { ...settings, task, mode, depth, naturalness, maxCompletionTokens: { BRIEF: 1600, STANDARD: 3600, DEEP: 6000 }[depth], temperature: mode === "EXPLORE" ? 0.85 : task === "EDIT" ? 0.3 : 0.65, instruction };
}
export function paragraphScope(body: string, request: string) {
  const match = request.match(/(?:只|仅)(?:修改|改|润色)?第([一二三四五六七八九十\d]+)段/u) ?? (!/不要|别改|保持.*不变/u.test(request) ? request.match(/(?:把|修改|改|润色|精简|优化|缩短)(?:一下)?第([一二三四五六七八九十\d]+)段/u) : null);
  if (!match) return null;
  const number = Number(match[1]) || "一二三四五六七八九十".indexOf(match[1]!) + 1;
  const parts = [...body.matchAll(/\r?\n\r?\n/u.test(body) ? /[^\r\n]+(?:\r?\n(?!\r?\n)[^\r\n]+)*/gu : /[^\r\n]+/gu)];
  const part = parts[number - 1];
  if (!part) throw new Error("指定段落不存在，请选择要修改的正文。");
  return { start: part.index!, end: part.index! + part[0].length };
}
export function mergeLocalEdit(body: string, scope: { start: number; end: number }, replacement: string) {
  if (scope.start < 0 || scope.end <= scope.start || scope.end > body.length || !replacement.trim()) throw new Error("局部范围无效或没有有效正文。");
  return body.slice(0, scope.start) + replacement.replace(/^新版本[：:]\s*/u, "").trim() + body.slice(scope.end);
}
