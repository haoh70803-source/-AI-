import "server-only";

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

export const IP_STRATEGIST_SOURCE = {
  repository: "erduo1998-cell/ip-strategist",
  version: "v2.2.0",
  commit: "3716c815eb258a55918592b72a92add1cfd12f8b",
  license: "CC BY-NC 4.0",
} as const;

export const WRITING_METHOD_CONTEXT_LIMIT = 8_000;

type SourceFile = "task-script.md" | "03-脚本骨架.md" | "04-口播文案.md";
type MethodGroup = "A_REFERENCE_TRANSFORMATION" | "B_NARRATIVE_STRATEGY" | "C_SPOKEN_EXPRESSION" | "D_FINAL_CHECK";

export type MethodBlock = {
  id: string;
  file: SourceFile;
  group: MethodGroup;
  content: string;
};

export type MotherContentWritingMethodPack = {
  source: "ip-strategist";
  version: "v2.2.0";
  sections: string[];
  context: string;
  characters: number;
  estimatedTokens: number;
};

export class WritingMethodSourceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WritingMethodSourceError";
  }
}

function sourceRoot(explicitRoot?: string) {
  const candidates = explicitRoot
    ? [explicitRoot]
    : [
        path.join(process.cwd(), "vendor", "ip-strategist", "v2.2.0", "references"),
        path.join(process.cwd(), "..", "..", "vendor", "ip-strategist", "v2.2.0", "references"),
      ];
  const resolved = candidates.find((candidate) => existsSync(path.join(candidate, "task-script.md")));
  if (!resolved) throw new WritingMethodSourceError("IP_STRATEGIST_SOURCE_NOT_FOUND");
  return resolved;
}

function readSources(explicitRoot?: string): Record<SourceFile, string> {
  const root = sourceRoot(explicitRoot);
  const read = (file: SourceFile) => {
    const filePath = path.join(root, file);
    if (!existsSync(filePath)) throw new WritingMethodSourceError(`IP_STRATEGIST_FILE_NOT_FOUND:${file}`);
    return readFileSync(filePath, "utf8").replace(/\r\n/g, "\n");
  };
  return {
    "task-script.md": read("task-script.md"),
    "03-脚本骨架.md": read("03-脚本骨架.md"),
    "04-口播文案.md": read("04-口播文案.md"),
  };
}

function extractHeading(markdown: string, heading: string) {
  const lines = markdown.split("\n");
  const start = lines.findIndex((line) => line.trim() === heading);
  if (start < 0) throw new WritingMethodSourceError(`IP_STRATEGIST_HEADING_NOT_FOUND:${heading}`);
  const level = heading.match(/^#+/)?.[0].length;
  if (!level) throw new WritingMethodSourceError(`IP_STRATEGIST_INVALID_HEADING:${heading}`);
  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    const nextLevel = lines[index]?.match(/^(#+)\s/)?.[1]?.length;
    if (nextLevel && nextLevel <= level) { end = index; break; }
  }
  return lines.slice(start, end).join("\n").trim();
}

function extractBetween(markdown: string, startAnchor: string, endAnchor: string) {
  const start = markdown.indexOf(startAnchor);
  if (start < 0) throw new WritingMethodSourceError(`IP_STRATEGIST_ANCHOR_NOT_FOUND:${startAnchor}`);
  const end = markdown.indexOf(endAnchor, start + startAnchor.length);
  if (end < 0) throw new WritingMethodSourceError(`IP_STRATEGIST_ANCHOR_NOT_FOUND:${endAnchor}`);
  return markdown.slice(start, end).trim();
}

export function dedupeWritingMethodBlocks(blocks: MethodBlock[]) {
  const seen = new Set<string>();
  return blocks.filter((block) => {
    const canonical = block.content.replace(/\s+/g, " ").trim();
    if (!canonical || seen.has(canonical)) return false;
    seen.add(canonical);
    return true;
  });
}

export function loadMotherContentWritingMethodPack(options: { sourceRoot?: string; maximumCharacters?: number } = {}): MotherContentWritingMethodPack {
  const files = readSources(options.sourceRoot);
  const blocks = dedupeWritingMethodBlocks([
    {
      id: "task-script:reference-mechanism-fingerprint",
      file: "task-script.md",
      group: "A_REFERENCE_TRANSFORMATION",
      content: extractBetween(files["task-script.md"], "用户给出高数据稿", "## 决策路径"),
    },
    {
      id: "task-script:minimal-topic-judgment",
      file: "task-script.md",
      group: "B_NARRATIVE_STRATEGY",
      content: extractHeading(files["task-script.md"], "### 1. 再做最小判题"),
    },
    {
      id: "task-script:primary-driving-force",
      file: "task-script.md",
      group: "B_NARRATIVE_STRATEGY",
      content: extractHeading(files["task-script.md"], "### 2. 选择一条推进动力"),
    },
    {
      id: "03-脚本骨架:attention-granularity-momentum",
      file: "03-脚本骨架.md",
      group: "B_NARRATIVE_STRATEGY",
      content: extractHeading(files["03-脚本骨架.md"], "### 2.6 骨架三大操作意识"),
    },
    {
      id: "task-script:write-like-a-person",
      file: "task-script.md",
      group: "C_SPOKEN_EXPRESSION",
      content: extractHeading(files["task-script.md"], "### 3. 写成人话"),
    },
    {
      id: "04-口播文案:spoken-language-fundamentals",
      file: "04-口播文案.md",
      group: "C_SPOKEN_EXPRESSION",
      content: extractHeading(files["04-口播文案.md"], "### A. 把字写成人话：语言基本功"),
    },
    {
      id: "04-口播文案:spoken-minimum-criteria",
      file: "04-口播文案.md",
      group: "C_SPOKEN_EXPRESSION",
      content: extractHeading(files["04-口播文案.md"], "### 最低判据（念出声三句）"),
    },
    {
      id: "task-script:final-check",
      file: "task-script.md",
      group: "D_FINAL_CHECK",
      content: extractHeading(files["task-script.md"], "## 交付前自检"),
    },
  ]);
  const labels: Record<MethodGroup, string> = {
    A_REFERENCE_TRANSFORMATION: "A. Reference Transformation",
    B_NARRATIVE_STRATEGY: "B. Narrative Strategy",
    C_SPOKEN_EXPRESSION: "C. Spoken Expression",
    D_FINAL_CHECK: "D. Final Check",
  };
  const context = (Object.keys(labels) as MethodGroup[])
    .map((group) => `## ${labels[group]}\n\n${blocks.filter((block) => block.group === group).map((block) => block.content).join("\n\n")}`)
    .join("\n\n")
    .trim();
  const maximumCharacters = options.maximumCharacters ?? WRITING_METHOD_CONTEXT_LIMIT;
  if (context.length > maximumCharacters) throw new WritingMethodSourceError(`IP_STRATEGIST_CONTEXT_OVER_BUDGET:${context.length}:${maximumCharacters}`);
  return {
    source: "ip-strategist",
    version: "v2.2.0",
    sections: blocks.map((block) => block.id),
    context,
    characters: context.length,
    estimatedTokens: Math.ceil(context.length / 2),
  };
}
