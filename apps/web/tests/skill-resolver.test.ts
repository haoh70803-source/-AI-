import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { resolveSkillPoolDryRun, resolveSkillPoolWithModel, type SkillMetadata } from "../server/ai/skill-resolver";

function skill(overrides: Partial<SkillMetadata> = {}): SkillMetadata {
  return {
    id: "skill-a",
    displayName: "老板表达",
    description: "帮助组织老板表达",
    roleHints: ["creation"],
    outputHints: ["标题 + 正文"],
    canAutoInvoke: false,
    requiresUserIntent: true,
    version: 1,
    enabled: true,
    source: "SELECTED",
    ...overrides,
  };
}

describe("Skill Resolver dry run", () => {
  it("uses the default method only as fallback when no Skill is selected", () => {
    const result = resolveSkillPoolDryRun({ taskType: "GENERAL_QUERY", selectedSkills: [], defaultFallback: skill({ id: "default", displayName: "默认方法", source: "DEFAULT_FALLBACK", requiresUserIntent: false }) });
    expect(result.dryRun).toBe(true);
    expect(result.activatedSkills.map(({ id }) => id)).toEqual(["default"]);
    expect(result.skippedSkills).toEqual([]);
  });

  it("skips the default fallback when a selected Skill is loaded", () => {
    const result = resolveSkillPoolDryRun({ taskType: "GENERATE", selectedSkills: [skill()], defaultFallback: skill({ id: "default", displayName: "默认方法", source: "DEFAULT_FALLBACK", requiresUserIntent: false }) });
    expect(result.activatedSkills.map(({ id }) => id)).toEqual(["skill-a"]);
    expect(result.skippedSkills).toEqual([{ id: "default", displayName: "默认方法", reason: "当前任务已经加载用户 Skill，默认方法仅作为 fallback，本次不完整叠加。" }]);
  });

  it("activates multiple compatible Skills without a cardinality rule", () => {
    const result = resolveSkillPoolDryRun({ taskType: "GENERATE", selectedSkills: [skill(), skill({ id: "skill-b", displayName: "品牌表达", source: "SELECTED", roleHints: ["style"] })] });
    expect(result.activatedSkills.map(({ id }) => id)).toEqual(["skill-a", "skill-b"]);
    expect(result.conflicts).toEqual([]);
  });

  it("records a declared conflict and lets an explicit short-form request win", () => {
    const result = resolveSkillPoolDryRun({
      taskType: "GENERATE",
      userTask: "控制在 60 秒，直接一点",
      selectedSkills: [
        skill({ id: "long", displayName: "详细展开", outputHints: ["详细展开"], conflictsWith: ["short"] }),
        skill({ id: "short", displayName: "60 秒精简", outputHints: ["60 秒精简"], conflictsWith: ["long"] }),
      ],
    });
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0]?.resolution).toContain("用户当前的短内容要求优先");
    expect(result.needsUserConfirmation).toBe(false);
  });

  it("records an inappropriate selected Skill with a product-language reason", () => {
    const result = resolveSkillPoolDryRun({ taskType: "REVIEW", userTask: "不要写长文", selectedSkills: [skill({ whenNotToUse: ["不要写长文"] })] });
    expect(result.activatedSkills).toEqual([]);
    expect(result.skippedSkills[0]).toMatchObject({ id: "skill-a", reason: expect.stringContaining("不要写长文") });
  });

  it("records an auto-invocation proposal without executing another Skill", () => {
    const result = resolveSkillPoolDryRun({
      taskType: "GENERATE",
      userTask: "检查这篇稿有没有没有依据的话",
      selectedSkills: [skill()],
      availableInternalSkills: [skill({ id: "fact-check", displayName: "事实检查", source: "INTERNAL", roleHints: ["review"], canAutoInvoke: true, requiresUserIntent: false })],
    });
    expect(result.autoInvokedSkills).toEqual([{ id: "fact-check", displayName: "事实检查", reason: "当前任务包含检查或事实核对意图。" }]);
    expect(result.activatedSkills.map(({ id }) => id)).toEqual(["skill-a"]);
  });

  it("accepts a model plan only after deterministic validation", async () => {
    const model = {
      generate: vi.fn(async ({ prompt }: { systemPrompt: string; prompt: string }) => {
        expect(prompt).toContain("contextSummary");
        return {
          activatedSkills: [{ skillId: "skill-a", reason: "用户明确选择了该创作方法。", usageHint: "用于组织表达" }],
          skippedSkills: [],
          autoInvokedSkills: [],
          conflicts: [],
          executionOrderHints: ["skill-a"],
          needsUserConfirmation: false,
        };
      }),
    };
    const result = await resolveSkillPoolWithModel({ taskType: "GENERATE", userTask: "写一段介绍", contextSummary: "当前项目有一份资料", selectedSkills: [skill()] }, model);
    expect(result.resolverMode).toBe("MODEL_ASSISTED_DRY_RUN");
    expect(result.activatedSkills.map(({ id }) => id)).toEqual(["skill-a"]);
    expect(model.generate).toHaveBeenCalledOnce();
  });

  it("validates a model conflict resolution against the loaded Skill IDs", async () => {
    const second = skill({ id: "skill-b", displayName: "品牌表达", source: "SELECTED", roleHints: ["style"] });
    const model = { generate: vi.fn(async () => ({ activatedSkills: [{ skillId: "skill-a", reason: "负责主内容" }, { skillId: "skill-b", reason: "负责表达风格" }], skippedSkills: [], autoInvokedSkills: [], conflicts: [{ skillIds: ["skill-a", "skill-b"], reason: "表达重点不同", resolution: "按用户当前任务合并" }], executionOrderHints: ["skill-a", "skill-b"], needsUserConfirmation: false })) };
    const result = await resolveSkillPoolWithModel({ taskType: "GENERATE", selectedSkills: [skill(), second] }, model);
    expect(result.conflicts).toEqual([{ skillIds: ["skill-a", "skill-b"], reason: "表达重点不同", resolution: "按用户当前任务合并" }]);
    expect(result.executionOrderHints).toEqual(["老板表达", "品牌表达"]);
  });

  it("rejects a model-created Skill ID", async () => {
    const model = { generate: vi.fn(async () => ({ activatedSkills: [{ skillId: "not-loaded", reason: "模型自行添加" }], skippedSkills: [], autoInvokedSkills: [], conflicts: [], executionOrderHints: [], needsUserConfirmation: false })) };
    await expect(resolveSkillPoolWithModel({ taskType: "GENERATE", selectedSkills: [skill()] }, model)).rejects.toMatchObject({ code: "SKILL_RESOLVER_INVALID_OUTPUT" });
  });

  it("rejects auto invocation when the Skill is not eligible", async () => {
    const model = { generate: vi.fn(async () => ({ activatedSkills: [{ skillId: "skill-a", reason: "用户选择" }], skippedSkills: [], autoInvokedSkills: [{ skillId: "review", reason: "需要检查" }], conflicts: [], executionOrderHints: ["skill-a"], needsUserConfirmation: false })) };
    await expect(resolveSkillPoolWithModel({ taskType: "GENERATE", selectedSkills: [skill()], availableInternalSkills: [skill({ id: "review", displayName: "事实检查", source: "INTERNAL", roleHints: ["review"], canAutoInvoke: false, requiresUserIntent: false })] }, model)).rejects.toMatchObject({ code: "SKILL_RESOLVER_INVALID_OUTPUT" });
  });

  it("rejects a Skill outside the current workspace scope", async () => {
    const model = { generate: vi.fn(async () => ({ activatedSkills: [{ skillId: "skill-a", reason: "用户选择" }], skippedSkills: [], autoInvokedSkills: [], conflicts: [], executionOrderHints: ["skill-a"], needsUserConfirmation: false })) };
    await expect(resolveSkillPoolWithModel({ taskType: "GENERATE", workspaceId: "workspace-b", selectedSkills: [skill({ workspaceId: "workspace-a" })] }, model)).rejects.toMatchObject({ code: "SKILL_RESOLVER_INVALID_OUTPUT" });
  });
});
