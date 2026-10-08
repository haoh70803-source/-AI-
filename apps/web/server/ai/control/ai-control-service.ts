import { ExperienceLimitError } from "@content-center/worker/experience-limits";
import "server-only";

import { db } from "@content-center/db";
import { LLMError, type LLMProvider, type LLMStructuredResult, type ProviderResult } from "@content-center/providers";
import { executeStructuredAIRun } from "../ai-run-service";
import type { ProjectContextBuilder } from "../project-context";
import { ActionPermissionPolicy } from "./action-permission";
import { ContextBuilderV2, type ContextBuilderV2Result } from "./context-builder-v2";
import { AIControlError, type AIControlAction, type AIControlTask, type ContextItem, type ConversationContextMessage, type ModelRouteRequest, type SelectedContextObject, type WorkspaceRoleName } from "./contracts";
import { FactGateV2 } from "./fact-gate-v2";
import { ModelRouter } from "./model-router";
import { ScopeGate } from "./scope-gate";
import type { ContextReference } from "../../assistant/references";
import type { LLMModelSelection } from "../llm-runtime";

type ControlExecutionInput<T> = {
  workspaceId: string;
  userId: string;
  projectId?: string;
  taskType: AIControlTask;
  requestedAction: AIControlAction;
  userInput?: string;
  selectedObjects?: SelectedContextObject[];
  resolvedContextItems?: ContextItem[];
  conversationHistory?: ConversationContextMessage[];
  references?: ContextReference[];
  skillVersionId?: string | null;
  modelSelection?: LLMModelSelection | null;
  historySummary?: string;
  preparedContext?: ContextBuilderV2Result;
  action: Parameters<ProjectContextBuilder["build"]>[0]["action"];
  studioAction?: Parameters<ProjectContextBuilder["build"]>[0]["studioAction"];
  operation: string;
  promptVersion: number;
  modelRequest?: Omit<ModelRouteRequest, "taskType">;
  userConfirmed?: boolean;
  onContext?: (context: ContextBuilderV2Result) => void;
  inputSummary: (context: ContextBuilderV2Result) => unknown;
  metadata?: (context: ContextBuilderV2Result) => Record<string, unknown>;
  auditMetadata?: (context: ContextBuilderV2Result) => Record<string, string | number | boolean>;
  onRunCreated?: (runId: string, context: ContextBuilderV2Result) => Promise<void>;
  generate: (provider: LLMProvider, context: ContextBuilderV2Result) => Promise<ProviderResult<LLMStructuredResult<T>>>;
};

type ControlDependencies = {
  scopeGate?: ScopeGate;
  contextBuilder?: ContextBuilderV2;
  factGate?: FactGateV2;
  permissionPolicy?: ActionPermissionPolicy;
  modelRouter?: ModelRouter;
  roleLoader?: (workspaceId: string, userId: string) => Promise<WorkspaceRoleName | null>;
};

function normalizeProviderError(error: unknown) {
  if (error instanceof ExperienceLimitError) return new AIControlError("RATE_LIMITED", error.message, true);
  if (error instanceof AIControlError) return error;
  if (!(error instanceof LLMError)) return new AIControlError("UNKNOWN", undefined, true);
  if (["KIMI_NOT_CONFIGURED", "KIMI_AUTH_FAILED", "LLM_NOT_CONFIGURED", "LLM_DISABLED", "LLM_AUTH_FAILED", "LLM_SERVER_ERROR", "LLM_GENERATION_FAILED"].includes(error.code)) return new AIControlError("PROVIDER_UNAVAILABLE", undefined, error.retryable);
  if (["KIMI_MODEL_ID_MISSING", "KIMI_MODEL_UNAVAILABLE", "LLM_UNSUPPORTED_INPUT"].includes(error.code)) return new AIControlError("MODEL_UNAVAILABLE", undefined, error.retryable);
  if (error.code === "LLM_CONTEXT_TOO_LARGE") return new AIControlError("NO_CONTEXT");
  if (error.code === "LLM_TIMEOUT") return new AIControlError("TIMEOUT", undefined, true);
  if (error.code === "LLM_RATE_LIMITED") return new AIControlError("RATE_LIMITED", error.message, true);
  if (error.code === "LLM_INVALID_RESPONSE") return new AIControlError("INVALID_OUTPUT", undefined, error.retryable);
  return new AIControlError("UNKNOWN", undefined, error.retryable);
}

export class AIControlService {
  private readonly scopeGate: ScopeGate;
  private readonly contextBuilder: ContextBuilderV2;
  private readonly factGate: FactGateV2;
  private readonly permissionPolicy: ActionPermissionPolicy;
  private readonly modelRouter: ModelRouter;
  private readonly roleLoader: NonNullable<ControlDependencies["roleLoader"]>;

  constructor(dependencies: ControlDependencies = {}) {
    this.scopeGate = dependencies.scopeGate ?? new ScopeGate();
    this.contextBuilder = dependencies.contextBuilder ?? new ContextBuilderV2();
    this.factGate = dependencies.factGate ?? new FactGateV2();
    this.permissionPolicy = dependencies.permissionPolicy ?? new ActionPermissionPolicy();
    this.modelRouter = dependencies.modelRouter ?? new ModelRouter();
    this.roleLoader = dependencies.roleLoader ?? (async (workspaceId, userId) => {
      const member = await db.workspaceMember.findFirst({ where: { workspaceId, userId, disabledAt: null, workspace: { disabledAt: null }, user: { disabledAt: null } }, select: { role: true } });
      return member?.role ?? null;
    });
  }

  async execute<T>(input: ControlExecutionInput<T>) {
    const role = await this.roleLoader(input.workspaceId, input.userId);
    if (!role) throw new AIControlError("PERMISSION_DENIED");
    const scope = this.scopeGate.evaluate(input);
    if (scope.decision === "OUT_OF_SCOPE") throw new AIControlError("OUT_OF_SCOPE", scope.employeeMessage);
    const context = input.preparedContext ?? (input.projectId ? await this.contextBuilder.build({ workspaceId: input.workspaceId, userId: input.userId, projectId: input.projectId, taskType: input.taskType, action: input.action, studioAction: input.studioAction, selectedObjects: input.selectedObjects, resolvedContextItems: input.resolvedContextItems, conversationHistory: input.conversationHistory, references: input.references, skillVersionId: input.skillVersionId, userInput: input.userInput, historySummary: input.historySummary }) : null);
    if (!context) throw new AIControlError("NO_CONTEXT");
    input.onContext?.(context);
    const fact = this.factGate.evaluate({ items: context.manifest.items, ownFacts: context.ownFacts.map(({ text }) => text), instruction: input.userInput });
    if (fact.decision === "BLOCK") throw new AIControlError("FACT_BLOCKED");
    const permission = this.permissionPolicy.evaluate({ role, action: input.requestedAction, userConfirmed: input.userConfirmed });
    if (permission.decision !== "ALLOW") throw new AIControlError("PERMISSION_DENIED", permission.decision === "REQUIRE_CONFIRMATION" ? "这个操作需要你明确确认后才能继续。" : undefined);
    const route = await this.modelRouter.route(input.workspaceId, { taskType: input.taskType, structuredOutput: true, ...input.modelRequest }, input.modelSelection);
    const warningSummary = fact.warnings.join("；");
    const controlMetadata = {
      aiControlVersion: "ai-control-v1",
      taskType: input.taskType,
      actionType: input.requestedAction,
      scopeDecision: scope.decision,
      factDecision: fact.decision,
      permissionDecision: permission.decision,
      contextManifestRef: `airun-metadata:${context.manifest.manifestId}`,
      contextManifest: context.manifest,
      sourceRefs: context.manifest.sourceRefs,
      warningSummary,
      modelRoute: route.receipt,
    };
    try {
      const run = await executeStructuredAIRun({
        workspaceId: input.workspaceId,
        userId: input.userId,
        projectId: input.projectId,
        action: input.action,
        operation: input.operation,
        promptVersion: input.promptVersion,
        inputSummary: input.inputSummary(context),
        metadata: { ...(input.metadata?.(context) ?? {}), ...controlMetadata },
        auditMetadata: { ...(input.auditMetadata?.(context) ?? {}), aiControlVersion: "ai-control-v1", taskType: input.taskType, actionType: input.requestedAction, contextManifestId: context.manifest.manifestId, warningCount: fact.warnings.length },
        contextTruncated: context.contextTruncated,
        onRunCreated: input.onRunCreated ? (runId) => input.onRunCreated!(runId, context) : undefined,
        generate: (provider) => input.generate(provider, context),
      }, { runtime: route.runtime });
      return { ...run, control: { scope, fact, permission, manifestId: context.manifest.manifestId, route: route.receipt } };
    } catch (error) {
      throw normalizeProviderError(error);
    }
  }
}
