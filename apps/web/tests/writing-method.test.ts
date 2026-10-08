import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { dedupeWritingMethodBlocks, IP_STRATEGIST_SOURCE, loadMotherContentWritingMethodPack, WRITING_METHOD_CONTEXT_LIMIT, WritingMethodSourceError, type MethodBlock } from "../server/ai/writing-methods/ip-strategist";
import { findSourceOverlaps } from "../server/ai/writing-methods/source-overlap";

const sourceRoot = path.resolve(import.meta.dirname, "../../../vendor/ip-strategist/v2.2.0/references");
const normalizedHashes = {
  "task-script.md": "83EC1687FB160DFE53FE6FC40956152C5228F8E3D53BBE6DE7F4B4940A61B72C",
  "03-脚本骨架.md": "17B947AF24BEA8D7B5023CA9AE7FCA56E9A30701602EBAC6D6B4C6B37ACD573C",
  "04-口播文案.md": "1B3287F95014FC7BF31C5104309BABB4D0A250B68BF250DEEF2CAA87AE935ED1",
} as const;

describe("ip-strategist MotherContent writing method", () => {
  it("keeps the pinned upstream originals and source identity", () => {
    expect(IP_STRATEGIST_SOURCE).toMatchObject({ version: "v2.2.0", commit: "3716c815eb258a55918592b72a92add1cfd12f8b", license: "CC BY-NC 4.0" });
    for (const [file, expected] of Object.entries(normalizedHashes)) {
      const normalized = readFileSync(path.join(sourceRoot, file), "utf8").replace(/\r\n/g, "\n").trimEnd();
      expect(createHash("sha256").update(normalized).digest("hex").toUpperCase()).toBe(expected);
    }
  });

  it("extracts only the approved original sections within the context budget", () => {
    const pack = loadMotherContentWritingMethodPack({ sourceRoot });
    expect(pack.source).toBe("ip-strategist");
    expect(pack.sections).toEqual(expect.arrayContaining([
      "task-script:reference-mechanism-fingerprint",
      "task-script:primary-driving-force",
      "03-脚本骨架:attention-granularity-momentum",
      "04-口播文案:spoken-language-fundamentals",
      "task-script:final-check",
    ]));
    expect(pack.characters).toBeGreaterThanOrEqual(4_000);
    expect(pack.characters).toBeLessThanOrEqual(WRITING_METHOD_CONTEXT_LIMIT);
    expect(pack.context).toContain("叙事机制指纹");
    expect(pack.context).toContain("### 2.6 骨架三大操作意识");
    expect(pack.context).toContain("**5. 短句与意义单元**");
    expect(pack.context).not.toMatch(/contract lifecycle|onboarding|growth|monetization/i);
  });

  it("de-duplicates blocks and fails closed when an anchor or budget is invalid", () => {
    const repeated: MethodBlock = { id: "one", file: "task-script.md", group: "A_REFERENCE_TRANSFORMATION", content: "原文段落" };
    expect(dedupeWritingMethodBlocks([repeated, { ...repeated, id: "two", content: "原文段落\n" }])).toHaveLength(1);
    expect(() => loadMotherContentWritingMethodPack({ sourceRoot, maximumCharacters: 100 })).toThrow(WritingMethodSourceError);
  });

  it("finds long exact source overlap without flagging common short phrases", () => {
    const copied = "这是一段足够长的来源独特表达不应该原样进入新的核心母稿";
    expect(findSourceOverlaps(`开头。${copied}。结尾。`, [`来源前文。${copied}。来源后文。`])).toEqual([expect.objectContaining({ sourceIndex: 0, characters: expect.any(Number) })]);
    expect(findSourceOverlaps("这是一个常见短语", ["来源里也有这是一个"])).toEqual([]);
  });
});
