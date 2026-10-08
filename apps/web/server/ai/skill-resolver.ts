import "server-only";

import { z } from "zod";

export type SkillRoleHint = "creation" | "transform" | "review" | "style" | "analysis" | "planning";
export type SkillMetadataSource = "SELECTED" | "DEFAULT_FALLBACK" | "INTERNAL";
export type SkillResolverMode = "DETERMINISTIC_DRY_RUN" | "MODEL_ASSISTED_DRY_RUN" | "MODEL_ASSISTED_ACTIVE";

export type SkillMetadata = {
  id: string;
  displayName: string;
  description?: string;
  whenToUse?: string[];
  whenNotToUse?: string[];
  capabilities?: string[];
  inputHints?: string[];
  outputHints?: string[];
  roleHints?: SkillRoleHint[];
  conflictsWith?: string[];
  worksWellWith?: string[];
  priorityHints?: string[];
  factBoundary?: string[];
  canAutoInvoke: boolean;
  requiresUserIntent: boolean;
  version: number | string | null;
  enabled: boolean;
  authorized?: boolean;
  workspaceId?: string | null;
  source: SkillMetadataSource;
};

export type SkillResolution = {
  dryRun: true;
  resolverMode: SkillResolverMode;
  loadedSkills: Array<Pick<SkillMetadata, "id" | "displayName" | "version" | "source">>;
  activatedSkills: Array<Pick<SkillMetadata, "id" | "displayName" | "version" | "source"> & { reason?: string; usageHint?: string }>;
  skippedSkills: Array<{ id: string; displayName: string; reason: string }>;
  autoInvokedSkills: Array<{ id: string; displayName: string; reason: string }>;
  conflicts: Array<{ skillIds: string[]; reason: string; resolution: string }>;
  executionOrderHints: string[];
  outputHints: string[];
  needsUserConfirmation: boolean;
};

export type SkillResolverInput = {
  taskType: string;
  userTask?: string | null;
  contextSummary?: string | null;
  workspaceId?: string | null;
  selectedSkills: SkillMetadata[];
  availableInternalSkills?: SkillMetadata[];
  defaultFallback?: SkillMetadata | null;
};

export type SkillResolverModel = {
  generate(input: { systemPrompt: string; prompt: string }): Promise<unknown>;
};

export const skillResolutionModelPlanSchema = z.object({
  activatedSkills: z.array(z.object({ skillId: z.string().min(1), reason: z.string().min(1).max(240), usageHint: z.string().max(240).optional() })).max(32),
  skippedSkills: z.array(z.object({ skillId: z.string().min(1), reason: z.string().min(1).max(240) })).max(32),
  autoInvokedSkills: z.array(z.object({ skillId: z.string().min(1), reason: z.string().min(1).max(240) })).max(32),
  conflicts: z.array(z.object({ skillIds: z.array(z.string().min(1)).min(2).max(8), reason: z.string().min(1).max(240), resolution: z.string().min(1).max(240) })).max(32),
  executionOrderHints: z.array(z.string().min(1)).max(32),
  needsUserConfirmation: z.boolean(),
}).strict();

export class SkillResolverGuardError extends Error {
  readonly code = "SKILL_RESOLVER_INVALID_OUTPUT";
}

function normalized(value: string) {
  return value.trim().toLocaleLowerCase("zh-CN");
}

function matchesReference(skill: SkillMetadata, reference: string) {
  const value = normalized(reference);
  return value === normalized(skill.id) || value === normalized(skill.displayName);
}

function summary(skill: SkillMetadata) {
  return { id: skill.id, displayName: skill.displayName, version: skill.version, source: skill.source };
}

function taskMentionsShortForm(task: string) {
  return /60\s*秒|精简|短一点|更短|短文案/u.test(task);
}

function roleOrder(skill: SkillMetadata) {
  const roles = skill.roleHints ?? [];
  if (roles.includes("creation")) return 1;
  if (roles.includes("analysis")) return 2;
  if (roles.includes("style") || roles.includes("transform")) return 3;
  if (roles.includes("review")) return 4;
  return 5;
}

export function resolveSkillPoolDryRun(input: SkillResolverInput): SkillResolution {
  const selected = input.selectedSkills.filter((skill) => skill.enabled && skill.authorized !== false);
  const defaultFallback = input.defaultFallback?.enabled && input.defaultFallback.authorized !== false ? input.defaultFallback : null;
  const loaded = [...selected, ...(defaultFallback ? [defaultFallback] : [])];
  const task = input.userTask?.trim() ?? "";
  const activated = [...selected];
  const skipped: SkillResolution["skippedSkills"] = [];
  const conflicts: SkillResolution["conflicts"] = [];
  const autoInvoked: SkillResolution["autoInvokedSkills"] = [];
  const needsUserConfirmation = selected.some((skill) => skill.requiresUserIntent && !task);

  if (defaultFallback) {
    if (selected.length) {
      skipped.push({ id: defaultFallback.id, displayName: defaultFallback.displayName, reason: "当前任务已经加载用户 Skill，默认方法仅作为 fallback，本次不完整叠加。" });
    } else {
      activated.push(defaultFallback);
    }
  }

  for (const skill of selected) {
    const notUse = (skill.whenNotToUse ?? []).find((hint: string) => task && task.includes(hint));
    if (notUse) {
      const index = activated.findIndex(({ id }) => id === skill.id);
      if (index >= 0) activated.splice(index, 1);
      skipped.push({ id: skill.id, displayName: skill.displayName, reason: `当前任务与该 Skill 的不适用条件接近：${notUse}` });
    }
  }

  for (let index = 0; index < selected.length; index += 1) {
    for (const other of selected.slice(index + 1)) {
      const current = selected[index]!;
      const declaredConflict = current.conflictsWith?.some((value) => matchesReference(other, value)) || other.conflictsWith?.some((value) => matchesReference(current, value));
      const shortFormConflict = taskMentionsShortForm(task) && (current.outputHints ?? []).some((hint) => /详细|长文|展开/u.test(hint)) && (other.outputHints ?? []).some((hint) => /短|精简|60/u.test(hint));
      if (declaredConflict || shortFormConflict) {
        conflicts.push({
          skillIds: [current.id, other.id],
          reason: shortFormConflict ? "一个 Skill 倾向完整展开，另一个 Skill 倾向短内容。" : "Skill metadata 声明了潜在冲突。",
          resolution: taskMentionsShortForm(task) ? "用户当前的短内容要求优先，建议压缩执行。" : "Dry Run 记录冲突，正式执行前由 Agent 判断是否需要确认。",
        });
      }
    }
  }

  for (const skill of input.availableInternalSkills ?? []) {
    const inWorkspace = !input.workspaceId || !skill.workspaceId || skill.workspaceId === input.workspaceId;
    if (!skill.enabled || skill.authorized === false || !inWorkspace || !skill.canAutoInvoke || selected.some(({ id }) => id === skill.id) || !task) continue;
    const reviewRelevant = (skill.roleHints ?? []).includes("review") && /检查|事实|依据|风险|核对/u.test(task);
    if (reviewRelevant) autoInvoked.push({ id: skill.id, displayName: skill.displayName, reason: "当前任务包含检查或事实核对意图。" });
  }

  const effective = activated.sort((a, b) => roleOrder(a) - roleOrder(b));
  const outputHints = [...new Set(effective.flatMap((skill) => skill.outputHints ?? []))];
  return {
    dryRun: true,
    resolverMode: "DETERMINISTIC_DRY_RUN",
    loadedSkills: loaded.map(summary),
    activatedSkills: effective.map(summary),
    skippedSkills: skipped,
    autoInvokedSkills: autoInvoked,
    conflicts,
    executionOrderHints: effective.map(({ displayName }) => displayName),
    outputHints,
    needsUserConfirmation: needsUserConfirmation || conflicts.some(({ resolution }) => resolution.includes("需要确认")),
  };
}

function knownSkillMap(input: SkillResolverInput) {
  return new Map([...(input.availableInternalSkills ?? []), ...(input.defaultFallback ? [input.defaultFallback] : []), ...input.selectedSkills].map((skill) => [skill.id, skill]));
}

function guardSkillId(id: string, known: Map<string, SkillMetadata>, field: string, input: SkillResolverInput) {
  const skill = known.get(id);
  if (!skill || !skill.enabled || skill.authorized === false) throw new SkillResolverGuardError(`${field} 包含未知、未授权或未启用的 Skill：${id}`);
  if (input.workspaceId && skill.workspaceId && skill.workspaceId !== input.workspaceId) throw new SkillResolverGuardError(`${field} 包含越过 Workspace 边界的 Skill：${id}`);
  return skill;
}

function guardAutoInvoke(id: string, input: SkillResolverInput, known: Map<string, SkillMetadata>) {
  const skill = guardSkillId(id, known, "autoInvokedSkills", input);
  const internal = (input.availableInternalSkills ?? []).some(({ id: candidateId }) => candidateId === id);
  if (!internal || !skill.canAutoInvoke || skill.requiresUserIntent) throw new SkillResolverGuardError(`Skill 不满足自动调用条件：${id}`);
  return skill;
}

export function guardSkillResolution(input: SkillResolverInput, modelPlan: z.infer<typeof skillResolutionModelPlanSchema>): SkillResolution {
  const base = resolveSkillPoolDryRun(input);
  const known = knownSkillMap(input);
  const selectedOrFallback = new Set([...input.selectedSkills, ...(input.defaultFallback ? [input.defaultFallback] : [])].map(({ id }) => id));
  const activatedSkills = modelPlan.activatedSkills.map(({ skillId, reason, usageHint }) => {
    const skill = guardSkillId(skillId, known, "activatedSkills", input);
    if (!selectedOrFallback.has(skillId)) throw new SkillResolverGuardError(`activatedSkills 不能激活未加载的 Skill：${skillId}`);
    return { ...summary(skill), reason, ...(usageHint ? { usageHint } : {}) };
  });
  const skippedSkills = modelPlan.skippedSkills.map(({ skillId, reason }) => {
    const skill = guardSkillId(skillId, known, "skippedSkills", input);
    return { id: skill.id, displayName: skill.displayName, reason };
  });
  const autoInvokedSkills = modelPlan.autoInvokedSkills.map(({ skillId, reason }) => {
    const skill = guardAutoInvoke(skillId, input, known);
    return { id: skill.id, displayName: skill.displayName, reason };
  });
  const conflicts = modelPlan.conflicts.map(({ skillIds, reason, resolution }) => {
    skillIds.forEach((skillId) => guardSkillId(skillId, known, "conflicts", input));
    return { skillIds, reason, resolution };
  });
  const executionOrderHints = modelPlan.executionOrderHints.map((skillId) => guardSkillId(skillId, known, "executionOrderHints", input).displayName);
  const decidedIds = new Set([...activatedSkills.map(({ id }) => id), ...skippedSkills.map(({ id }) => id)]);
  for (const skill of [...input.selectedSkills, ...(input.defaultFallback ? [input.defaultFallback] : [])]) {
    if (skill.enabled && skill.authorized !== false && !decidedIds.has(skill.id)) throw new SkillResolverGuardError(`模型未说明已加载 Skill 的处理结果：${skill.id}`);
  }
  const requiresUserConfirmation = input.selectedSkills.some(({ requiresUserIntent, enabled, authorized }) => requiresUserIntent && enabled && authorized !== false && !input.userTask?.trim());
  return {
    ...base,
    resolverMode: "MODEL_ASSISTED_DRY_RUN",
    activatedSkills,
    skippedSkills,
    autoInvokedSkills,
    conflicts,
    executionOrderHints,
    outputHints: [...new Set(activatedSkills.flatMap(({ id }) => known.get(id)?.outputHints ?? []))],
    needsUserConfirmation: modelPlan.needsUserConfirmation || requiresUserConfirmation || conflicts.some(({ resolution }) => resolution.includes("需要确认")),
  };
}

export async function resolveSkillPoolWithModel(input: SkillResolverInput, model: SkillResolverModel): Promise<SkillResolution> {
  const availableSkills = [...input.selectedSkills, ...(input.defaultFallback ? [input.defaultFallback] : []), ...(input.availableInternalSkills ?? [])].map(({ id, displayName, description, roleHints, capabilities, outputHints, canAutoInvoke, requiresUserIntent, source, version }) => ({ id, displayName, description, roleHints, capabilities, outputHints, canAutoInvoke, requiresUserIntent, source, version }));
  const modelOutput = await model.generate({
    systemPrompt: "你是 Skill Resolver。只返回产品层面的执行计划，不输出思维过程，不执行 Skill，不生成内容。只能使用输入中存在且已授权的 Skill ID。",
    prompt: JSON.stringify({ taskType: input.taskType, userTask: input.userTask ?? "", contextSummary: input.contextSummary ?? "", selectedSkillIds: input.selectedSkills.map(({ id }) => id), availableSkills }),
  });
  const parsed = skillResolutionModelPlanSchema.safeParse(modelOutput);
  if (!parsed.success) throw new SkillResolverGuardError("模型返回的 Skill 执行计划不符合安全结构。");
  return guardSkillResolution(input, parsed.data);
}

export function selectedMethodMetadata(input: { id: string; title: string; version: number; steps: string[]; applicableScenarios: string[]; boundaries: string[]; workspaceId?: string | null; workflowContract?: { outputRequirements?: string[]; scenarios?: string[]; prohibitions?: string[] } | null }): SkillMetadata {
  const contract = input.workflowContract;
  return {
    id: input.id,
    displayName: input.title,
    description: input.steps[0],
    whenToUse: input.applicableScenarios,
    capabilities: ["creation"],
    outputHints: contract?.outputRequirements ?? [],
    roleHints: ["creation"],
    factBoundary: [...input.boundaries, ...(contract?.prohibitions ?? [])],
    canAutoInvoke: false,
    requiresUserIntent: true,
    version: input.version,
    enabled: true,
    authorized: true,
    workspaceId: input.workspaceId,
    source: "SELECTED",
  };
}

export function defaultMethodMetadata(input: { id: string; title: string; version: number; workspaceId?: string | null; sections?: Array<{ code: string; items: Array<{ text: string }> }> }): SkillMetadata {
  return {
    id: input.id,
    displayName: input.title,
    description: input.sections?.flatMap(({ items }) => items.map(({ text }) => text))[0],
    capabilities: ["general-content-guidance"],
    roleHints: ["creation", "style"],
    outputHints: [],
    canAutoInvoke: false,
    requiresUserIntent: false,
    version: input.version,
    enabled: true,
    authorized: true,
    workspaceId: input.workspaceId,
    source: "DEFAULT_FALLBACK",
  };
}
