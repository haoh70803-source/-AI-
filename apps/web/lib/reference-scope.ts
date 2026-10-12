import type { ContextReference, ReferenceScope } from "./contracts/references";

export function referenceScope(reference: ContextReference): ReferenceScope {
  return reference.scope ?? (["ARTIFACT", "RESEARCH"].includes(reference.sourceType) ? "TASK" : "TURN");
}

export function continuingReferences(references: ContextReference[], sameTask: boolean) {
  return references.filter(reference => referenceScope(reference) === "PROJECT" || (sameTask && referenceScope(reference) === "TASK"));
}
