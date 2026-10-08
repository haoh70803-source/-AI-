export type ReferenceScope = { sourceItemIds: ReadonlySet<string>; evidenceIds: ReadonlySet<string> };
export type ReferenceIdPayload = { evidenceIds?: string[]; sourceItemIds?: string[] };

function records(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function ids(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): string[] => {
    if (typeof item === "string") return [item];
    if (!item || typeof item !== "object") return [];
    const id = (item as Record<string, unknown>).id;
    return typeof id === "string" ? [id] : [];
  });
}

export function referenceScopeFromContext(context: unknown): ReferenceScope {
  const root = records(context);
  const external = records(root.externalReferences);
  const materials = ids(external.materials).concat(ids(root.sources));
  const evidence = ids(external.evidence).concat(ids(root.evidence));
  return { sourceItemIds: new Set(materials), evidenceIds: new Set(evidence) };
}

export function sanitizeReferenceIds<T extends ReferenceIdPayload>(value: T, scope: ReferenceScope) {
  const evidenceIds = (value.evidenceIds ?? []).filter((id) => scope.evidenceIds.has(id));
  const sourceItemIds = (value.sourceItemIds ?? []).filter((id) => scope.sourceItemIds.has(id));
  return {
    value: { ...value, evidenceIds, sourceItemIds } as T,
    droppedEvidenceIds: (value.evidenceIds ?? []).filter((id) => !scope.evidenceIds.has(id)),
    droppedSourceItemIds: (value.sourceItemIds ?? []).filter((id) => !scope.sourceItemIds.has(id)),
  };
}
