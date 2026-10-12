import { describe, expect, it } from "vitest";
import { paginateContent, pageWindow } from "../lib/content-pagination";

describe("reading pagination", () => {
  it("keeps every character of long prose and limits ordinary pages", () => {
    const content = "第一段。".repeat(2000) + "\n\n尾段不会丢失。";
    const pages = paginateContent(content);
    expect(pages.length).toBeGreaterThan(1);
    expect(pages.join("")).toBe(content);
    expect(pages.every(page => page.length <= 2400)).toBe(true);
    expect(pages.at(-1)).toContain("尾段不会丢失");
  });
  it("keeps tables and fenced code intact, including blank lines", () => {
    const table = "| 列一 | 列二 |\n| --- | --- |\n" + "| 值一 | 值二 |\n".repeat(100);
    const code = "```ts\n" + "console.log('保留');\n\n".repeat(100) + "```\n";
    const content = "介绍。\n\n" + table + "\n" + code + "\n结束。";
    const pages = paginateContent(content, 100);
    expect(pages.join("")).toBe(content);
    expect(pages.some(page => page.includes(table))).toBe(true);
    expect(pages.some(page => page.includes(code))).toBe(true);
  });
  it("does not close a fence with a shorter or different marker", () => {
    const code = "````md\n```\n\n示例\n~~~\n\n````\n";
    expect(paginateContent(code, 8)).toEqual([code]);
  });
  it("does not split Unicode surrogate pairs even at a small size", () => {
    const content = "😀".repeat(40);
    const pages = paginateContent(content, 3);
    expect(pages.join("")).toBe(content);
    expect(pages.every(page => !/^[\uDC00-\uDFFF]|[\uD800-\uDBFF]$/.test(page))).toBe(true);
    expect(paginateContent("😀😀", 1)).toEqual(["😀", "😀"]);
  });
  it("handles empty text and rejects invalid page sizes", () => {
    expect(paginateContent("")).toEqual([""]);
    expect(() => paginateContent("text", 0)).toThrow(RangeError);
  });
});
describe("filtered list windows", () => {
  it("clamps a stale last page after filtering instead of producing a blank list", () => {
    expect(pageWindow(2, 9, 12)).toEqual({ page: 1, pages: 1, start: 0, end: 12 });
    expect(pageWindow(25, 3, 12)).toEqual({ page: 3, pages: 3, start: 24, end: 36 });
    expect(pageWindow(0, 1, 12).page).toBe(1);
  });
});
