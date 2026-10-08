import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("UX Reset V1 canvas UI contract", () => {
  it("keeps the default canvas real-object-first and only shows a real draft surface", async () => {
    const canvas = await readFile(new URL("../components/projects/content-canvas.tsx", import.meta.url), "utf8");
    expect(canvas).toContain("return [...draftNodes, ...objectNodes]");
    expect(canvas).toContain("const hasDraft = Boolean(draft.characters > 0 || draft.body.trim())");
    expect(canvas).toContain("return hasDraft ? [{ ...draftNode");
    expect(canvas).not.toContain("const systemNodes");
    expect(canvas).not.toContain("AI 建议");
    expect(canvas).toContain("nodes.filter((node) => node.type === \"card\")");
    expect(canvas).toContain("edges={relationEdges}");
    expect(canvas).toContain('className: "canvas-generated-edge"');
  });

  it("supports direct text editing, 600ms autosave, recovery and scoped shortcuts without workflow chrome", async () => {
    const [canvas, freeNode] = await Promise.all([
      readFile(new URL("../components/projects/content-canvas.tsx", import.meta.url), "utf8"),
      readFile(new URL("../components/projects/canvas-free-node.tsx", import.meta.url), "utf8"),
    ]);
    expect(canvas).toContain("window.setTimeout(() => void flushTextRef.current(objectId), 600)");
    expect(canvas).toContain("canvas-text-recovery:");
    expect(canvas).toContain("expectedContentVersion");
    expect(canvas).toContain("expectedLayoutVersion");
    expect(canvas).toContain("event.target instanceof HTMLElement");
    expect(freeNode).toContain('aria-label="文本内容"');
    expect(freeNode).not.toContain("NodeResizer");
    expect(freeNode).not.toContain("canvas-node-plus");
    expect(freeNode).toContain("canvas-material-heading");
  });

  it("keeps context behind a compact bar and offers only real canvas additions", async () => {
    const canvas = await readFile(new URL("../components/projects/content-canvas.tsx", import.meta.url), "utf8");
    expect(canvas).toContain("CanvasContextBar");
    expect(canvas).toContain('label: "添加内容"');
    expect(canvas).toContain('kind: "material", title: "项目资料"');
    expect(canvas).not.toContain('kind: "suggestion", title: "AI 建议"');
    expect(canvas).not.toContain('kind: "brief", title: "创作目标"');
  });

  it("uses the shared result renderer and employee-facing interaction contract", async () => {
    const [assistant, renderer, service, materials] = await Promise.all([
      readFile(new URL("../components/projects/studio-default-method.tsx", import.meta.url), "utf8"),
      readFile(new URL("../components/projects/assistant-result-renderer.tsx", import.meta.url), "utf8"),
      readFile(new URL("../server/assistant/service.ts", import.meta.url), "utf8"),
      readFile(new URL("../components/projects/project-materials-panel.tsx", import.meta.url), "utf8"),
    ]);
    expect(assistant).toContain("AssistantResultRenderer");
    expect(renderer).toContain("assistant-topic-result");
    expect(renderer).toContain("assistant-rewrite-result");
    expect(renderer).toContain("assistant-check-result");
    expect(renderer).toContain("assistant-next-step-result");
    expect(renderer).toContain("assistant-topic-primary");
    expect(renderer).toContain("assistant-topic-secondary");
    expect(renderer).toContain("onTopicSave");
    expect(service).toContain("structuredResult");
    expect(service).toContain('type: "NEXT_STEP"');
    expect(materials).toContain('event.key === "Escape"');
    expect(materials).toContain('role="dialog"');
  });
});
