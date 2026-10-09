import type { SourceReference } from "./references";
import type { CanvasObjectDTO } from "./canvas";

export type AssistantSourceDTO = { title: string; type: string; excerpt: string; reference?: SourceReference; citation?: number };

export type AssistantTopicResultItem = { title: string; angle?: string; reason?: string; sourceRefs?: string[] };

export type AssistantCheckResultItem = { originalText: string; issue: string; reason?: string; suggestion?: string; severity?: "HIGH" | "MEDIUM" | "LOW"; sourceRefs?: string[] };

export type AssistantStructuredResult =
  | { type: "TOPIC"; topics: AssistantTopicResultItem[] }
  | { type: "REWRITE"; original: string; aiVersion: string; changeSummary?: string[] }
  | { type: "CHECK"; issues: AssistantCheckResultItem[] }
  | { type: "NEXT_STEP"; recommendedAction: string; reason: string; secondaryActions?: string[] }
  | { type: "TEXT"; content: string };

export type AssistantResultAction = "TEXT" | "TOPIC" | "DRAFT" | "CREATE_ARTIFACT" | "APPLY_ARTIFACT";

export type AssistantMessageDTO = { id: string; role: "USER" | "ASSISTANT"; content: string; status: "PENDING" | "STREAMING" | "COMPLETED" | "FAILED" | "STOPPED"; createdAt: string; artifactId: string | null; sources: AssistantSourceDTO[]; warnings: string[]; resultType: "TEXT" | "TOPIC" | "REWRITE" | "DRAFT" | "CHECK" | "NEXT_STEP"; structuredResult: AssistantStructuredResult | null; actions: AssistantResultAction[] };

export type AssistantThreadDTO = { id: string; messages: AssistantMessageDTO[]; unavailableReason?: string };

export type AssistantExecutionStatusCode = "TASK_READING" | "MEMORY_READING" | "MEMORY_READY" | "TASK_UNDERSTANDING" | "SKILL_POOL_LOADED" | "SKILL_ACTIVATED" | "SKILL_SKIPPED" | "SKILL_CONFLICT" | "AUTO_INVOKE_SUGGESTED" | "GENERATION_STARTED" | "CHECK_STARTED" | "COMPLETED";

export type AssistantExecutionStatus = { code: AssistantExecutionStatusCode; message: string; tone?: "neutral" | "positive" | "warning" };

export type AssistantStreamEvent = { type: "start"; threadId: string; userMessage: AssistantMessageDTO; assistantMessage: AssistantMessageDTO } | { type: "status"; status: AssistantExecutionStatus } | { type: "delta"; messageId: string; delta: string } | { type: "done" | "stopped"; message: AssistantMessageDTO } | { type: "error"; messageId: string; code: string; message: string };

export type NodeAssistantStreamEvent = { type: "start"; threadId: string; generateRunId: string; userMessage: AssistantMessageDTO; assistantMessage: AssistantMessageDTO } | { type: "delta"; messageId: string; delta: string } | { type: "done"; message: AssistantMessageDTO; resultObject: CanvasObjectDTO; relationCount: number } | { type: "stopped"; message: AssistantMessageDTO } | { type: "error"; messageId: string; code: string; message: string };
