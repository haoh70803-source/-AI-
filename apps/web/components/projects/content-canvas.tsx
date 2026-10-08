"use client";

import "@xyflow/react/dist/style.css";
import {
  Background,
  BackgroundVariant,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useNodesState,
  useReactFlow,
  useViewport,
  type Node,
  type Edge,
  type NodeProps,
  type Viewport,
} from "@xyflow/react";
import {
  ArrowLeft,
  BookOpenCheck,
  Columns3,
  FileText,
  FolderOpen,
  Grid2X2,
  Hand,
  ImageIcon,
  LayoutGrid,
  Link2,
  Map as MapIcon,
  Maximize2,
  Minus,
  MousePointer2,
  PencilLine,
  Plus,
  Rows3,
  Redo2,
  Settings2,
  ShieldCheck,
  Sparkles,
  Target,
  Undo2,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
  type ReactNode,
} from "react";
import { CanvasFreeNode, FreeNodeActionsProvider, type CanvasSaveState, type FreeCanvasNode } from "./canvas-free-node";
import { PROJECT_MATERIAL_DRAG_TYPE, ProjectMaterialsPanel, type ProjectMaterial, type ProjectMaterialDrop } from "./project-materials-panel";
import type { CanvasLayoutInput, CanvasObjectDTO } from "@/lib/contracts/canvas";
import { employeeSourceMeta } from "@/lib/content-labels";

export type CardKind = "brief" | "sources" | "facts" | "methods" | "suggestion" | "draft";
export type CanvasContextKind = Extract<CardKind, "brief" | "sources" | "facts" | "methods">;
export type CanvasAssistantContext = {
  focus: CardKind | null;
  openContext: (kind: CanvasContextKind) => void;
  openDraft: () => void;
  selectedObject: { objectType: "CANVAS_OBJECT"; objectId: string; version: number; ownership: "EXTERNAL" | "PENDING"; whySelected: string; label: string } | null;
  projectMaterials: CanvasSourceOption[];
  canvasObjects: CanvasObjectDTO[];
  onObjectCreated: (object: CanvasObjectDTO) => void;
};
export type WorkbenchLayoutMode = "canvas-only" | "canvas-assistant" | "assistant-only";
export type CanvasSourceOption = ProjectMaterial;
type CanvasTool = "select" | "pan";
type ArrangeMode = "type" | "grid" | "horizontal" | "vertical";
type CanvasBackgroundStyle = "dots" | "grid" | "solid";
type CanvasBackgroundTone = "default" | "warm" | "cool";
type AddChoice = CardKind | "text" | "material" | "image";
type CardData = {
  kind: CardKind;
  title: string;
  lines: string[];
  meta?: string;
  actionLabel?: string;
  onAction?: () => void;
  onFocus?: () => void;
  onPlatform?: (platform: string) => void;
  draft?: {
    body: string;
    version: number;
    characters: number;
    status: string;
  };
};
type CanvasNode = Node<CardData>;
type WorkbenchNode = CanvasNode | FreeCanvasNode;

const icons = {
  brief: Target,
  sources: FileText,
  facts: ShieldCheck,
  methods: BookOpenCheck,
  suggestion: Sparkles,
  draft: PencilLine,
  text: FileText,
  material: BookOpenCheck,
  image: ImageIcon,
} as const;

const addGroups: Array<{ label: string; items: Array<{ kind: AddChoice; title: string; description: string }> }> = [
  { label: "添加内容", items: [
    { kind: "text", title: "文本", description: "直接写下新的内容" },
    { kind: "material", title: "项目资料", description: "引用当前项目的真实资料" },
    { kind: "image", title: "图片", description: "引用资料中的真实图片" },
  ] },
];

const ARRANGE_POSITIONS: Record<ArrangeMode, Record<CardKind, { x: number; y: number }>> = {
  type: {
    brief: { x: 48, y: 42 }, sources: { x: 22, y: 266 }, facts: { x: 30, y: 520 },
    methods: { x: 410, y: 58 }, draft: { x: 350, y: 292 }, suggestion: { x: 840, y: 326 },
  },
  grid: {
    brief: { x: 24, y: 48 }, sources: { x: 400, y: 48 }, facts: { x: 732, y: 48 },
    methods: { x: 24, y: 330 }, draft: { x: 356, y: 330 }, suggestion: { x: 868, y: 330 },
  },
  horizontal: {
    brief: { x: 20, y: 250 }, sources: { x: 396, y: 250 }, facts: { x: 728, y: 250 },
    methods: { x: 1060, y: 250 }, draft: { x: 1392, y: 250 }, suggestion: { x: 1904, y: 250 },
  },
  vertical: {
    brief: { x: 380, y: 20 }, sources: { x: 402, y: 270 }, facts: { x: 402, y: 469 },
    methods: { x: 402, y: 668 }, draft: { x: 312, y: 867 }, suggestion: { x: 418, y: 1203 },
  },
};

function PlatformSelect({ onPlatform }: { onPlatform?: (platform: string) => void }) {
  return (
    <select
      className="nodrag nowheel"
      aria-label="适配平台"
      defaultValue=""
      onChange={(event) => {
        if (event.target.value) onPlatform?.(event.target.value);
        event.target.value = "";
      }}
    >
      <option value="">适配平台</option>
      <option value="WECHAT_OFFICIAL">公众号</option>
      <option value="WECHAT_CHANNELS">视频号</option>
      <option value="DOUYIN">抖音</option>
      <option value="XIAOHONGSHU">小红书</option>
      <option value="WECHAT_MOMENTS">朋友圈</option>
    </select>
  );
}

function CanvasCard({ data, selected }: NodeProps<CanvasNode>) {
  const Icon = icons[data.kind];
  const isDraft = data.kind === "draft" && data.draft;

  return (
    <article className={`content-canvas-node is-${data.kind} ${selected ? "is-selected" : ""}`}>
      <header>
        <span aria-hidden="true"><Icon size={17} /></span>
        <div>
          {isDraft ? <small>当前稿件</small> : null}
          <strong>{data.title}</strong>
        </div>
        {data.meta ? <em>{data.meta}</em> : null}
      </header>

      {isDraft ? (
        <>
          <div className="canvas-draft-meta">
            <span>{data.draft?.characters || 0} 字</span>
            <span>{data.draft?.status}</span>
          </div>
          <p className="canvas-draft-preview">
            {data.draft?.body.trim() || "当前还没有稿件内容，从项目资料或你的想法开始组织第一版吧。"}
          </p>
        </>
      ) : (
        <div className="canvas-card-lines">
          {data.lines.length ? data.lines.slice(0, 5).map((line, index) => <p key={`${index}-${line}`}>{line}</p>) : <p>当前还没有内容。</p>}
        </div>
      )}

      <footer>
        {data.actionLabel ? <button className="nodrag" type="button" onClick={data.onAction}>{data.actionLabel}</button> : null}
        {isDraft ? (
          <>
            <button className="nodrag" data-draft-edit type="button" onClick={data.onFocus}>继续编辑</button>
            <PlatformSelect onPlatform={data.onPlatform} />
          </>
        ) : null}
      </footer>
    </article>
  );
}

function CanvasToolbar({
  projectTitle,
  saved,
  menu,
  materialsOpen,
  materialCount,
  materialsButtonRef,
  onMenu,
  onToggleMaterials,
}: {
  projectTitle: string;
  saved: string;
  menu: "arrange" | "settings" | null;
  materialsOpen: boolean;
  materialCount: number;
  materialsButtonRef?: RefObject<HTMLButtonElement | null>;
  onMenu: (menu: "arrange" | "settings") => void;
  onToggleMaterials: () => void;
}) {
  const { zoomIn, zoomOut } = useReactFlow();
  const { zoom } = useViewport();
  const motionSafe = typeof window === "undefined" || !window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  return (
    <header className="canvas-toolbar">
      <div>
        <strong>{projectTitle}</strong>
        <span>{saved}</span>
      </div>
      <nav aria-label="画布操作">
        <button type="button" title="缩小画布" onClick={() => void zoomOut({ duration: motionSafe ? 160 : 0 })} aria-label="缩小画布"><Minus size={17} /></button>
        <output aria-label="当前缩放比例">{Math.round(zoom * 100)}%</output>
        <button type="button" title="放大画布" onClick={() => void zoomIn({ duration: motionSafe ? 160 : 0 })} aria-label="放大画布"><Plus size={17} /></button>
        <i aria-hidden="true" />
        <button ref={materialsButtonRef} type="button" className="canvas-materials-button" title="项目资料" aria-pressed={materialsOpen} onClick={onToggleMaterials} aria-label={`项目资料，${materialCount} 条`}><FolderOpen size={17} /><span>资料</span></button>
        <button type="button" className="canvas-view-button" title="视图与更多" aria-expanded={menu !== null} onClick={() => onMenu("settings")} aria-label="视图与更多"><Settings2 size={17} /><span>视图</span></button>
      </nav>
    </header>
  );
}

function CanvasViewMenu({
  menu,
  nodes,
  backgroundStyle,
  backgroundTone,
  layoutMode,
  miniMapOpen,
  onClose,
  onArrange,
  onBackgroundStyle,
  onBackgroundTone,
  onLayoutModeChange,
  onToggleMiniMap,
}: {
  menu: "arrange" | "settings" | null;
  nodes: WorkbenchNode[];
  backgroundStyle: CanvasBackgroundStyle;
  backgroundTone: CanvasBackgroundTone;
  layoutMode: WorkbenchLayoutMode;
  miniMapOpen: boolean;
  onClose: () => void;
  onArrange: (nodes: WorkbenchNode[]) => void;
  onBackgroundStyle: (style: CanvasBackgroundStyle) => void;
  onBackgroundTone: (tone: CanvasBackgroundTone) => void;
  onLayoutModeChange: (mode: WorkbenchLayoutMode) => void;
  onToggleMiniMap: () => void;
}) {
  const { fitView } = useReactFlow();
  const motionSafe = typeof window === "undefined" || !window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const arrange = (mode: ArrangeMode) => {
    const positions = ARRANGE_POSITIONS[mode];
    let freeX = mode === "horizontal" ? 2_204 : mode === "vertical" ? 380 : 24;
    let freeY = mode === "vertical" ? 1_500 : mode === "horizontal" ? 250 : 720;
    let rowHeight = 0;
    const arranged = nodes.map((node) => {
      if (node.type === "card") return { ...node, position: positions[(node as CanvasNode).data.kind] };
      const freeNode = node as FreeCanvasNode;
      const width = freeNode.measured?.width ?? freeNode.data.object.width;
      const height = freeNode.measured?.height ?? freeNode.data.object.height;
      const position = { x: freeX, y: freeY };
      if (mode === "horizontal") freeX += width + 32;
      else if (mode === "vertical") freeY += height + 32;
      else {
        rowHeight = Math.max(rowHeight, height);
        freeX += width + 32;
        if (freeX + width > 1_500) { freeX = 24; freeY += rowHeight + 32; rowHeight = 0; }
      }
      return { ...freeNode, position };
    });
    onArrange(arranged);
    window.requestAnimationFrame(() => void fitView({ padding: 0.16, maxZoom: 1.05, duration: motionSafe ? 260 : 0 }));
    onClose();
  };

  if (!menu) return null;
  const layoutOptions: Array<{ mode: WorkbenchLayoutMode; label: string }> = [
    { mode: "canvas-only", label: "仅画布" },
    { mode: "canvas-assistant", label: "画布 + 鑫小助" },
    { mode: "assistant-only", label: "仅鑫小助" },
  ];
  return <div className="canvas-view-menu-layer">
    <button type="button" tabIndex={-1} aria-label="关闭画布菜单" onClick={onClose} />
    <aside className={`canvas-view-menu is-${menu}`} aria-label={menu === "arrange" ? "整理画布" : "画布设置"}>
      {menu === "arrange" ? <>
        <h3>整理画布</h3>
        <div className="canvas-arrange-options">
          <button type="button" onClick={() => arrange("type")}><LayoutGrid size={16} /><span><strong>按内容类型</strong><small>恢复推荐结构</small></span></button>
          <button type="button" onClick={() => arrange("grid")}><Grid2X2 size={16} /><span><strong>网格排列</strong><small>整齐分布卡片</small></span></button>
          <button type="button" onClick={() => arrange("horizontal")}><Columns3 size={16} /><span><strong>水平排列</strong><small>从左向右展开</small></span></button>
          <button type="button" onClick={() => arrange("vertical")}><Rows3 size={16} /><span><strong>垂直排列</strong><small>从上向下展开</small></span></button>
        </div>
        <button type="button" className="canvas-fit-action" onClick={() => { void fitView({ padding: 0.14, duration: motionSafe ? 240 : 0 }); onClose(); }}><Maximize2 size={16} />适配画布</button>
      </> : <>
        <fieldset><legend>整理画布</legend><div className="canvas-view-arrange-grid">{(["type", "grid", "horizontal", "vertical"] as const).map((mode) => <button key={mode} type="button" onClick={() => arrange(mode)}>{mode === "type" ? "按类型" : mode === "grid" ? "网格" : mode === "horizontal" ? "水平" : "垂直"}</button>)}</div></fieldset>
        <fieldset><legend>背景</legend><div>{(["dots", "grid", "solid"] as const).map((style) => <button key={style} type="button" aria-pressed={backgroundStyle === style} onClick={() => onBackgroundStyle(style)}>{style === "dots" ? "点阵" : style === "grid" ? "网格" : "纯色"}</button>)}</div></fieldset>
        <fieldset><legend>色调</legend><div>{(["default", "warm", "cool"] as const).map((tone) => <button key={tone} type="button" aria-pressed={backgroundTone === tone} onClick={() => onBackgroundTone(tone)}><i className={`canvas-tone-swatch is-${tone}`} />{tone === "default" ? "默认" : tone === "warm" ? "暖灰" : "冷灰"}</button>)}</div></fieldset>
        <fieldset><legend>工作区</legend><div className="canvas-view-layout-options">{layoutOptions.map((option) => <button key={option.mode} type="button" aria-pressed={layoutMode === option.mode} onClick={() => { onLayoutModeChange(option.mode); onClose(); }}>{option.label}</button>)}</div></fieldset>
        <button type="button" className="canvas-view-toggle-map" aria-pressed={miniMapOpen} onClick={() => { onToggleMiniMap(); onClose(); }}><MapIcon size={15} />{miniMapOpen ? "隐藏小地图" : "显示小地图"}</button>
      </>}
    </aside>
  </div>;
}

function WorkbenchLayoutMenu({ current, open, onClose, onChange }: { current: WorkbenchLayoutMode; open: boolean; onClose: () => void; onChange: (mode: WorkbenchLayoutMode) => void }) {
  if (!open) return null;
  const options: Array<{ mode: WorkbenchLayoutMode; label: string; description: string }> = [
    { mode: "canvas-only", label: "仅画布", description: "专注整理与编辑内容" },
    { mode: "canvas-assistant", label: "画布 + 鑫小助", description: "边创作边获得协作建议" },
    { mode: "assistant-only", label: "仅鑫小助", description: "集中查看建议与快捷操作" },
  ];
  return <div className="workbench-layout-layer">
    <button type="button" tabIndex={-1} aria-label="关闭布局菜单" onClick={onClose} />
    <aside aria-label="工作区布局"><h3>工作区布局</h3>{options.map((option) => <button key={option.mode} type="button" aria-pressed={current === option.mode} onClick={() => { onChange(option.mode); onClose(); }}><span><strong>{option.label}</strong><small>{option.description}</small></span>{current === option.mode ? <i>当前</i> : null}</button>)}</aside>
  </div>;
}

function CanvasViewCoordinator({ request, onHandled }: { request: { ids: string[]; revision: number; mode?: "fit" | "follow" } | null; onHandled: () => void }) {
  const { fitView, getNode, getViewport, setCenter } = useReactFlow();
  useEffect(() => {
    if (!request) return;
    const motionSafe = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const frame = window.requestAnimationFrame(() => {
      if (request.mode === "follow") {
        const node = getNode(request.ids.at(-1)!); const viewport = getViewport(); const canvas = document.querySelector(".content-canvas .react-flow")?.getBoundingClientRect();
        if (node && canvas) { const left = node.position.x * viewport.zoom + viewport.x; const top = node.position.y * viewport.zoom + viewport.y; const width = (node.measured?.width ?? 380) * viewport.zoom; const height = (node.measured?.height ?? 240) * viewport.zoom; const visible = left > 24 && top > 72 && left + width < canvas.width - 24 && top + height < canvas.height - 48; if (!visible) void setCenter(node.position.x + width / viewport.zoom / 2, node.position.y + height / viewport.zoom / 2, { zoom: viewport.zoom, duration: motionSafe ? 240 : 0 }); }
      } else void fitView({ nodes: request.ids.map((id) => ({ id })), padding: 0.55, maxZoom: 1.05, duration: motionSafe ? 280 : 0 });
      onHandled();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [fitView, getNode, getViewport, onHandled, request, setCenter]);
  return null;
}

function CanvasChrome({
  addOpen,
  activeTool,
  editable,
  referenceMode,
  sourceOptions,
  canUndo,
  canRedo,
  onAdd,
  onBack,
  onCloseAdd,
  onChoose,
  onChooseSource,
  onUndo,
  onRedo,
  onTool,
}: {
  addOpen: boolean;
  activeTool: CanvasTool;
  editable: boolean;
  referenceMode: "material" | "image" | null;
  sourceOptions: CanvasSourceOption[];
  canUndo: boolean;
  canRedo: boolean;
  onAdd: (position: { x: number; y: number }) => void;
  onBack: () => void;
  onCloseAdd: () => void;
  onChoose: (kind: AddChoice) => void;
  onChooseSource: (source: CanvasSourceOption, sourceAssetId?: string) => void;
  onUndo: () => void;
  onRedo: () => void;
  onTool: (tool: CanvasTool) => void;
}) {
  const { screenToFlowPosition } = useReactFlow();
  const referenceOptions = referenceMode === "image"
    ? sourceOptions.flatMap((source) => source.imageAssets.map((asset) => ({ source, asset })))
    : sourceOptions.map((source) => ({ source, asset: null }));

  return <>
    <nav className="canvas-bottom-toolbar" aria-label="画布工具">
      <button type="button" className="is-primary" disabled={!editable} onClick={() => { const canvas = document.querySelector(".content-canvas .react-flow")?.getBoundingClientRect(); const point = canvas ? screenToFlowPosition({ x: canvas.left + canvas.width / 2, y: canvas.top + canvas.height / 2 }) : { x: 720, y: 180 }; onAdd(point); }} aria-expanded={addOpen} aria-haspopup="dialog" title={editable ? "添加到画布" : "当前权限只能查看画布"}><Plus size={18} /><span>添加</span></button>
      <button type="button" aria-pressed={activeTool === "select"} onClick={() => onTool("select")} title="选择卡片"><MousePointer2 size={17} /><span>选择</span></button>
      <button type="button" aria-pressed={activeTool === "pan"} onClick={() => onTool("pan")} title="拖动画布"><Hand size={17} /><span>移动</span></button>
      <i aria-hidden="true" />
      <button type="button" disabled={!canUndo} onClick={onUndo} title="撤销" aria-label="撤销画布操作"><Undo2 size={16} /></button>
      <button type="button" disabled={!canRedo} onClick={onRedo} title="重做" aria-label="重做画布操作"><Redo2 size={16} /></button>
    </nav>

    {addOpen ? <div className="canvas-add-layer">
      <button type="button" tabIndex={-1} aria-label="关闭添加到画布菜单" onClick={onCloseAdd} />
          <aside role="dialog" aria-modal="false" aria-labelledby="canvas-add-title">
            <header>{referenceMode ? <button type="button" aria-label="返回添加菜单" onClick={onBack}><ArrowLeft size={17} /></button> : null}<strong id="canvas-add-title">{referenceMode === "image" ? "选择图片" : referenceMode === "material" ? "选择资料" : "添加到画布"}</strong><button type="button" aria-label="关闭菜单" onClick={onCloseAdd}><X size={17} /></button></header>
        {referenceMode ? <section className="canvas-reference-picker"><h3>{referenceMode === "image" ? "当前项目中的真实图片" : "当前项目资料"}</h3><div>{referenceOptions.map(({ source, asset }, index) => <button type="button" key={`${source.id}-${asset?.id ?? "material"}`} autoFocus={index === 0} onClick={() => onChooseSource(source, asset?.id)}><span aria-hidden="true">{referenceMode === "image" ? <ImageIcon size={17} /> : <Link2 size={17} />}</span><span><strong>{source.title}</strong><small>{employeeSourceMeta(source.sourceType, source.sourcePlatform)}</small></span></button>)}</div>{referenceOptions.length === 0 ? <p>{referenceMode === "image" ? "当前项目还没有可引用的真实图片。" : "当前项目还没有资料。"}</p> : null}</section>
          : editable ? addGroups.map((group) => <section key={group.label}><h3>{group.label}</h3><div>{group.items.map((item, index) => { const Icon = icons[item.kind]; return <button type="button" key={item.kind} autoFocus={index === 0} onClick={() => onChoose(item.kind)}><span aria-hidden="true"><Icon size={17} /></span><span><strong>{item.title}</strong><small>{item.description}</small></span></button>; })}</div></section>) : <p className="canvas-add-readonly">当前权限只能查看画布内容。</p>}
      </aside>
    </div> : null}
  </>;
}

type CanvasSurfaceProps = {
  projectId: string;
  projectTitle: string;
  initialObjects: CanvasObjectDTO[];
  sourceOptions: CanvasSourceOption[];
  editable: boolean;
  brief: string[];
  sources: string[];
  facts: string[];
  methods: string[];
  suggestions: string[];
  draft: { title: string; body: string; version: number; characters: number; updated: string };
  draftToolbar: ReactNode;
  draftEditor: ReactNode;
  contextTools: ReactNode;
  assistant: ReactNode | ((context: CanvasAssistantContext) => ReactNode);
  assistantOpen: boolean;
  layoutMode: WorkbenchLayoutMode;
  onLayoutModeChange: (mode: WorkbenchLayoutMode) => void;
  onAssistantOpen: (open: boolean) => void;
  onContextKindChange?: (kind: CanvasContextKind) => void;
  onPlatform: (platform: string) => void;
};

function CanvasContextBar({ brief, sources, facts, methods, draft, onOpenContext, onOpenDraft }: {
  brief: string[];
  sources: string[];
  facts: string[];
  methods: string[];
  draft: CanvasSurfaceProps["draft"];
  onOpenContext: (kind: CanvasContextKind) => void;
  onOpenDraft: () => void;
}) {
  const hasDraft = Boolean(draft.characters > 0 || draft.body.trim());
  return <div className="canvas-context-bar" data-testid="canvas-context-bar" aria-label="项目上下文">
    <span className="canvas-context-label">项目上下文</span>
    <button type="button" className="canvas-context-chip is-topic" aria-label={`当前目标，${brief[0] || "尚未设置"}`} onClick={() => onOpenContext("brief")}><Target size={14} /><span><small>当前目标</small><strong>{brief[0] || "尚未设置"}</strong></span></button>
    <button type="button" className="canvas-context-chip" aria-label={`资料，${sources.length ? `${sources.length} 条` : "暂无"}`} onClick={() => onOpenContext("sources")}><FileText size={14} /><span><small>资料</small><strong>{sources.length ? `${sources.length} 条` : "暂无"}</strong></span></button>
    <button type="button" className="canvas-context-chip" aria-label={`已确认信息，${facts.length ? `${facts.length} 条` : "暂无"}`} onClick={() => onOpenContext("facts")}><ShieldCheck size={14} /><span><small>已确认信息</small><strong>{facts.length ? `${facts.length} 条` : "暂无"}</strong></span></button>
    <button type="button" className="canvas-context-chip" aria-label={`方法，${methods.length ? methods[0] : "默认方式"}`} onClick={() => onOpenContext("methods")}><BookOpenCheck size={14} /><span><small>方法</small><strong>{methods.length ? methods[0] : "默认方式"}</strong></span></button>
    {hasDraft ? <button type="button" className="canvas-context-chip is-draft" aria-label={`当前稿件，${draft.title || "未命名稿件"}`} onClick={onOpenDraft}><PencilLine size={14} /><span><small>当前稿件</small><strong>{draft.title || "未命名稿件"}</strong></span></button> : null}
  </div>;
}

type CanvasCommand =
  | { type: "CREATE"; objectId: string }
  | { type: "DELETE"; objectId: string }
  | { type: "LAYOUT"; objectId: string; before: CanvasLayoutInput; after: CanvasLayoutInput }
  | { type: "BATCH_LAYOUT"; items: Array<{ objectId: string; before: CanvasLayoutInput; after: CanvasLayoutInput }> };
type TextDraft = { title: string; textContent: string; expectedContentVersion: number; revision: number };

async function canvasRequest(url: string, init?: RequestInit) {
  const response = await fetch(url, { ...init, headers: { ...(init?.body ? { "content-type": "application/json" } : {}), ...init?.headers } });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(typeof result.message === "string" ? result.message : "画布操作失败，请重试。");
    Object.assign(error, { status: response.status, code: result.error });
    throw error;
  }
  return result as { object?: CanvasObjectDTO; objects?: CanvasObjectDTO[] };
}

function objectLayout(object: CanvasObjectDTO): CanvasLayoutInput {
  return { positionX: object.positionX, positionY: object.positionY, width: object.width, height: object.height, zIndex: object.zIndex };
}

function recoveryKey(projectId: string, objectId: string) {
  return `canvas-text-recovery:${projectId}:${objectId}:v1`;
}

const DEFAULT_VIEWPORT: Viewport = { x: 18, y: 48, zoom: 0.92 };
const MIN_CANVAS_WIDTH = 340;
const MIN_ASSISTANT_WIDTH = 260;
const MAX_ASSISTANT_WIDTH = 520;
const LEGACY_PANE_STORAGE_KEY = "studio-workbench-assistant-width:v1";

function clampAssistantWidth(width: number, totalWidth: number) {
  return Math.round(Math.max(MIN_ASSISTANT_WIDTH, Math.min(width, MAX_ASSISTANT_WIDTH, totalWidth - MIN_CANVAS_WIDTH)));
}

function CanvasSurface({
  projectId,
  projectTitle,
  initialObjects,
  sourceOptions,
  editable,
  brief,
  sources,
  facts,
  methods,
  draft,
  draftToolbar,
  draftEditor,
  contextTools,
  assistant,
  assistantOpen,
  layoutMode,
  onLayoutModeChange,
  onAssistantOpen,
  onContextKindChange,
  onPlatform,
}: CanvasSurfaceProps) {
  const [focused, setFocused] = useState(false);
  const [contextOpen, setContextOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [referenceMode, setReferenceMode] = useState<"material" | "image" | null>(null);
  const [canvasMenu, setCanvasMenu] = useState<"arrange" | "settings" | null>(null);
  const [layoutMenuOpen, setLayoutMenuOpen] = useState(false);
  const [materialsOpen, setMaterialsOpen] = useState(false);
  const [materialDragging, setMaterialDragging] = useState(false);
  const [miniMapOpen, setMiniMapOpen] = useState(true);
  const [toolMode, setToolMode] = useState<CanvasTool>("select");
  const [spacePanning, setSpacePanning] = useState(false);
  const [backgroundStyle, setBackgroundStyle] = useState<CanvasBackgroundStyle>("dots");
  const [backgroundTone, setBackgroundTone] = useState<CanvasBackgroundTone>("default");
  const [assistantWidth, setAssistantWidth] = useState<number | null>(null);
  const [isResizing, setIsResizing] = useState(false);
  const [freeObjects, setFreeObjects] = useState(initialObjects);
  const [editingObjectId, setEditingObjectId] = useState<string | null>(null);
  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null);
  const [saveStates, setSaveStates] = useState<Record<string, CanvasSaveState>>({});
  const [canvasError, setCanvasError] = useState("");
  const [viewRequest, setViewRequest] = useState<{ ids: string[]; revision: number; mode?: "fit" | "follow" } | null>(null);
  const [, setHistoryRevision] = useState(0);
  const workbenchRef = useRef<HTMLDivElement>(null);
  const materialsButtonRef = useRef<HTMLButtonElement>(null);
  const assistantWidthRef = useRef<number | null>(null);
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const viewReadyRef = useRef(false);
  const viewProjectRef = useRef(projectId);
  const freeObjectsRef = useRef(new Map(initialObjects.map((object) => [object.id, object])));
  const textDraftsRef = useRef(new Map<string, TextDraft>());
  const flushTextRef = useRef<(objectId: string) => Promise<void>>(async () => undefined);
  const saveTimersRef = useRef(new Map<string, number>());
  const saveInFlightRef = useRef(new Set<string>());
  const insertPositionRef = useRef<{ x: number; y: number; sourceObjectId?: string }>({ x: 720, y: 180 });
  const dragStartRef = useRef(new Map<string, CanvasLayoutInput>());
  const lastNodeClickAtRef = useRef(0);
  const undoStackRef = useRef<CanvasCommand[]>([]);
  const redoStackRef = useRef<CanvasCommand[]>([]);
  const materialDropGuardRef = useRef(new Map<string, number>());
  const storageKey = `content-canvas:${projectId}:v6`;
  const viewStorageKey = `content-canvas:${projectId}:view:v1`;
  const paneStorageKey = `studio-workbench-assistant-width:${projectId}:v1`;

  if (viewProjectRef.current !== projectId) {
    viewProjectRef.current = projectId;
    viewReadyRef.current = false;
  }

  const savedLayout = useMemo(() => {
    if (typeof window === "undefined") return { nodes: {} as Record<string, { x: number; y: number }>, viewport: undefined as Viewport | undefined };
    try {
      return JSON.parse(window.localStorage.getItem(storageKey) ?? "{}") as {
        nodes?: Record<string, { x: number; y: number }>;
        viewport?: Viewport;
      };
    } catch {
      return { nodes: {} as Record<string, { x: number; y: number }>, viewport: undefined as Viewport | undefined };
    }
  }, [storageKey]);

  const [viewport, setViewport] = useState<Viewport>(savedLayout.viewport ?? DEFAULT_VIEWPORT);
  const activeTool: CanvasTool = spacePanning ? "pan" : toolMode;
  const hasDraft = Boolean(draft.characters > 0 || draft.body.trim());
  const nodeTypes = useMemo(() => ({ card: CanvasCard, free: CanvasFreeNode }), []);

  const templateNodes = useMemo<CanvasNode[]>(() => {
    const positions = savedLayout.nodes ?? {};
    const item = (id: string, position: { x: number; y: number }, data: CardData): CanvasNode => ({ id, type: "card", position: positions[id] ?? position, data });
    const overlapsAt = (position: { x: number; y: number }) => freeObjects.some((object) => position.x < object.positionX + object.width && position.x + 640 > object.positionX && position.y < object.positionY + object.height && position.y + 420 > object.positionY);
    let draftPosition = { x: 96, y: 520 };
    for (let attempt = 0; attempt < 8; attempt += 1) {
      if (!overlapsAt(draftPosition)) break;
      draftPosition = { x: draftPosition.x + 96, y: draftPosition.y + 72 };
    }
    const draftNode = item("draft", draftPosition, {
      kind: "draft",
      title: draft.title || "未命名稿件",
      lines: [],
      onFocus: () => setFocused(true),
      onPlatform,
      draft: { body: draft.body, version: draft.version, characters: draft.characters, status: draft.updated },
    });
    return hasDraft ? [{ ...draftNode, position: draftPosition }] : [];
  }, [draft, freeObjects, hasDraft, onPlatform, savedLayout.nodes]);

  const [nodes, setNodes, onNodesChange] = useNodesState<WorkbenchNode>(templateNodes);
  const selectedNode = nodes.find((node) => node.selected);
  const selectedKind = selectedNode?.type === "card" ? (selectedNode as CanvasNode).data.kind : null;
  const selectedFreeObject = selectedNode?.type === "free" ? (selectedNode as FreeCanvasNode).data.object : null;
  const selectedAssistantObject = selectedFreeObject ? { objectType: "CANVAS_OBJECT" as const, objectId: selectedFreeObject.id, version: selectedFreeObject.contentVersion, ownership: selectedFreeObject.objectType === "TEXT" ? "PENDING" as const : "EXTERNAL" as const, whySelected: "员工当前在画布中显式选中的对象", label: selectedFreeObject.title || selectedFreeObject.materialReference?.sourceTitleSnapshot || (selectedFreeObject.objectType === "TEXT" ? "未命名文本" : "项目资料") } : null;
  const relationEdges = useMemo<Edge[]>(() => freeObjects.flatMap((target) => target.generatedFrom.flatMap((relation) => freeObjects.some((source) => source.id === relation.sourceObjectId) ? [{ id: `generated:${relation.sourceSnapshotId}:${target.id}`, source: `object:${relation.sourceObjectId}`, target: `object:${target.id}`, type: "smoothstep", className: "canvas-generated-edge", selectable: false, focusable: false } satisfies Edge] : [])), [freeObjects]);

  useEffect(() => {
    setNodes((current) => {
      const draftNodes = templateNodes.map((next) => {
        const previous = current.find(({ id }) => id === next.id);
        return previous ? { ...next, position: previous.position, selected: previous.selected } : next;
      });
      const objectNodes: FreeCanvasNode[] = freeObjects.map((object) => {
        const id = `object:${object.id}`;
        const previous = current.find((node) => node.id === id && node.type === "free") as FreeCanvasNode | undefined;
        const layoutChanged = previous?.data.object.layoutVersion !== object.layoutVersion;
        return {
          id,
          type: "free",
          draggable: editable,
          position: previous && !layoutChanged ? previous.position : { x: object.positionX, y: object.positionY },
          style: { width: object.width, height: object.height },
          selected: editingObjectId === object.id || selectedObjectId === object.id,
          data: { object, editable, editing: editingObjectId === object.id, saveState: saveStates[object.id] ?? "idle" },
        };
      });
      return [...draftNodes, ...objectNodes];
    });
  }, [editable, editingObjectId, freeObjects, saveStates, selectedObjectId, setNodes, templateNodes]);

  useEffect(() => {
    window.localStorage.setItem(storageKey, JSON.stringify({
      nodes: Object.fromEntries(nodes.filter((node) => node.type === "card").map(({ id, position }) => [id, position])),
      viewport,
    }));
  }, [nodes, storageKey, viewport]);

  useEffect(() => {
    viewReadyRef.current = false;
    try {
      const stored = JSON.parse(window.localStorage.getItem(viewStorageKey) ?? "{}") as Record<string, unknown>;
      if (typeof stored.miniMapOpen === "boolean") setMiniMapOpen(stored.miniMapOpen);
      if (stored.toolMode === "select" || stored.toolMode === "pan") setToolMode(stored.toolMode);
      if (stored.backgroundStyle === "dots" || stored.backgroundStyle === "grid" || stored.backgroundStyle === "solid") setBackgroundStyle(stored.backgroundStyle);
      if (stored.backgroundTone === "default" || stored.backgroundTone === "warm" || stored.backgroundTone === "cool") setBackgroundTone(stored.backgroundTone);
    } catch {
      // Ignore invalid local preferences and keep the stable defaults.
    }
    const frame = window.requestAnimationFrame(() => { viewReadyRef.current = true; });
    return () => window.cancelAnimationFrame(frame);
  }, [viewStorageKey]);

  useEffect(() => {
    if (!viewReadyRef.current) return;
    window.localStorage.setItem(viewStorageKey, JSON.stringify({ miniMapOpen, toolMode, backgroundStyle, backgroundTone }));
  }, [backgroundStyle, backgroundTone, miniMapOpen, toolMode, viewStorageKey]);

  const updateHistoryState = useCallback(() => setHistoryRevision((current) => current + 1), []);
  const pushCommand = useCallback((command: CanvasCommand) => {
    undoStackRef.current = [...undoStackRef.current.slice(-49), command];
    redoStackRef.current = [];
    updateHistoryState();
  }, [updateHistoryState]);

  const upsertObject = useCallback((object: CanvasObjectDTO) => {
    freeObjectsRef.current.set(object.id, object);
    setFreeObjects((current) => object.deletedAt
      ? current.filter(({ id }) => id !== object.id)
      : [...current.filter(({ id }) => id !== object.id), object].sort((a, b) => a.zIndex - b.zIndex || a.createdAt.localeCompare(b.createdAt)));
  }, []);

  useEffect(() => {
    for (const timer of saveTimersRef.current.values()) window.clearTimeout(timer);
    saveTimersRef.current.clear();
    saveInFlightRef.current.clear();
    textDraftsRef.current.clear();
    const recoveredStates: Record<string, CanvasSaveState> = {};
    let recoveredEditingId: string | null = null;
    const recovered = initialObjects.map((object) => {
      if (object.objectType !== "TEXT") return object;
      try {
        const cached = JSON.parse(window.localStorage.getItem(recoveryKey(projectId, object.id)) ?? "null") as { title?: unknown; textContent?: unknown; expectedContentVersion?: unknown } | null;
        if (!cached || typeof cached.title !== "string" || typeof cached.textContent !== "string" || typeof cached.expectedContentVersion !== "number") return object;
        const merged = { ...object, title: cached.title || null, textContent: cached.textContent };
        textDraftsRef.current.set(object.id, { title: cached.title, textContent: cached.textContent, expectedContentVersion: object.contentVersion, revision: 1 });
        recoveredStates[object.id] = cached.expectedContentVersion === object.contentVersion ? "save_failed" : "conflict";
        recoveredEditingId ??= object.id;
        return merged;
      } catch {
        return object;
      }
    });
    freeObjectsRef.current = new Map(recovered.map((object) => [object.id, object]));
    setFreeObjects(recovered);
    setSaveStates(recoveredStates);
    setEditingObjectId(recoveredEditingId);
    setSelectedObjectId(recoveredEditingId);
    undoStackRef.current = [];
    redoStackRef.current = [];
    updateHistoryState();
  }, [initialObjects, projectId, updateHistoryState]);

  const flushCanvasText = useCallback(async (objectId: string) => {
    if (saveInFlightRef.current.has(objectId)) return;
    const draft = textDraftsRef.current.get(objectId);
    if (!draft) return;
    saveInFlightRef.current.add(objectId);
    setSaveStates((current) => ({ ...current, [objectId]: "saving" }));
    const sentRevision = draft.revision;
    try {
      const result = await canvasRequest(`/api/projects/${projectId}/canvas/objects/${objectId}`, { method: "PATCH", body: JSON.stringify({ kind: "TEXT", expectedContentVersion: draft.expectedContentVersion, title: draft.title || null, textContent: draft.textContent }) });
      if (!result.object) throw new Error("节点保存结果无效。");
      upsertObject(result.object);
      const latest = textDraftsRef.current.get(objectId);
      if (!latest || latest.revision === sentRevision) {
        textDraftsRef.current.delete(objectId);
        window.localStorage.removeItem(recoveryKey(projectId, objectId));
        setSaveStates((current) => ({ ...current, [objectId]: "saved" }));
        window.setTimeout(() => setSaveStates((current) => current[objectId] === "saved" ? { ...current, [objectId]: "idle" } : current), 1_200);
      } else {
        textDraftsRef.current.set(objectId, { ...latest, expectedContentVersion: result.object.contentVersion });
        window.setTimeout(() => void flushTextRef.current(objectId), 80);
      }
    } catch (error) {
      const status = error && typeof error === "object" && "status" in error ? Number((error as { status?: number }).status) : 0;
      setSaveStates((current) => ({ ...current, [objectId]: status === 409 ? "conflict" : "save_failed" }));
    } finally {
      saveInFlightRef.current.delete(objectId);
    }
  }, [projectId, upsertObject]);

  useEffect(() => { flushTextRef.current = flushCanvasText; }, [flushCanvasText]);

  const changeCanvasText = useCallback((objectId: string, value: { title: string; textContent: string }) => {
    const object = freeObjectsRef.current.get(objectId);
    if (!object || object.objectType !== "TEXT" || object.deletedAt || !editable) return;
    const previous = textDraftsRef.current.get(objectId);
    const draft: TextDraft = { title: value.title, textContent: value.textContent, expectedContentVersion: previous?.expectedContentVersion ?? object.contentVersion, revision: (previous?.revision ?? 0) + 1 };
    textDraftsRef.current.set(objectId, draft);
    const localObject = { ...object, title: value.title.trim() || null, textContent: value.textContent };
    freeObjectsRef.current.set(objectId, localObject);
    setFreeObjects((current) => current.map((item) => item.id === objectId ? localObject : item));
    setSaveStates((current) => ({ ...current, [objectId]: "dirty" }));
    window.localStorage.setItem(recoveryKey(projectId, objectId), JSON.stringify({ title: value.title, textContent: value.textContent, expectedContentVersion: draft.expectedContentVersion, savedAt: new Date().toISOString() }));
    const timer = saveTimersRef.current.get(objectId);
    if (timer) window.clearTimeout(timer);
    saveTimersRef.current.set(objectId, window.setTimeout(() => void flushTextRef.current(objectId), 600));
  }, [editable, projectId]);

  const retryCanvasText = useCallback(async (objectId: string) => {
    const draft = textDraftsRef.current.get(objectId);
    if (!draft) return;
    if (saveStates[objectId] === "conflict") {
      try {
        const result = await canvasRequest(`/api/projects/${projectId}/canvas/objects`);
        const server = result.objects?.find(({ id }) => id === objectId);
        if (server) textDraftsRef.current.set(objectId, { ...draft, expectedContentVersion: server.contentVersion, revision: draft.revision + 1 });
      } catch {
        // Keep the local recovery buffer and let the regular retry surface the error.
      }
    }
    await flushTextRef.current(objectId);
  }, [projectId, saveStates]);

  const persistCanvasLayout = useCallback(async (objectId: string, layout: CanvasLayoutInput, before: CanvasLayoutInput, record = true) => {
    const object = freeObjectsRef.current.get(objectId);
    if (!object || object.deletedAt || !editable) return;
    try {
      const result = await canvasRequest(`/api/projects/${projectId}/canvas/objects/${objectId}`, { method: "PATCH", body: JSON.stringify({ kind: "LAYOUT", expectedLayoutVersion: object.layoutVersion, ...layout }) });
      if (!result.object) throw new Error("节点位置保存结果无效。");
      upsertObject(result.object);
      if (record && JSON.stringify(before) !== JSON.stringify(layout)) pushCommand({ type: "LAYOUT", objectId, before, after: layout });
    } catch {
      setNodes((current) => current.map((node) => node.id === `object:${objectId}` ? { ...node, position: { x: before.positionX, y: before.positionY }, style: { ...node.style, width: before.width, height: before.height } } : node));
      setSaveStates((current) => ({ ...current, [objectId]: "save_failed" }));
    }
  }, [editable, projectId, pushCommand, setNodes, upsertObject]);

  const deleteCanvasObject = useCallback(async (objectId: string, record = true) => {
    if (!editable) return;
    if (textDraftsRef.current.has(objectId)) {
      await flushTextRef.current(objectId);
      if (textDraftsRef.current.has(objectId)) return;
    }
    const object = freeObjectsRef.current.get(objectId);
    if (!object || object.deletedAt) return;
    const result = await canvasRequest(`/api/projects/${projectId}/canvas/objects/${objectId}`, { method: "DELETE", body: JSON.stringify({ expectedContentVersion: object.contentVersion }) });
    if (!result.object) throw new Error("节点删除结果无效。");
    upsertObject(result.object);
    setEditingObjectId((current) => current === objectId ? null : current);
    setSelectedObjectId((current) => current === objectId ? null : current);
    if (record) pushCommand({ type: "DELETE", objectId });
  }, [editable, projectId, pushCommand, upsertObject]);

  const restoreDeletedObject = useCallback(async (objectId: string) => {
    if (!editable) return;
    const object = freeObjectsRef.current.get(objectId);
    if (!object?.deletedAt) return;
    const result = await canvasRequest(`/api/projects/${projectId}/canvas/objects/${objectId}/restore`, { method: "POST", body: JSON.stringify({ expectedContentVersion: object.contentVersion }) });
    if (!result.object) throw new Error("节点恢复结果无效。");
    upsertObject(result.object);
    setSelectedObjectId(objectId);
  }, [editable, projectId, upsertObject]);

  const performHistoryCommand = useCallback(async (command: CanvasCommand, direction: "undo" | "redo") => {
    if (command.type === "CREATE") return direction === "undo" ? deleteCanvasObject(command.objectId, false) : restoreDeletedObject(command.objectId);
    if (command.type === "DELETE") return direction === "undo" ? restoreDeletedObject(command.objectId) : deleteCanvasObject(command.objectId, false);
    const items = command.type === "LAYOUT" ? [command] : command.items;
    for (const item of items) {
      const current = freeObjectsRef.current.get(item.objectId);
      if (!current || current.deletedAt) continue;
      const layout = direction === "undo" ? item.before : item.after;
      await persistCanvasLayout(item.objectId, layout, objectLayout(current), false);
    }
  }, [deleteCanvasObject, persistCanvasLayout, restoreDeletedObject]);

  const undoCanvas = useCallback(async () => {
    const command = undoStackRef.current.pop();
    if (!command) return;
    updateHistoryState();
    try {
      await performHistoryCommand(command, "undo");
      redoStackRef.current.push(command);
    } catch {
      undoStackRef.current.push(command);
    }
    updateHistoryState();
  }, [performHistoryCommand, updateHistoryState]);

  const redoCanvas = useCallback(async () => {
    const command = redoStackRef.current.pop();
    if (!command) return;
    updateHistoryState();
    try {
      await performHistoryCommand(command, "redo");
      undoStackRef.current.push(command);
    } catch {
      redoStackRef.current.push(command);
    }
    updateHistoryState();
  }, [performHistoryCommand, updateHistoryState]);

  const createFreeObject = useCallback(async (choice: "text" | "material" | "image", source?: CanvasSourceOption, sourceAssetId?: string, keepViewport = false) => {
    if (!editable) return;
    const point = insertPositionRef.current;
    const width = choice === "image" ? 360 : 380;
    const height = choice === "image" ? 260 : 220;
    const zIndex = Math.max(0, ...Array.from(freeObjectsRef.current.values()).map((object) => object.zIndex)) + 1;
    const payload = choice === "text"
      ? { objectType: "TEXT", title: null, textContent: "", layout: { positionX: point.x, positionY: point.y, width, height, zIndex } }
      : choice === "image"
        ? { objectType: "IMAGE_REFERENCE", sourceItemId: source?.id, sourceAssetId, layout: { positionX: point.x, positionY: point.y, width, height, zIndex } }
        : { objectType: "MATERIAL_REFERENCE", sourceItemId: source?.id, layout: { positionX: point.x, positionY: point.y, width, height, zIndex } };
    const result = await canvasRequest(`/api/projects/${projectId}/canvas/objects`, { method: "POST", body: JSON.stringify(payload) });
    if (!result.object) throw new Error("节点创建结果无效。");
    upsertObject(result.object);
    setAddOpen(false);
    setReferenceMode(null);
    setSelectedObjectId(result.object.id);
    if (choice === "text") setEditingObjectId(result.object.id);
    pushCommand({ type: "CREATE", objectId: result.object.id });
    if (!keepViewport) setViewRequest({ ids: [...(point.sourceObjectId ? [`object:${point.sourceObjectId}`] : []), `object:${result.object.id}`], revision: Date.now() });
  }, [editable, projectId, pushCommand, upsertObject]);

  const materialPosition = useCallback((clientX?: number, clientY?: number, kind: "material" | "image" = "material") => {
    const canvas = document.querySelector(".content-canvas .react-flow")?.getBoundingClientRect();
    const width = kind === "image" ? 360 : 380;
    const height = kind === "image" ? 260 : 220;
    const screenX = clientX ?? (canvas ? canvas.left + canvas.width / 2 : 720);
    const screenY = clientY ?? (canvas ? canvas.top + canvas.height / 2 : 360);
    let point = { x: (screenX - (canvas?.left ?? 0) - viewport.x) / viewport.zoom - width / 2, y: (screenY - (canvas?.top ?? 0) - viewport.y) / viewport.zoom - height / 2 };
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const overlaps = Array.from(freeObjectsRef.current.values()).some((object) => point.x < object.positionX + object.width && point.x + width > object.positionX && point.y < object.positionY + object.height && point.y + height > object.positionY);
      if (!overlaps) break;
      point = { x: point.x + 32, y: point.y + 32 };
    }
    return point;
  }, [viewport]);

  const addProjectMaterial = useCallback(async (source: CanvasSourceOption, payload: ProjectMaterialDrop, clientX?: number, clientY?: number) => {
    if (!editable) return;
    const guardKey = `${payload.kind}:${payload.sourceId}:${payload.sourceAssetId ?? ""}`;
    const now = Date.now();
    if (now - (materialDropGuardRef.current.get(guardKey) ?? 0) < 3_000) { setCanvasError("这条资料刚刚已经添加，请稍候再试。"); return; }
    materialDropGuardRef.current.set(guardKey, now);
    insertPositionRef.current = materialPosition(clientX, clientY, payload.kind);
    setCanvasError("");
    try { await createFreeObject(payload.kind, source, payload.sourceAssetId, true); }
    catch (error) { materialDropGuardRef.current.delete(guardKey); setCanvasError(error instanceof Error ? error.message : "资料添加失败。"); }
  }, [createFreeObject, editable, materialPosition]);

  useEffect(() => {
    const onCanvasShortcut = (event: globalThis.KeyboardEvent) => {
      const element = event.target instanceof HTMLElement ? event.target : null;
      if (element?.closest("input, textarea, select, [contenteditable='true']")) return;
      const modifier = event.metaKey || event.ctrlKey;
      if (modifier && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) void redoCanvas();
        else void undoCanvas();
        return;
      }
      if (modifier && event.key.toLowerCase() === "y") {
        event.preventDefault();
        void redoCanvas();
        return;
      }
      if ((event.key === "Delete" || event.key === "Backspace") && selectedObjectId) {
        event.preventDefault();
        void deleteCanvasObject(selectedObjectId);
      }
    };
    window.addEventListener("keydown", onCanvasShortcut);
    return () => window.removeEventListener("keydown", onCanvasShortcut);
  }, [deleteCanvasObject, redoCanvas, selectedObjectId, undoCanvas]);

  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!textDraftsRef.current.size && !saveInFlightRef.current.size) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      for (const timer of saveTimersRef.current.values()) window.clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    const workbench = workbenchRef.current;
    if (!workbench) return;
    const savedWidth = Number(window.localStorage.getItem(paneStorageKey) ?? window.localStorage.getItem(LEGACY_PANE_STORAGE_KEY));
    const update = () => {
      const totalWidth = workbench.getBoundingClientRect().width;
      const preferred = assistantWidthRef.current ?? (Number.isFinite(savedWidth) && savedWidth > 0 ? savedWidth : totalWidth * 0.3);
      const nextWidth = clampAssistantWidth(preferred, totalWidth);
      assistantWidthRef.current = nextWidth;
      setAssistantWidth(nextWidth);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(workbench);
    return () => observer.disconnect();
  }, [paneStorageKey]);

  useEffect(() => {
    if (!focused) return;
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") setFocused(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [focused]);

  useEffect(() => {
    if (!addOpen) return;
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") { setAddOpen(false); setReferenceMode(null); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [addOpen]);

  useEffect(() => {
    const isEditableTarget = (target: EventTarget | null) => {
      const element = target instanceof HTMLElement ? target : null;
      return Boolean(element?.closest("input, textarea, select, [contenteditable='true']"));
    };
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        setCanvasMenu(null);
        setLayoutMenuOpen(false);
        setContextOpen(false);
        setMaterialsOpen(false);
        setMaterialDragging(false);
        return;
      }
      if (event.code !== "Space" || event.repeat || isEditableTarget(event.target)) return;
      event.preventDefault();
      setSpacePanning(true);
    };
    const onKeyUp = (event: globalThis.KeyboardEvent) => {
      if (event.code === "Space") setSpacePanning(false);
    };
    const onBlur = () => setSpacePanning(false);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, []);

  const persistAssistantWidth = useCallback((width: number) => {
    window.localStorage.setItem(paneStorageKey, String(Math.round(width)));
  }, [paneStorageKey]);

  const resizeAssistant = useCallback((nextWidth: number) => {
    const totalWidth = workbenchRef.current?.getBoundingClientRect().width ?? 1200;
    const clampedWidth = clampAssistantWidth(nextWidth, totalWidth);
    assistantWidthRef.current = clampedWidth;
    setAssistantWidth(clampedWidth);
  }, []);

  const handleResizeStart = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (layoutMode !== "canvas-assistant") return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { startX: event.clientX, startWidth: assistantWidthRef.current ?? 360 };
    setIsResizing(true);
  };

  const handleResizeMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    resizeAssistant(dragRef.current.startWidth + dragRef.current.startX - event.clientX);
  };

  const handleResizeEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    dragRef.current = null;
    setIsResizing(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (assistantWidthRef.current) persistAssistantWidth(assistantWidthRef.current);
  };

  const handleResizeKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (layoutMode !== "canvas-assistant") return;
    const current = assistantWidthRef.current ?? 360;
    const next = event.key === "ArrowLeft" ? current + 24
      : event.key === "ArrowRight" ? current - 24
        : event.key === "Home" ? MIN_ASSISTANT_WIDTH
          : event.key === "End" ? MAX_ASSISTANT_WIDTH
            : null;
    if (next === null) return;
    event.preventDefault();
    resizeAssistant(next);
    persistAssistantWidth(next);
  };

  const closeFocus = () => {
    setFocused(false);
    window.requestAnimationFrame(() => document.querySelector<HTMLButtonElement>("[data-draft-edit]")?.focus());
  };

  const openContext = (kind: CanvasContextKind) => {
    onContextKindChange?.(kind);
    setMaterialsOpen(false);
    setMaterialDragging(false);
    setCanvasMenu(null);
    setLayoutMenuOpen(false);
    setContextOpen(true);
  };

  const closeMaterials = () => {
    setMaterialsOpen(false);
    setMaterialDragging(false);
    window.requestAnimationFrame(() => materialsButtonRef.current?.focus());
  };

  const toggleMaterials = () => {
    if (materialsOpen) closeMaterials();
    else { setContextOpen(false); setMaterialsOpen(true); setCanvasMenu(null); setLayoutMenuOpen(false); }
  };

  const clearSelection = () => {
    setSelectedObjectId(null);
    setEditingObjectId(null);
    setFocused(false);
    setNodes((current) => current.map((node) => node.selected ? { ...node, selected: false } : node));
  };

  const chooseCard = (kind: CardKind) => {
    setNodes((current) => current.map((node) => ({ ...node, selected: node.id === kind })));
    setSelectedObjectId(null);
    setEditingObjectId(null);
    setAddOpen(false);
    if (kind === "draft") setFocused(true);
    else if (kind === "suggestion") onLayoutModeChange("canvas-assistant");
    else openContext(kind);
  };

  const openAddMenu = useCallback((position: { x: number; y: number }, sourceObjectId?: string) => {
    insertPositionRef.current = { ...position, ...(sourceObjectId ? { sourceObjectId } : {}) };
    setContextOpen(false);
    setMaterialsOpen(false);
    setMaterialDragging(false);
    setReferenceMode(null);
    setAddOpen(true);
  }, []);

  const chooseAddItem = useCallback((kind: AddChoice) => {
    if (kind === "text") { setCanvasError(""); void createFreeObject("text").catch((error) => setCanvasError(error instanceof Error ? error.message : "节点创建失败。")); return; }
    if (kind === "material" || kind === "image") { setReferenceMode(kind); return; }
    chooseCard(kind);
  }, [createFreeObject]);

  const handleArrange = useCallback((arranged: WorkbenchNode[]) => {
    setNodes(arranged);
    const changes = arranged.flatMap((node) => {
      if (node.type !== "free") return [];
      const object = freeObjectsRef.current.get((node as FreeCanvasNode).data.object.id);
      if (!object) return [];
      const after = { ...objectLayout(object), positionX: node.position.x, positionY: node.position.y };
      const before = objectLayout(object);
      return JSON.stringify(before) === JSON.stringify(after) ? [] : [{ objectId: object.id, before, after }];
    });
    if (!changes.length) return;
    pushCommand({ type: "BATCH_LAYOUT", items: changes });
    void Promise.all(changes.map(({ objectId, before, after }) => persistCanvasLayout(objectId, after, before, false)));
  }, [persistCanvasLayout, pushCommand, setNodes]);

  const freeNodeActions = useMemo(() => ({
    changeText: changeCanvasText,
    deleteObject: (objectId: string) => { setCanvasError(""); void deleteCanvasObject(objectId).catch((error) => setCanvasError(error instanceof Error ? error.message : "节点删除失败。")); },
    startEditing: (objectId: string) => { if (editable) { setSelectedObjectId(objectId); setEditingObjectId(objectId); } },
    stopEditing: (objectId: string) => { setEditingObjectId((current) => current === objectId ? null : current); if (textDraftsRef.current.has(objectId)) void flushTextRef.current(objectId); },
    retrySave: (objectId: string) => { void retryCanvasText(objectId); },
  }), [changeCanvasText, deleteCanvasObject, editable, retryCanvasText]);

  const paneStyle = {
    "--assistant-width": layoutMode === "canvas-assistant" ? (assistantWidth ? `${assistantWidth}px` : "30%") : "0px",
  } as CSSProperties;
  const backgroundColor = backgroundTone === "warm" ? "#ddcdb9" : backgroundTone === "cool" ? "#c8d9ee" : "#d9e2ef";
  const canvasIsEmpty = freeObjects.length === 0 && !hasDraft;

  return (
    <div ref={workbenchRef} className={`content-workbench is-${layoutMode} tool-${activeTool} ${isResizing ? "is-resizing" : ""}`} data-layout={layoutMode} style={paneStyle}>
      <section className={`content-canvas ${materialDragging ? "is-material-drop-ready" : ""}`} data-background-style={backgroundStyle} data-background-tone={backgroundTone} aria-label="内容画布" aria-hidden={layoutMode === "assistant-only"}>
        <ReactFlowProvider>
          <FreeNodeActionsProvider actions={freeNodeActions}>
          <CanvasToolbar
            projectTitle={projectTitle}
            saved={draft.updated}
            menu={canvasMenu}
            materialsOpen={materialsOpen}
            materialCount={sourceOptions.length}
            materialsButtonRef={materialsButtonRef}
            onMenu={(menu) => { setCanvasMenu((current) => current === menu ? null : menu); setContextOpen(false); setMaterialsOpen(false); setMaterialDragging(false); setLayoutMenuOpen(false); }}
            onToggleMaterials={toggleMaterials}
          />
          <CanvasContextBar brief={brief} sources={sources} facts={facts} methods={methods} draft={draft} onOpenContext={openContext} onOpenDraft={() => setFocused(true)} />
          {canvasIsEmpty ? <div className="canvas-empty-state" data-testid="canvas-empty-state"><span><FileText size={19} /></span><strong>画布暂时没有内容</strong><p>从一段文字或项目资料开始，内容会留在这里，方便继续创作。</p><div><button type="button" onClick={() => setFocused(true)} disabled={!editable}>开始写第一版</button><button type="button" onClick={() => openAddMenu({ x: 320, y: 180 })} disabled={!editable}>添加内容</button><button type="button" onClick={() => { onContextKindChange?.("sources"); toggleMaterials(); }}>查看项目资料</button></div></div> : null}
          <ReactFlow
            nodes={nodes}
            edges={relationEdges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onDragOver={(event) => { if (!editable || !event.dataTransfer.types.includes(PROJECT_MATERIAL_DRAG_TYPE)) return; event.preventDefault(); event.dataTransfer.dropEffect = "copy"; setMaterialDragging(true); }}
            onDrop={(event) => {
              if (!editable) return;
              const raw = event.dataTransfer.getData(PROJECT_MATERIAL_DRAG_TYPE);
              if (!raw) return;
              event.preventDefault(); setMaterialDragging(false);
              try {
                const payload = JSON.parse(raw) as ProjectMaterialDrop;
                const source = sourceOptions.find(({ id }) => id === payload.sourceId);
                if (!source || (payload.kind !== "material" && payload.kind !== "image")) throw new Error("资料拖入信息无效。");
                void addProjectMaterial(source, payload, event.clientX, event.clientY);
              } catch (error) { setCanvasError(error instanceof Error ? error.message : "资料拖入失败。"); }
            }}
            onNodeClick={(_event, node) => {
              lastNodeClickAtRef.current = Date.now();
              if (activeTool !== "select") return;
              if (node.type === "free") {
                const objectId = (node as FreeCanvasNode).data.object.id;
                setEditingObjectId((current) => current === objectId ? current : null);
                setSelectedObjectId(objectId);
                setFocused(false);
                setNodes((current) => current.map((item) => ({ ...item, selected: item.id === node.id })));
              } else if (node.type === "card") {
                setSelectedObjectId(null);
                setEditingObjectId(null);
                setNodes((current) => current.map((item) => ({ ...item, selected: item.id === node.id })));
              } else {
                clearSelection();
              }
            }}
            onNodeDoubleClick={(_event, node) => {
              if (activeTool === "select" && editable && node.type === "free" && (node as FreeCanvasNode).data.object.objectType === "TEXT") {
                const objectId = (node as FreeCanvasNode).data.object.id;
                setSelectedObjectId(objectId);
                setEditingObjectId(objectId);
              }
            }}
            onNodeDragStart={(_event, node) => {
              if (node.type !== "free") return;
              const object = freeObjectsRef.current.get((node as FreeCanvasNode).data.object.id);
              if (object) dragStartRef.current.set(object.id, objectLayout(object));
            }}
            onNodeDragStop={(_event, node) => {
              if (node.type !== "free") return;
              const object = freeObjectsRef.current.get((node as FreeCanvasNode).data.object.id);
              if (!object) return;
              const before = dragStartRef.current.get(object.id) ?? objectLayout(object);
              dragStartRef.current.delete(object.id);
              void persistCanvasLayout(object.id, { ...objectLayout(object), positionX: node.position.x, positionY: node.position.y }, before);
            }}
            onPaneClick={(event) => {
              if (Date.now() - lastNodeClickAtRef.current < 180 || (event.target instanceof Element && event.target.closest(".react-flow__node"))) return;
              clearSelection();
              if (event.detail !== 2 || !editable) return;
              const canvas = document.querySelector(".content-canvas .react-flow")?.getBoundingClientRect();
              if (!canvas) return;
              openAddMenu({ x: (event.clientX - canvas.left - viewport.x) / viewport.zoom, y: (event.clientY - canvas.top - viewport.y) / viewport.zoom });
            }}
            onMoveEnd={(_, next) => setViewport(next)}
            defaultViewport={viewport}
            minZoom={0.72}
            maxZoom={1.8}
            nodesDraggable={activeTool === "select"}
            elementsSelectable={activeTool === "select"}
            panOnDrag={activeTool === "pan" ? true : [1, 2]}
            selectionOnDrag={false}
            nodesConnectable={false}
            zoomOnDoubleClick={false}
          >
            {backgroundStyle !== "solid" ? <Background variant={backgroundStyle === "grid" ? BackgroundVariant.Lines : BackgroundVariant.Dots} gap={backgroundStyle === "grid" ? 28 : 24} size={backgroundStyle === "grid" ? 0.7 : 1} color={backgroundColor} /> : null}
            {miniMapOpen ? <MiniMap pannable zoomable nodeStrokeWidth={2} ariaLabel="画布小地图" /> : null}
          </ReactFlow>
          <ProjectMaterialsPanel open={materialsOpen} sources={sourceOptions} editable={editable} onClose={closeMaterials} onAdd={(source, payload) => void addProjectMaterial(source, payload)} onDragState={setMaterialDragging} />
          <CanvasViewMenu menu={canvasMenu} nodes={nodes} backgroundStyle={backgroundStyle} backgroundTone={backgroundTone} layoutMode={layoutMode} miniMapOpen={miniMapOpen} onClose={() => setCanvasMenu(null)} onArrange={handleArrange} onBackgroundStyle={setBackgroundStyle} onBackgroundTone={setBackgroundTone} onLayoutModeChange={onLayoutModeChange} onToggleMiniMap={() => setMiniMapOpen((current) => !current)} />
          <CanvasViewCoordinator request={viewRequest} onHandled={() => setViewRequest(null)} />
          <CanvasChrome addOpen={addOpen} activeTool={activeTool} editable={editable} referenceMode={referenceMode} sourceOptions={sourceOptions} canUndo={editable && undoStackRef.current.length > 0} canRedo={editable && redoStackRef.current.length > 0} onAdd={(position) => openAddMenu(position)} onBack={() => setReferenceMode(null)} onCloseAdd={() => { setAddOpen(false); setReferenceMode(null); }} onChoose={chooseAddItem} onChooseSource={(source, sourceAssetId) => { setCanvasError(""); void createFreeObject(referenceMode === "image" ? "image" : "material", source, sourceAssetId).catch((error) => setCanvasError(error instanceof Error ? error.message : "节点创建失败。")); }} onUndo={() => void undoCanvas()} onRedo={() => void redoCanvas()} onTool={(tool) => { setToolMode(tool); setAddOpen(false); if (tool === "select") clearSelection(); }} />
          {canvasError ? <div className="canvas-operation-error" role="alert"><span>{canvasError}</span><button type="button" onClick={() => setCanvasError("")} aria-label="关闭错误提示"><X size={15} /></button></div> : null}
          </FreeNodeActionsProvider>
        </ReactFlowProvider>

        {focused ? (
          <div className="draft-focus-layer" role="dialog" aria-modal="false" aria-label={`编辑稿件 ${draft.title || "未命名稿件"}`}>
            <section>
              <header>
                <button type="button" autoFocus onClick={closeFocus}><X size={17} />返回画布</button>
                <div><strong>{draft.title || "未命名稿件"}</strong><span>{draft.updated}</span></div>
                <div className="draft-focus-actions">{draftToolbar}<PlatformSelect onPlatform={onPlatform} /></div>
              </header>
              <div className="draft-focus-editor">{draftEditor}</div>
            </section>
          </div>
        ) : null}
      </section>

      <div
        className="workbench-pane-divider"
        role="separator"
        aria-label="调整鑫小助宽度"
        aria-orientation="vertical"
        aria-valuemin={MIN_ASSISTANT_WIDTH}
        aria-valuemax={MAX_ASSISTANT_WIDTH}
        aria-valuenow={assistantWidth ?? 360}
        tabIndex={layoutMode === "canvas-assistant" ? 0 : -1}
        onKeyDown={handleResizeKeyDown}
        onPointerDown={handleResizeStart}
        onPointerMove={handleResizeMove}
        onPointerUp={handleResizeEnd}
        onPointerCancel={handleResizeEnd}
      ><span /></div>

      <aside className="workbench-assistant" aria-hidden={!assistantOpen} inert={!assistantOpen}>
        <header>
          <div className="agent-project-heading">
            <strong title={projectTitle}>{projectTitle}</strong>
            <button type="button" title="切换工作区布局" aria-label="切换工作区布局" onClick={() => setLayoutMenuOpen(current => !current)}><LayoutGrid size={17} /></button>
            {layoutMode !== "assistant-only" ? <button type="button" title="收起对话" aria-label="收起鑫小助" onClick={() => onAssistantOpen(false)}><X size={18} /></button> : null}
          </div>
        </header>
        <div className="workbench-assistant-body">{typeof assistant === "function" ? assistant({ focus: focused ? "draft" : selectedKind, openContext, openDraft: () => setFocused(true), selectedObject: selectedAssistantObject, projectMaterials: sourceOptions, canvasObjects: freeObjects, onObjectCreated: (object) => { upsertObject(object); setSelectedObjectId(object.id); setEditingObjectId(null); pushCommand({ type: "CREATE", objectId: object.id }); setViewRequest({ ids: [`object:${object.id}`], revision: Date.now(), mode: "follow" }); window.requestAnimationFrame(() => setNodes((current) => current.map((node) => ({ ...node, selected: node.id === `object:${object.id}` })))); } }) : assistant}</div>
      </aside>

      <WorkbenchLayoutMenu current={layoutMode} open={layoutMenuOpen} onClose={() => setLayoutMenuOpen(false)} onChange={onLayoutModeChange} />

      {contextOpen ? (
        <div className="canvas-tools-layer" onPointerDown={(event) => { if (event.target === event.currentTarget) setContextOpen(false); }}>
          <aside role="dialog" aria-modal="false" aria-label="当前创作内容">
            <header><strong>当前创作内容</strong><button type="button" aria-label="关闭当前创作内容" onClick={() => setContextOpen(false)}><X size={18} /></button></header>
            {contextTools}
          </aside>
        </div>
      ) : null}
    </div>
  );
}

export function ContentCanvas(props: CanvasSurfaceProps) {
  return <CanvasSurface {...props} />;
}
