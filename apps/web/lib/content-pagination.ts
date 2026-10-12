/** Reading pages preserve source text. Fenced code and tables stay together. */
export function paginateContent(text: string, size = 2400): string[] {
  if (!Number.isInteger(size) || size < 1) throw new RangeError("Page size must be positive");
  if (!text) return [""];
  const blocks: string[] = [];
  let block = "", fence = "", fenceLength = 0;
  for (const line of text.match(/[^\n]*\n|[^\n]+$/g) ?? []) {
    const marker = line.match(/^ {0,3}(`{3,}|~{3,})/)?.[1];
    block += line;
    if (marker) {
      if (!fence) { fence = marker.charAt(0); fenceLength = marker.length; }
      else if (marker.charAt(0) === fence && marker.length >= fenceLength && /^ {0,3}(?:`+|~+)\s*$/.test(line)) fence = "";
    }
    if (!fence && !line.trim()) { blocks.push(block); block = ""; }
  }
  if (block) blocks.push(block);
  const pages: string[] = [];
  let page = "";
  for (const block of blocks) {
    // Long prose is readable in bounded pages; structured blocks remain intact.
    const atomic = /^(?: {0,3}(?:`{3,}|~{3,})| {4}\S)/m.test(block) || /^ {0,3}\|?.*\|.*\n {0,3}\|?\s*:?-{3,}/m.test(block);
    const parts: string[] = [];
    let rest = block;
    while (!atomic && rest.length > size) {
      let end = size;
      const boundary = rest.slice(0, size).match(/[。！？.!?]\s*[^。！？.!?]*$/u);
      if (boundary && boundary.index! > size / 2) end = boundary.index! + 1;
      if (end < 1) end = size;
      if (/[\uD800-\uDBFF]/u.test(rest.charAt(end - 1))) end = end > 1 ? end - 1 : 2;
      parts.push(rest.slice(0, end)); rest = rest.slice(end);
    }
    parts.push(rest);
    for (const part of parts) {
      if (page && page.length + part.length > size) { pages.push(page); page = ""; }
      page += part;
    }
  }
  if (page) pages.push(page);
  return pages;
}

export function pageWindow(total: number, requested: number, size: number) {
  const pages = Math.max(1, Math.ceil(total / size));
  const page = Math.max(1, Math.min(pages, requested));
  return { page, pages, start: (page - 1) * size, end: page * size };
}
