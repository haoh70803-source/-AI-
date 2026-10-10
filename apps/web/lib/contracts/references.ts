export type ReferenceType = "MATERIAL" | "RESEARCH" | "ARTIFACT" | "BENCHMARK" | "TREND" | "KNOWLEDGE";

export type ResearchSelection = { kind: "run" | "study"; version: number; items: Array<{ id: string; text: string }> };

export type ReferenceScope = "TURN" | "TASK" | "PROJECT";
export type ContextReference = { sourceType: ReferenceType; sourceId: string; researchSelection?: ResearchSelection; scope?: ReferenceScope; sourceVersion?: string | number };
export function referenceScope(reference: ContextReference): ReferenceScope {
  return reference.scope ?? (["ARTIFACT", "RESEARCH"].includes(reference.sourceType) ? "TASK" : "TURN");
}
export function continuingReferences(references: ContextReference[], sameTask: boolean) {
  return references.filter(reference => referenceScope(reference) === "PROJECT" || (sameTask && referenceScope(reference) === "TASK"));
}

export type SourceReference = ContextReference & { title: string; href: string; generated: boolean; version?: string | number; updatedAt?: string; anchor?: string };

export type ReferenceOption = SourceReference & { description: string };

export type ResearchCreationDraft = { id: string; actor: { workspaceId: string; userId: string }; projectId: string; projectTitle: string; workspaceName: string; conversationVisibility: string; expiresAt: number; content: string; reference: ReferenceOption };
