import type { z } from "zod";
import { studioQuickActionOutputSchema, type StudioFactState, type StudioQuickAction } from "../ai/schemas";

const hypothetical = /(假设|假如|比如|举个例子|举例来说|示例|模拟场景|如果有一位|如果有一家)/u;
const external = /(对标账号|外部(?:视频|案例|资料)|原视频|该账号|对方|第三方|案例中的)/u;
const firstPersonExperience = /(?:我|我们)(?:自己)?(?:做过|做了|做这|带过|带着|跑过|跑了|验证过|验证了|测试过|测试了|服务过|帮助过|研究过|研究了|从事|干了|拍了|试了|拥有|有个|有一位)|(?:我的|我们的)(?:客户|学员|学校|成绩|收入|成交|转化|项目|案例|经历|数据)/u;
const firstPersonTrackRecord = /(?:我|我们)(?:自己)?(?:做|带|跑|验证|测试|服务|帮助|研究)[^。！？\n]{0,30}(?:年|个月|次|版|团队|客户|项目|结果|咨询|成交|行业)/u;
const numericFact = /(?:\d+(?:\.\d+)?\s*(?:%|％|年|个月|月|天|分钟|次|条|个|位|人|元|万|亿|分|组|家|所|倍|版)|[二三四五六七八九十百千万]+(?:年|个月|分钟|次|位|人|元|万|亿|分|组|家|所|倍|版)|百分之[零一二三四五六七八九十百\d.]+)/u;
const resultClaim = /(稳定带来|稳定出|提升了|增长了|翻倍|已经证明|已经验证|验证有效|取得了|实现了|本质就是|必然|一定能|肯定能)/u;
const promise = /(保证(?:招生|营收|利润|成交|咨询|播放|爆款|回本|结果)|保底(?:结果|效果|增长|转化)|至少不会(?:更差|比原来差|下降|亏)|不会比原来更差|一定能(?:成交|增长|提升|带来)|肯定能(?:成交|增长|提升|带来)|稳定带来(?:咨询|成交|增长)|固定提升(?:百分比|比例|\d))/u;
const numericTokens = /(?:\d+(?:\.\d+)?\s*(?:%|％|年|个月|月|天|分钟|次|条|个|位|人|元|万|亿|分|组|家|所|倍|版)|[二三四五六七八九十百千万]+(?:年|个月|分钟|次|位|人|元|万|亿|分|组|家|所|倍|版)|百分之[零一二三四五六七八九十百\d.]+)/gu;
const experienceTerms = /(教培|教育|校区运营|招生|销售|短视频|直播|产品|项目|客户|学员|学校|成交|转化|收入|成绩|团队)/gu;
const humanizerProtectedTokenPatterns = [
  /(?:19|20)\d{2}(?:年\d{1,2}月\d{1,2}日?|[-/]\d{1,2}[-/]\d{1,2})/gu,
  /\d+(?:\.\d+)?\s*(?:%|％|元|万元|人民币|年|个月|月|日|次|人|家|件|万|亿|倍)/gu,
  /[“"]([^”"]{1,200})[”"]/gu,
  /(?:作者|姓名|人名|归因|引用|由|——|—)\s*([\p{Script=Han}]{2,4}|[A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+)*)/gu,
  /\b[A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+)*\b/gu,
];

function normalize(value: string) { return value.normalize("NFKC").toLocaleLowerCase("zh-CN").replace(/[\s，,。；;：:！？!?、“”‘’（）()《》【】\-—]/gu, ""); }
function unique(values: string[]) { return [...new Set(values.map((value) => value.trim()).filter(Boolean))]; }
export function extractHumanizerFactTokens(text: string) {
  return unique(humanizerProtectedTokenPatterns.flatMap((pattern) => [...text.matchAll(pattern)].map((match) => match[1] || match[0])));
}
export function preserveHumanizerFacts(original: string, replacement: string | null, protectedTokens: string[] = [], needsConfirmation: string[] = []) {
  const required = unique([...extractHumanizerFactTokens(original), ...protectedTokens]);
  const missing = replacement ? required.filter((token) => !replacement.includes(token)) : required;
  return { replacement: missing.length ? null : replacement, missing, needsConfirmation: [...needsConfirmation] };
}
function promiseText(value: string) {
  return value
    .replace(/(?:不|不能|不得|不要|避免)(?:做出|使用|写出|声称)?[^。！？\n]{0,12}(?:保证|保底|必然|一定|稳定带来)/gu, "")
    .replace(/(?:常听到|所谓|不要说|不能说|避免说)[^。！？\n]{0,24}[“"][^”"]*(?:保证|保底|必然|一定|稳定带来)[^”"]*[”"]/gu, "");
}
function matches(value: string, pattern: RegExp) { return [...value.matchAll(pattern)].map(([match]) => normalize(match)); }
function supported(text: string, ownFacts: string[]) {
  const candidate = normalize(text);
  if (ownFacts.some((fact) => { const source = normalize(fact); return source === candidate || (source.length >= 8 && (source.includes(candidate) || candidate.includes(source))); })) return true;
  const terms = matches(text, experienceTerms);
  if (!terms.length) return false;
  const numbers = matches(text, numericTokens);
  return ownFacts.some((fact) => {
    const source = normalize(fact);
    const sharesSubject = terms.some((term) => source.includes(term));
    const supportsPrecision = numbers.every((number) => source.includes(number));
    return sharesSubject && supportsPrecision && (numbers.length > 0 || /(长期|多年|这些年|从事|做过|做了|负责|运营|工作)/u.test(fact));
  });
}

export function downgradeStudioFactText(text: string, ownFacts: string[]) {
  if (supported(text, ownFacts) || (!firstPersonExperience.test(text) && !firstPersonTrackRecord.test(text))) return text;
  const terms = matches(text, experienceTerms);
  const hasBroadSupport = terms.length > 0 && ownFacts.some((fact) => terms.some((term) => normalize(fact).includes(term)) && /(长期|多年|从事|做过|负责|运营|工作)/u.test(fact));
  if (!hasBroadSupport) return text;
  return text.replace(/(?:\d+(?:\.\d+)?|[二三四五六七八九十百千万]+)\s*年/gu, "这些年");
}

export function inspectStudioFactText(text: string, ownFacts: string[]) {
  const hasPromise = promise.test(promiseText(text));
  const hasPersonalExperience = firstPersonExperience.test(text) || firstPersonTrackRecord.test(text);
  // Counts of requested writing elements are not claims about business performance.
  const writingCount = "[一二三四五六七八九十\\d]+(?:\\s*[-–—~～至到]\\s*[一二三四五六七八九十\\d]+)?";
  const writingItem = "(?:标题|选题|标签|卖点|要点|段落|口播稿|文案|备选方案|备选版本)";
  const numberCheck = text.replace(new RegExp(writingCount + "\\s*(?:个|条|项|段|篇|版)\\s*" + writingItem, "gu"), "写作安排")
    .replace(new RegExp(writingItem + "\\s*[:：]?\\s*" + writingCount + "\\s*(?:个|条|项|段|篇|版)", "gu"), "写作安排");
  const adviceNumbers = numberCheck.replace(/(?:建议|可以|不妨|试着|每天|下班或收工前)(?:[^。！？\n]{0,12})?(?:留|花|用|预留|安排)\s*\d+\s*分钟/gu, "时间安排");
  const hasNumber = numericFact.test(adviceNumbers);
  const hasResultClaim = resultClaim.test(text);
  const hasSupport = supported(text, ownFacts);
  const isHypothetical = hypothetical.test(text);
  const isExternal = external.test(text);
  let state: StudioFactState = "CREATIVE_EXPRESSION";
  if (hasSupport) state = "CONFIRMED_OWN_FACT";
  else if (isExternal) state = "EXTERNAL_FACT";
  else if (isHypothetical) state = "HYPOTHETICAL";
  else if (hasPersonalExperience || hasNumber || hasResultClaim) state = "UNVERIFIED_JUDGMENT";
  const reasons = [
    ...(hasPromise ? ["包含经营结果承诺"] : []),
    ...(!hasSupport && !isHypothetical && !isExternal && hasPersonalExperience ? ["包含无来源的第一人称经历"] : []),
    ...(!hasSupport && !isHypothetical && !isExternal && hasNumber ? ["包含无来源的具体数字"] : []),
    ...(!hasSupport && !isHypothetical && !isExternal && hasResultClaim ? ["把未验证判断写成已经有效"] : []),
  ];
  return { state, blocked: hasPromise || state === "UNVERIFIED_JUDGMENT", reasons };
}

function sentences(text: string) { return text.split(/(?<=[。！？!?])|\n+/u).map((item) => item.trim()).filter(Boolean); }

function inspectPassage(text: string, ownFacts: string[]) {
  const results = sentences(text).map((sentence) => inspectStudioFactText(sentence, ownFacts));
  const blocked = results.some((result) => result.blocked);
  const reasons = [...new Set(results.flatMap((result) => result.reasons))];
  const state = results.find((result) => result.state === "CONFIRMED_OWN_FACT")?.state
    ?? results.find((result) => result.state === "EXTERNAL_FACT")?.state
    ?? results.find((result) => result.state === "HYPOTHETICAL")?.state
    ?? "CREATIVE_EXPRESSION";
  return { state, blocked, reasons };
}

export function deterministicFactRisks(text: string, ownFacts: string[]) {
  return sentences(text).flatMap((sentence) => {
    const result = inspectStudioFactText(sentence, ownFacts);
    if (!result.blocked) return [];
    return [{ text: `“${sentence.slice(0, 60)}${sentence.length > 60 ? "…" : ""}”需要核实`, handling: `${result.reasons.join("、")}。补充真实来源，或改成明确的示例、假设或待验证表达。` }];
  }).filter((item, index, all) => all.findIndex((candidate) => candidate.text === item.text) === index);
}

export function sanitizeStudioQuickActionOutput(action: StudioQuickAction, value: z.infer<typeof studioQuickActionOutputSchema>, ownFacts: string[], hasOwnEvidence = ownFacts.length > 0) {
  const removed: Array<{ text: string; handling: string }> = [];
  let suggestions = value.suggestions.flatMap((item) => {
    const next = { title: downgradeStudioFactText(item.title, ownFacts), text: downgradeStudioFactText(item.text, ownFacts) };
    const result = inspectPassage(`${next.title}\n${next.text}`, ownFacts);
    if (result.blocked && action === "TOPIC_IDEAS" && !result.reasons.includes("包含经营结果承诺")) {
      removed.push({ text: `候选“${next.title}”需要补充依据`, handling: `${result.reasons.join("、")}。这个选题仍可作为待补证据方向，但不能直接写成我方事实。` });
      return [{ ...next, factState: "UNVERIFIED_JUDGMENT" as const }];
    }
    if (result.blocked) { removed.push({ text: `候选“${next.title}”包含未确认事实`, handling: `${result.reasons.join("、")}，已阻止进入可应用候选。` }); return []; }
    return [{ ...next, factState: result.state }];
  });
  const downgradedReplacement = value.replacement ? downgradeStudioFactText(value.replacement, ownFacts) : null;
  const replacementCheck = downgradedReplacement ? inspectPassage(downgradedReplacement, ownFacts) : null;
  const preserved = action === "HUMANIZE_TEXT"
    ? preserveHumanizerFacts(value.original, downgradedReplacement, ownFacts.flatMap(extractHumanizerFactTokens))
    : { replacement: downgradedReplacement, missing: [], needsConfirmation: [] };
  const replacement = replacementCheck?.blocked || preserved.missing.length ? null : preserved.replacement;
  if (replacementCheck?.blocked) removed.push({ text: "完整改写包含未确认事实", handling: `${replacementCheck.reasons.join("、")}，已阻止应用。` });
  if (preserved.missing.length) removed.push({ text: "润色候选缺少原稿事实", handling: `候选稿缺少${preserved.missing.slice(0, 4).join("、")}，已阻止应用。` });

  if (action === "ADD_CASE" && !hasOwnEvidence) suggestions = [{ title: "补充一个真实案例", text: "这里需要补一个真实案例：\n起点：\n问题：\n动作：\n过程：\n结果：", factState: "HYPOTHETICAL" as const }];
  if (action === "STRENGTHEN_EVIDENCE" && !hasOwnEvidence) suggestions = [{ title: "补充真实证据", text: "这里最好补充一项真实资料：真实咨询记录、真实客户反馈、前后流程、产品界面或已确认数据。", factState: "CREATIVE_EXPRESSION" as const }];
  if (action === "FACT_CHECK") {
    const risks = deterministicFactRisks(value.original, ownFacts);
    return { ...value, summary: risks.length ? `发现 ${risks.length} 处需要核实的事实或承诺。` : "当前未发现明显事实风险。", suggestions: [], replacement: null, replacementFactState: null, risks, factSafety: { removedSuggestions: value.suggestions.length, blockedReplacement: Boolean(value.replacement) } };
  }
  return { ...value, suggestions, replacement, replacementFactState: replacementCheck?.state ?? null, risks: [...removed, ...value.risks], factSafety: { removedSuggestions: value.suggestions.length - suggestions.length, blockedReplacement: Boolean(value.replacement && !replacement) } };
}
