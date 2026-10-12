import { useState } from "react";
import { StudioDefaultMethod } from "../../components/projects/studio-default-method";
import { createRoot } from "react-dom/client";
import { WorkbenchStart } from "../../components/workbench-start";
import { ArtifactEditor } from "../../components/projects/artifact-editor";
import { useArtifactEditor } from "../../components/projects/use-artifact-editor";
import { VideoAnalyticsWorkspace } from "../../components/video-analytics-workspace";
import { SourceWorkspace } from "../../components/material-detail/source-workspace";
import type { SourceWorkspaceModel } from "../../server/material-detail/read-model";
import { ArtifactWindow } from "../../components/projects/artifact-window";
import { ThemedSelect } from "../../components/themed-select";
import "../../components/app-shell.css";
import "../../components/library/asset-library.css";
import "../../components/research/teardown/teardown.css";
const body = Array.from({ length: 160 }, (_, i) => `## 第 ${i + 1} 节\n\n原始成果的正文，需要完整保存和导出。${"长文本内容。".repeat(20)}\n\n`).join("");
function Editor() {
  const editor = useArtifactEditor({ projectId: "ui-project", canWrite: true, initialArtifact: { artifactId: "ui-artifact", type: "TEXT", title: "分页成果", version: 1, excerpt: "测试", updatedAt: "2026-10-10T00:00:00Z", content: body } });
  return <ArtifactEditor editor={editor} canWrite/>;
}
function Layout() {
  const [expanded, setExpanded] = useState(false);
  return <div className="app-shell" data-shell="v4"><aside className={`xsj-app-sidebar ${expanded ? "is-temporary" : "is-collapsed"}`}><button onClick={() => setExpanded(!expanded)}>切换侧栏</button></aside><main className="app-main"><div className="project-conversation-layout"><aside>项目上下文</aside><section aria-label="项目持续对话"><h2>与鑫小助协作</h2><textarea aria-label="和鑫小助说"/></section><section className="project-material-reference"><header>原始资料</header></section></div><div className="asset-library-preview"><img alt="完整图片" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='300'%3E%3Crect width='100' height='300' fill='skyblue'/%3E%3C/svg%3E"/></div><section className="teardown-workspace"><aside className="teardown-history">拆解历史</aside><p className="teardown-thesis">拆解文字可清晰阅读</p><section className="teardown-report"><blockquote className="is-selected">选中证据</blockquote></section><ThemedSelect aria-label="统一下拉" defaultValue="one"><option value="one">第一项</option><option value="two">第二项</option></ThemedSelect></section></main></div>;
}
const sourceModel: SourceWorkspaceModel = {
  detail: { header: { id: "source-ui", title: "原始文字资料", author: null, publishTime: null, typeLabel: "文本", platformLabel: "本地", durationLabel: null, sourceLabel: "本地", originalUrl: null }, preview: { type: "TEXT", playable: false, mediaUrl: null, coverUrl: null, documentUrl: null, rawTextPreview: "原文", unavailableReason: null }, transcript: { state: "COMPLETE", text: "原始文字稿，不属于成果。", segments: [] }, tags: [] },
  actions: { sourceId: "source-ui", sourceTitle: "原始文字资料", status: "READY", downloadUrl: null, tags: [], availableTags: [], collections: [], availableCollections: [], availableProjects: [], relatedProjects: [], canManageProjects: true },
  workspace: { capabilities: [], understanding: null, assetId: null, mimeType: "text/plain", sizeLabel: "20 B", createdAt: "2026-10-10T00:00:00Z", updatedAt: "2026-10-10T00:00:00Z", transcriptUpdatedAt: "2026-10-10T00:00:00Z", transcriptionError: null, configured: false, busy: false, canRefresh: false, processingLabel: "已完成", metrics: { views: null, likes: null, favorites: null, comments: null, shares: null } }, adminDetails: null,
};
function ArtifactList() { return <ArtifactWindow embedded projectId="ui-project" active={new URLSearchParams(location.search).get("active") ? { artifactId: "artifact-12", type: "TEXT", title: "成果 13", version: 1, excerpt: "示例", updatedAt: "2026-10-10T00:00:00Z", content: "已保存正文" } : null} canWrite onClose={() => {}} onContinue={() => {}} artifacts={Array.from({ length: 13 }, (_, i) => ({ artifactId: `artifact-${i}`, type: "TEXT", title: `成果 ${i + 1}`, version: 1, excerpt: "示例", updatedAt: "2026-10-10T00:00:00Z" }))}/>; }
const mode = new URLSearchParams(location.search).get("fixture");
createRoot(document.getElementById("root")!).render(mode === "chat" ? <div className="dashboard-workbench"><StudioDefaultMethod projectId="ui-project" recommendedActions={[]} editable configured projectMaterials={[]} canvasObjects={[]} methods={{ selected: [], available: [] }} onMethodsChange={() => {}} onClose={() => {}} onObjectCreated={() => {}} /></div> : mode === "home" ? <WorkbenchStart canCreate draftKey="ui-fixture"/> : mode === "analytics" ? <VideoAnalyticsWorkspace initialDemo/> : mode === "analytics-real" ? <VideoAnalyticsWorkspace/> : mode === "editor" ? <Editor/> : mode === "source" ? <SourceWorkspace model={sourceModel}/> : mode === "artifacts" ? <ArtifactList/> : <Layout/>);
