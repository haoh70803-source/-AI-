export type BenchmarkPageDecision =
  | { kind: "EXHAUSTED" }
  | { kind: "NEXT"; nextOffset: number }
  | { kind: "PARTIAL"; reason: "CURSOR_UNAVAILABLE" | "PAGE_LIMIT" };

export function decideBenchmarkPage(input: { hasMore: boolean | null; nextOffset?: number | null; currentOffset: number; pageCount: number; maxPages: number }): BenchmarkPageDecision {
  if (input.hasMore === false) return { kind: "EXHAUSTED" };
  if (input.nextOffset === null || input.nextOffset === undefined || !Number.isSafeInteger(input.nextOffset) || input.nextOffset <= input.currentOffset) return { kind: "PARTIAL", reason: "CURSOR_UNAVAILABLE" };
  if (input.pageCount >= input.maxPages) return { kind: "PARTIAL", reason: "PAGE_LIMIT" };
  return { kind: "NEXT", nextOffset: input.nextOffset };
}
