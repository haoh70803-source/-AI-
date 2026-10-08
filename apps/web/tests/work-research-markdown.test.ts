import { describe, expect, it } from "vitest";
import { workResearchMarkdown, workResearchMarkdownFilename } from "../components/research/work-research-markdown";
import { sampleAnswer, sampleEvidence } from "./work-research-fixture";

const report = () => ({ runId: "run-1", sessionId: "session-1", version: 2, saved: true, finishedAt: "2026-09-28T12:00:00Z", model: "DEEPSEEK / deepseek-flash",
  accountName: "真实账号", evidence: structuredClone(sampleEvidence), answer: sampleAnswer(), origin: "http://localhost:3017" });

describe("Markdown export from a completed work research snapshot", () => {
  it("includes dynamic structure, exact evidence, mechanisms and transfer conditions", () => {
    const markdown = workResearchMarkdown(report());
    expect(markdown).toContain("# 作品深度拆解｜怎样解决真实问题");
    expect(markdown).toContain("### 02 · 实际演示（00:06–00:12）");
    expect(markdown).toContain("> 接着演示操作");
    expect(markdown).toContain("### 注意力维持 · 问题到操作");
    expect(markdown).toContain("必须补充的自有证据：**自己的真实操作和结果");
    expect(markdown).toContain("值得测试的变量：**比较先提问题与先展示结果两种开头");
    expect(markdown).toContain("证据指纹：`" + sampleEvidence.fingerprint + "`");
    expect(markdown).toContain("/research/results/run/run-1");
  });
  it("exports the saved version without inventing timecodes or absent mechanisms", () => {
    const input = report();
    input.saved = false; input.evidence.segments = []; input.answer.mechanisms = [];
    input.answer.structureBlocks = input.answer.structureBlocks.map(block => ({ ...block, startMs: null, endMs: null }));
    const markdown = workResearchMarkdown(input);
    expect(markdown).toContain("/research/session/session-1#run-run-1");
    expect(markdown).not.toContain("（00:");
    expect(markdown).toContain("当前证据没有支持可单独归纳的内容机制");
  });
  it("keeps external text from becoming HTML and creates a safe .md filename", () => {
    const input = report(); input.evidence.title = "<script>alert(1)</script>\\视频:研究?";
    const markdown = workResearchMarkdown(input);
    expect(markdown).toContain("&lt;script&gt;");
    expect(markdown).not.toContain("<script>");
    const filename = workResearchMarkdownFilename(input.evidence.title, 2);
    expect(filename).toMatch(/^作品深度拆解-.*-第2版\.md$/u);
    expect(filename).not.toMatch(/[\\/:*?"<>|]/u);
  });
});
