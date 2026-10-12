import type { WorkDeepAnswer, WorkEvidence } from "@/server/research/work-research-contract";

export type WorkResearchReport = {
  runId: string;
  sessionId: string;
  version: number;
  saved: boolean;
  finishedAt: string;
  model: string | null;
  accountName: string;
  evidence: WorkEvidence;
  answer: WorkDeepAnswer;
  origin: string;
};

const kindLabel = { ATTENTION: "注意力维持", PROOF: "可信度建立", EXPRESSION: "表达方式", OTHER: "其他内容机制" } as const;
const fieldLabel: Record<string, string> = { audience: "面向谁", situation: "使用场景", problem: "用户问题", beliefChange: "希望改变的认知", promise: "内容承诺", coreClaim: "核心观点", desiredOutcome: "希望观众得到什么",
  domain: "领域", theme: "内容母题", angle: "切入角度", informationGap: "信息缺口", intent: "内容意图" };
const time = (ms: number) => `${String(Math.floor(ms / 60000)).padStart(2, "0")}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}`;
const day = (value: string | null) => value ? new Date(value).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }) : "未提供";
function safeUrl(value: string | null) {
  if (!value) return null;
  try { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password ? url.toString().replaceAll(">", "%3E") : null; }
  catch { return null; }
}

function markdownText(value: string) {
  return value.replace(/\r\n?/gu, "\n").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replace(/(^|\n)(#{1,6}\s|[-*+]\s|\d+\.\s)/gu, (_match, prefix: string, marker: string) => `${prefix}\\${marker}`);
}
function quote(value: string, ref: string) {
  return [`**依据 [${ref}]：**`, ...markdownText(value).split("\n").map(line => `> ${line}`), ""].join("\n");
}
function fields(value: Record<string, unknown>, excluded: string[]) {
  return Object.entries(value).flatMap(([key, item]) => !excluded.includes(key) && typeof item === "string" && item.trim() ? [`- **${fieldLabel[key] || key}：**${markdownText(item)}`] : []);
}
export function workResearchMarkdown(report: WorkResearchReport) {
  const { evidence, answer } = report;
  const lines: string[] = [
    `# 作品深度拆解｜${markdownText(evidence.title)}`, "",
    `- 账号（当前名称）：${markdownText(report.accountName)}；账号 ID：\`${evidence.accountId}\``,
    `- 作品 ID：\`${evidence.workId}\`；研究 Run：\`${report.runId}\`；版本：${report.version}`,
    `- 研究完成：${day(report.finishedAt)}；证据采集：${day(evidence.capturedAt)}`,
    `- 分析模型：${markdownText(report.model || "未记录")}`,
    `- 正文来源：${({ TRANSCRIPT: "机器文字稿", EXTRACTED_TEXT: "已提取或人工补充的文字", SOURCE_UNDERSTANDING: "视觉理解文字" })[evidence.contentOrigin || "EXTRACTED_TEXT"]}`,
    `- 证据指纹：\`${evidence.fingerprint}\`；正文版本：\`${markdownText(evidence.contentVersion || "未记录")}\``,
    `- 作品发布时间：${day(evidence.publishedAt)}；平台指标观察：${day(evidence.observedAt)}`,
    ...(safeUrl(evidence.url) ? [`- 原作品：<${safeUrl(evidence.url)}>`] : []),
    ...(evidence.sourceItemId ? [`- 资料：<${report.origin}/library/${encodeURIComponent(evidence.sourceItemId)}>`] : []),
    report.saved ? `- 已保存结果：<${report.origin}/research/results/run/${encodeURIComponent(report.runId)}>`
      : `- 研究记录：<${report.origin}/research/session/${encodeURIComponent(report.sessionId)}#run-${encodeURIComponent(report.runId)}>`, "",
    "## 一、我看懂了它", "", markdownText(answer.understanding.about), "", markdownText(answer.summary), "",
    ...fields(answer.understanding, ["about", "citation"]), "", quote(answer.understanding.citation.quote, answer.understanding.citation.ref),
    "## 二、为什么选这个题", "", markdownText(answer.topicIdea.whyThisTopic), "",
    ...fields(answer.topicIdea, ["whyThisTopic", "citation"]), "", quote(answer.topicIdea.citation.quote, answer.topicIdea.citation.ref),
    "## 三、内容怎样推进", "",
  ];
  for (const block of answer.structureBlocks) {
    lines.push(`### ${String(block.order).padStart(2, "0")} · ${markdownText(block.role)}${block.startMs !== null && block.endMs !== null ? `（${time(block.startMs)}–${time(block.endMs)}）` : ""}`, "",
      markdownText(block.content), "", `- **这一段的作用：**${markdownText(block.purpose)}`,
      ...(block.expression ? [`- **表达方式：**${markdownText(block.expression)}`] : []), "", quote(block.citation.quote, block.citation.ref));
  }
  lines.push("## 四、内容机制", "");
  if (!answer.mechanisms.length) lines.push("当前证据没有支持可单独归纳的内容机制。", "");
  for (const mechanism of answer.mechanisms) {
    lines.push(`### ${kindLabel[mechanism.kind]} · ${markdownText(mechanism.name)}`, "", markdownText(mechanism.description), "",
      ...(mechanism.claim ? [`- **作品中的主张：**${markdownText(mechanism.claim)}`] : []),
      ...(mechanism.proof ? [`- **作品提供的证明：**${markdownText(mechanism.proof)}`] : []),
      `- **研究假设：**${markdownText(mechanism.hypothesis)}`, `- **边界：**${markdownText(mechanism.limitation)}`, "", quote(mechanism.citation.quote, mechanism.citation.ref));
  }
  lines.push("## 五、可以迁移什么", "", `### ${markdownText(answer.transferable.principle)}`, "", markdownText(answer.transferable.why), "",
    ...answer.transferable.steps.map((step, index) => `${index + 1}. ${markdownText(step)}`), "",
    `- **适用条件：**${markdownText(answer.transferable.applicability)}`,
    `- **必须补充的自有证据：**${markdownText(answer.transferable.ownEvidenceNeeded)}`,
    `- **原作品不能照搬：**${answer.transferable.surfaceElements.map(markdownText).join("、") || "原人物、案例和措辞"}`,
    `- **值得测试的变量：**${markdownText(answer.transferable.testVariable)}`,
    `- **适用边界：**${markdownText(answer.transferable.limitation)}`, "", quote(answer.transferable.citation.quote, answer.transferable.citation.ref),
    "## 六、研究边界", "", ...answer.limitations.map(item => `- ${markdownText(item)}`),
    ...(evidence.truncated ? ["- 本次证据较长，研究只读取了快照中明确保存的部分。"] : []),
    ...(evidence.contentOrigin === "TRANSCRIPT" ? ["- 正文来自机器转写，错字、漏句和专有名词仍需对照视频核查。"] : []),
    "- 没有实际观看留存或转化数据；有关注意力与效果的表述是研究假设。", "",
    "## 来源说明", "", "- [W1] 研究时保存的作品标题和公开元数据。",
    ...(evidence.sourceItemId ? [`- [M1] 研究时保存的资料文字摘录，资料 ID：\`${evidence.sourceItemId}\`。`] : []),
    "- 本报告来自已保存的研究版本；之后原作品、指标或文字稿发生变化，不会改写这份报告。", "",
  );
  return lines.join("\n");
}

export function workResearchMarkdownFilename(title: string, version: number) {
  const safe = [...title].map(char => /[\\/:*?"<>|]/u.test(char) || char.charCodeAt(0) < 32 ? "-" : char).join("").replace(/[.\s]+$/gu, "").trim().slice(0, 72) || "作品";
  return `作品深度拆解-${safe}-第${version}版.md`;
}
