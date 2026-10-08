export type SourceOverlap = { sourceIndex: number; fragment: string; characters: number };

function comparable(value: string) {
  return value.replace(/[\s\p{P}\p{S}]/gu, "");
}

export function findSourceOverlaps(draft: string, sources: string[], options: { minimumCharacters?: number; maximumMatches?: number; maximumWindow?: number } = {}): SourceOverlap[] {
  const minimumCharacters = options.minimumCharacters ?? 18;
  const maximumMatches = options.maximumMatches ?? 5;
  const maximumWindow = options.maximumWindow ?? 64;
  const normalizedDraft = comparable(draft);
  const matches: SourceOverlap[] = [];
  for (const [sourceIndex, source] of sources.entries()) {
    const normalizedSource = comparable(source);
    for (let size = Math.min(maximumWindow, normalizedDraft.length); size >= minimumCharacters; size -= 1) {
      let found = "";
      for (let start = 0; start + size <= normalizedDraft.length; start += 1) {
        const candidate = normalizedDraft.slice(start, start + size);
        if (normalizedSource.includes(candidate)) { found = candidate; break; }
      }
      if (found) {
        if (!matches.some((match) => match.fragment.includes(found) || found.includes(match.fragment))) matches.push({ sourceIndex, fragment: found, characters: found.length });
        break;
      }
    }
    if (matches.length >= maximumMatches) break;
  }
  return matches;
}
