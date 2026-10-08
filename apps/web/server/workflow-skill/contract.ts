import { z } from "zod";

export const WORKFLOW_SKILL_OUTPUT_TYPES = ["ORAL_VIDEO_SCRIPT", "TEXT"] as const;
export type WorkflowSkillOutputType = (typeof WORKFLOW_SKILL_OUTPUT_TYPES)[number];

export const workflowSkillContractSchema = z.object({
  contractVersion: z.literal("workflow-skill-v1"),
  rawMarkdown: z.string().max(100_000).optional(),
  name: z.string().trim().min(1).max(200),
  outputType: z.enum(WORKFLOW_SKILL_OUTPUT_TYPES),
  scenarios: z.array(z.string().trim().min(1).max(300)).min(1).max(8),
  systemInputs: z.array(z.string().trim().min(1).max(500)).min(1).max(20),
  userInputs: z.array(z.string().trim().min(1).max(500)).min(1).max(20),
  preconditions: z.array(z.string().trim().min(1).max(500)).min(1).max(20),
  steps: z.array(z.string().trim().min(1).max(500)).min(1).max(8),
  judgementRules: z.array(z.string().trim().min(1).max(500)).min(1).max(20),
  expressionRules: z.array(z.string().trim().min(1).max(500)).min(1).max(20),
  prohibitions: z.array(z.string().trim().min(1).max(500)).min(1).max(20),
  outputRequirements: z.array(z.string().trim().min(1).max(500)).min(1).max(20),
  factBoundary: z.array(z.string().trim().min(1).max(500)).min(1).max(20),
  sourceType: z.enum(["EXTERNAL_GPT", "HISTORICAL_DRAFT", "BENCHMARK_RESEARCH", "INTERNAL_METHOD", "IP_STRATEGIST_REFERENCE"]),
  sourceNote: z.string().trim().min(1).max(2_000),
  references: z.array(z.string().trim().min(1).max(2_000)).max(20),
  examples: z.object({ input: z.string().max(20_000).optional(), output: z.string().max(40_000).optional() }).strict().nullable(),
}).strict();

export type WorkflowSkillContract = z.infer<typeof workflowSkillContractSchema>;

export class WorkflowSkillParseError extends Error {
  constructor(readonly issues: string[]) {
    super("这个创作方法还不能导入。");
    this.name = "WorkflowSkillParseError";
  }
}

const requiredSections = ["基本信息", "适用场景", "输入要求", "执行步骤", "判断规则", "表达规则", "禁止事项", "输出要求", "事实边界", "来源说明"] as const;

function sectionMap(markdown: string) {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const sections = new Map<string, string[]>();
  let current = "";
  for (const line of lines) {
    const heading = line.match(/^##\s+(.+?)\s*$/u)?.[1]?.trim();
    if (heading) {
      current = heading;
      if (sections.has(current)) throw new WorkflowSkillParseError(["「" + current + "」重复出现。"]);
      sections.set(current, []);
      continue;
    }
    if (current) sections.get(current)!.push(line);
  }
  return { lines, sections };
}

function nonEmpty(lines: string[]) {
  return lines.map((line) => line.trim()).filter(Boolean);
}

function list(lines: string[], label: string, numbered = false) {
  const values = nonEmpty(lines)
    .map((line) => {
      const match = numbered ? line.match(/^\d+[.)]\s+(.+)$/u) : line.match(/^[-*]\s+(.+)$/u);
      return match?.[1] ?? "";
    })
    .filter(Boolean)
    .map((value) => value.trim());
  if (!values.length) throw new WorkflowSkillParseError(["缺少「" + label + "」内容。"]);
  return values;
}

function subsections(lines: string[]) {
  const result = new Map<string, string[]>();
  let current = "";
  for (const line of lines) {
    const heading = line.match(/^###\s+(.+?)\s*$/u)?.[1]?.trim();
    if (heading) {
      current = heading;
      result.set(current, []);
      continue;
    }
    if (current) result.get(current)!.push(line);
  }
  return result;
}

function field(lines: string[], name: string) {
  const normalized = lines.map((item) => item.trim().replace(/^[-*]\s+/u, ""));
  const line = normalized.find((item) => item.startsWith(name + "：") || item.startsWith(name + ":"));
  return line?.replace(new RegExp("^" + name + "[：:]\\s*", "u"), "").trim() ?? "";
}

function normalizeOutputType(value: string) {
  const normalized = value.trim().toUpperCase();
  if (normalized === "ORAL_VIDEO_SCRIPT" || /抖音|视频号|短视频|口播/u.test(value)) return "ORAL_VIDEO_SCRIPT" as const;
  throw new WorkflowSkillParseError(["不支持当前输出类型，请使用短视频口播稿。"]);
}

function normalizeSourceType(value: string) {
  const normalized = value.trim().toUpperCase();
  if (["EXTERNAL_GPT", "HISTORICAL_DRAFT", "BENCHMARK_RESEARCH", "INTERNAL_METHOD", "IP_STRATEGIST_REFERENCE"].includes(normalized)) return normalized as WorkflowSkillContract["sourceType"];
  throw new WorkflowSkillParseError(["来源类型不受支持，请填写 EXTERNAL_GPT、HISTORICAL_DRAFT、BENCHMARK_RESEARCH、INTERNAL_METHOD 或 IP_STRATEGIST_REFERENCE。"]);
}

function requiredSection(sections: Map<string, string[]>, name: string) {
  const value = sections.get(name);
  if (!value) throw new WorkflowSkillParseError(["缺少「" + name + "」章节。"]);
  return value;
}

export function parseWorkflowSkill(markdown: string): WorkflowSkillContract {
  if (!markdown.trim()) throw new WorkflowSkillParseError(["请先选择或粘贴 Markdown 创作方法。"]);
  const { lines, sections } = sectionMap(markdown);
  const title = lines.find((line) => /^#\s+/.test(line) && !/^##\s+/.test(line))?.replace(/^#\s+/, "").trim() ?? "";
  const name = title.replace(/^创作方法[：:]\s*/u, "").trim();
  const issues: string[] = [];
  if (!name) issues.push("缺少方法名称。");
  for (const section of requiredSections) if (!sections.has(section)) issues.push("缺少「" + section + "」章节。");
  if (issues.length) throw new WorkflowSkillParseError(issues);

  const basic = requiredSection(sections, "基本信息");
  const contractVersion = field(basic, "契约版本");
  if (contractVersion !== "workflow-skill-v1") issues.push("契约版本必须是 workflow-skill-v1。");
  const outputTypeValue = field(basic, "输出类型");
  let outputType: WorkflowSkillOutputType = "ORAL_VIDEO_SCRIPT";
  try { outputType = normalizeOutputType(outputTypeValue); } catch (error) { if (error instanceof WorkflowSkillParseError) issues.push(...error.issues); }

  const inputSections = subsections(requiredSection(sections, "输入要求"));
  const systemInputs = inputSections.get("系统自动提供") ? list(inputSections.get("系统自动提供")!, "系统自动提供") : ["无"];
  const userInputs = inputSections.get("用户补充") ? list(inputSections.get("用户补充")!, "用户补充") : ["无"];
  const preconditions = inputSections.get("前置条件") ? list(inputSections.get("前置条件")!, "前置条件") : ["无"];
  const sourceLines = requiredSection(sections, "来源说明");
  const sourceTypeValue = field(sourceLines, "来源类型");
  let sourceType: WorkflowSkillContract["sourceType"] = "EXTERNAL_GPT";
  try { sourceType = normalizeSourceType(sourceTypeValue); } catch (error) { if (error instanceof WorkflowSkillParseError) issues.push(...error.issues); }
  const sourceNote = field(sourceLines, "来源说明");
  if (!sourceNote) issues.push("「来源说明」不能为空。");
  const references = sourceLines.filter((line) => /^(?:-|\*)\s*(?:引用|references?)[：:]/iu.test(line.trim())).map((line) => line.replace(/^(?:-|\*)\s*(?:引用|references?)[：:]\s*/iu, "").trim()).filter(Boolean);

  const examples = sections.has("示例") ? (() => {
    const exampleSections = subsections(sections.get("示例")!);
    return { input: nonEmpty(exampleSections.get("输入示例") ?? []).join("\n") || undefined, output: nonEmpty(exampleSections.get("输出示例") ?? []).join("\n") || undefined };
  })() : null;
  const candidate = {
    contractVersion: "workflow-skill-v1" as const,
    name,
    outputType,
    scenarios: list(requiredSection(sections, "适用场景"), "适用场景"),
    systemInputs,
    userInputs,
    preconditions,
    steps: list(requiredSection(sections, "执行步骤"), "执行步骤", true),
    judgementRules: list(requiredSection(sections, "判断规则"), "判断规则"),
    expressionRules: list(requiredSection(sections, "表达规则"), "表达规则"),
    prohibitions: list(requiredSection(sections, "禁止事项"), "禁止事项"),
    outputRequirements: list(requiredSection(sections, "输出要求"), "输出要求"),
    factBoundary: list(requiredSection(sections, "事实边界"), "事实边界"),
    sourceType,
    sourceNote,
    references,
    examples,
  };
  const parsed = workflowSkillContractSchema.safeParse(candidate);
  if (!parsed.success) issues.push("方法内容格式不完整，请检查必填章节和列表内容。");
  if (issues.length) throw new WorkflowSkillParseError(issues);
  if (!parsed.success) throw new WorkflowSkillParseError(["方法内容格式不完整，请检查必填章节和列表内容。"]);
  return parsed.data;
}

export function workflowSkillPreview(contract: WorkflowSkillContract) {
  return {
    rawMarkdown: contract.rawMarkdown,
    name: contract.name,
    outputType: contract.outputType,
    scenarios: contract.scenarios,
    preconditions: contract.preconditions,
    steps: contract.steps,
    judgementRules: contract.judgementRules,
    expressionRules: contract.expressionRules,
    prohibitions: contract.prohibitions,
    outputRequirements: contract.outputRequirements,
    factBoundary: contract.factBoundary,
    sourceType: contract.sourceType,
    sourceNote: contract.sourceNote,
    hasExamples: Boolean(contract.examples?.input || contract.examples?.output),
  };
}

/** Import ordinary Markdown losslessly; structured contracts remain compatible. */
export function parseImportedSkill(markdown: string): WorkflowSkillContract {
  if (!markdown.trim() || markdown.length > 100_000 || markdown.includes("\0")) throw new WorkflowSkillParseError(["请选择有效的 Markdown 文件（最多 100,000 字符）。"]);
  if (/^[^\r\n]+\.(?:md|markdown)$/iu.test(markdown.trim())) throw new WorkflowSkillParseError(["这里只有文件名，请点击“选择 .md 文件”读取文件内容，或粘贴正文。"]);
  try { return { ...parseWorkflowSkill(markdown), rawMarkdown: markdown }; } catch (error) { if (!(error instanceof WorkflowSkillParseError)) throw error; }
  const body = markdown.replace(/^\uFEFF/u, "");
  const frontmatter = body.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/u);
  const content = frontmatter ? body.slice(frontmatter[0].length) : body;
  const name = frontmatter?.[1]?.match(/^name:\s*['"]?(.+?)['"]?\s*$/mu)?.[1] || content.match(/^#\s+(.+)$/mu)?.[1] || content.split(/\r?\n/u).find(line => line.trim()) || "导入的 Skill";
  return workflowSkillContractSchema.parse({
    contractVersion: "workflow-skill-v1", rawMarkdown: markdown, name: name.trim().slice(0, 200), outputType: "TEXT",
    scenarios: ["由用户主动选择使用"], systemInputs: ["当前对话及已选择资料"], userInputs: ["当前任务"], preconditions: ["按当前任务使用"],
    steps: [content.trim().slice(0, 480) || "按 Markdown 正文执行"], judgementRules: ["结合当前任务使用原文中的方法"], expressionRules: ["遵循 Skill 正文的表达要求"],
    prohibitions: ["不把示例视为用户事实"], outputRequirements: ["按用户要求和 Skill 正文输出"], factBoundary: ["Skill 是方法指导，不是事实证据"],
    sourceType: "INTERNAL_METHOD", sourceNote: "用户导入 Markdown", references: [], examples: null,
  });
}
