import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { employeeSourceMeta } from "../lib/content-labels";

describe("Phase 9D project materials utility panel contract", () => {
  it("maps source enums to employee language and omits generic platform names", () => {
    expect(employeeSourceMeta("TEXT", "GENERIC")).toBe("文字资料");
    expect(employeeSourceMeta("IMAGE", "XIAOHONGSHU")).toBe("图片 · 小红书");
    expect(employeeSourceMeta("LINK", "DOUYIN")).toBe("链接 · 抖音");
  });

  it("uses only current project source fields without rawText or a second asset API", async () => {
    const [panel, pageData] = await Promise.all([
      readFile(new URL("../components/projects/project-materials-panel.tsx", import.meta.url), "utf8"),
      readFile(new URL("../server/workbench-page-data.ts", import.meta.url), "utf8"),
    ]);
    expect(pageData).toContain("sourceItem.tags.map");
    expect(pageData).toContain("addedAt: addedAt.toISOString()");
    expect(panel).toContain("source.summary || source.description || \"尚未整理摘要\"");
    expect(panel).not.toContain("rawText");
    expect(panel).toContain("/library/${source.id}");
  });

  it("supports debounced search, real type and tag filters, sorting, and two local views", async () => {
    const panel = await readFile(new URL("../components/projects/project-materials-panel.tsx", import.meta.url), "utf8");
    expect(panel).toContain(")), 220)");
    expect(panel).toContain('aria-label="资料类型"');
    expect(panel).toContain('aria-label="资料标签"');
    expect(panel).toContain("最近加入");
    expect(panel).toContain("最早加入");
    expect(panel).toContain("按名称");
    expect(panel).toContain("project-materials-view:v1");
  });

  it("uses the existing reference endpoint and preserves the viewport after drop", async () => {
    const canvas = await readFile(new URL("../components/projects/content-canvas.tsx", import.meta.url), "utf8");
    expect(canvas).toContain("PROJECT_MATERIAL_DRAG_TYPE");
    expect(canvas).toContain("addProjectMaterial(source, payload, event.clientX, event.clientY)");
    expect(canvas).toContain("createFreeObject(payload.kind, source, payload.sourceAssetId, true)");
    expect(canvas).toContain("3_000");
    expect(canvas).toContain("setSelectedObjectId(result.object.id)");
    expect(canvas).toContain("open={materialsOpen}");
    expect(canvas).not.toContain("setMaterialsOpen(false); await createFreeObject");
  });

  it("keeps Viewer browsing available while disabling drag and add", async () => {
    const panel = await readFile(new URL("../components/projects/project-materials-panel.tsx", import.meta.url), "utf8");
    expect(panel).toContain("draggable={editable}");
    expect(panel).toContain("disabled={!editable}");
    expect(panel).toContain("当前权限可以查看资料，但不能向画布添加引用。");
  });
});
