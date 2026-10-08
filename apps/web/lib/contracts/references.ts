export type ReferenceType = "MATERIAL" | "RESEARCH" | "ARTIFACT" | "BENCHMARK" | "TREND" | "KNOWLEDGE";

export type ResearchSelection = { kind: "run" | "study"; version: number; items: Array<{ id: string; text: string }> };

export type ContextReference = { sourceType: ReferenceType; sourceId: string; researchSelection?: ResearchSelection };

export type SourceReference = ContextReference & { title: string; href: string; generated: boolean; version?: string | number; updatedAt?: string; anchor?: string };

export type ReferenceOption = SourceReference & { description: string };

export type ResearchCreationDraft = { id: string; actor: { workspaceId: string; userId: string }; projectId: string; projectTitle: string; workspaceName: string; conversationVisibility: string; expiresAt: number; content: string; reference: ReferenceOption };
