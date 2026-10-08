# 深色星舰 · UI 优化提示词包（可直接投喂代码 Agent）

> 用途：把这套提示词交给 Codex / Cursor / Claude Code 等代码 Agent，在本仓库（Next.js 16 + Tailwind v4 + 自研 CSS 变量体系）内做**全局视觉升级**。
> 目标：保留截图中的组件排版骨架（顶部工具栏 + 左侧导航 + KPI 指标组 + 主图 + 侧栏卡片 + 表格 + 关系图），把画面做成**丰富、引人注目、前沿科技感**的深色星舰风格。
> 状态标注遵循 [AGENTS.md](../AGENTS.md) 与 [PRODUCT.md](../PRODUCT.md)：本次只做视觉与呈现层升级，属 `CURRENT IMPLEMENTATION` 内的体验优化，不改变 `INVARIANT` 与产品对象定义。

---

## 0. 使用方式

| 场景 | 用哪一段 |
| --- | --- |
| 一次性交给 Agent 做全局升级 | [§1 主控提示词](#1-主控提示词全局设计系统升级) 全文 |
| 分步施工（推荐，便于小 diff 收口） | §1 先跑，再按 [§2 分模块提示词](#2-分模块提示词按组件逐个升级) 逐个投喂 |
| 只要改配色 token | [§3 视觉规格书](#3-视觉规格书单一事实来源) 的 §3.2 令牌表 |
| 出图/设计工具（Figma AI、即梦等） | [附录 A 出图提示词](#附录-a-出图提示词非代码场景) |

**投喂顺序建议**：先 §1（骨架与令牌）→ 再 §2.1 壳层 → §2.2 KPI → §2.3 图表 → §2.4 其余卡片。每步完成即验证再进入下一步。

---

## 1. 主控提示词（全局设计系统升级）

```text
【角色】
你是资深产品设计工程师，负责一个已上线的中文 AI 内容工作台的视觉升级。你的产出必须可直接编译运行，不引入新依赖。

【仓库事实（请先自行核对，不要凭猜测改文件）】
- Next.js 16 App Router + React 19 + Tailwind CSS v4 + TypeScript。
- 全局样式：apps/web/app/globals.css（浅色 token 基线）、apps/web/app/black-titanium.css（当前生效的深色 token 与组件覆盖）、apps/web/components/app-shell.css、apps/web/components/product-v3.css、apps/web/app/apple-workbench.css。
- 根布局 apps/web/app/layout.tsx 里 <body data-theme="black-titanium">，即当前全站已是深色主题。
- 设计系统组件：packages/ui/src/{card,console-card,console-kpi,button,badge,input}.tsx。
- 壳层：apps/web/components/app-shell.tsx（.xsj-app-topbar / .app-sidebar-* ）、apps/web/components/sidebar-foundation.tsx（.xsj-app-sidebar）。
- 概览区：apps/web/components/fusion-overview.tsx（.fusion-* ），及其样式所在的 black-titanium.css。
- 图标库 lucide-react；**当前没有图表库**，不要安装 recharts / echarts / d3。
- CSS 命名现实：大量样式是 `.xsj-*`、`.app-sidebar-*`、`.fusion-*`、`.settings-v1` 这类手写类名 + CSS 变量，不是纯 Tailwind 原子类。
- **已存在一套深色"指挥台"令牌**：`apps/web/app/globals.css` 末尾的 `[data-surface="console-dark"]` 块（约 4225-4269 行）已用 `#0A0E17 / #121826 / #38BDF8 / #A78BFA` 定义了深空蓝黑的 background、surface、accent、border，并带 `--data-1/--data-2/--data-3` 图表数据色。
  → **优先复用并扩展这套令牌**，把全站深色基线向它对齐；不要另造第三套颜色体系。

【硬约束】
1. 只改视觉与呈现层：CSS 变量、样式文件、必要的展示型 JSX 结构（增删包裹层、图标、装饰元素）。
2. 不改任何服务端逻辑、数据库、API、路由语义、权限判断、数据获取。不得用 UI 隐藏代替安全边界。
3. 不新增依赖、不新增图表库、不改 package.json、不跑 migration。
4. 不改 packages/ui 组件的对外 props 签名；只允许在组件内部增加装饰层或可选样式。
5. 不得为了好看而新增功能、页面、业务字段或假数据；现有文案与数字口径保持原样（"演示数据"类标注不得删除）。
6. 必须保留现有可达性与交互契约：焦点环、aria-*、键盘操作、prefers-reduced-motion 分支、对比度。
7. 一次任务只做一个小 diff：先改令牌与基础层，再逐个组件。不要顺手重构无关模块、不要统一命名、不要格式化无关文件。
8. 视觉风格沿用深色基底，**不要**新增浅色主题分支，不要改动 <body data-theme> 的值。

【任务】
在不改变组件排版骨架的前提下，把全站深色界面从"能用的深灰后台"升级为"深空星舰指挥台"：
- 基底由中性黑灰转向深空蓝黑，空间感更强（星野/极光/网格/玻璃层）。
- 层次由"平面卡片"升级为"玻璃面板 + 边缘高光 + 悬浮抬升"，信息密度保持当前水平。
- 强调色由单一浅蓝升级为"青→蓝→紫"渐变体系，配合呼吸光与状态色，形成科技感。
- 数据展示具备"被设计过"的观感：大字号 tabular-nums、发光迷你趋势线、进度条、时段热力条。
- 动效克制但可感知：数值入场、面板浮入、扫描高光，全部可被 prefers-reduced-motion 关闭。

【交付步骤】
第 1 步：先输出一份"改动清单"，逐条写成 文件路径 → 定位锚点（现有选择器/行号附近）→ 要做什么 → 为什么不会破坏功能。
第 2 步：等我确认后，按清单施工；每完成一层就停下来说明 diff 范围。
第 3 步：给出验证结果（见 §4），未运行的验证必须明确说明未运行。

【输出要求】
- 使用 `STATUS / CHANGED / BOUNDARY / VERIFICATION / RISKS / GIT` 六段式简短报告。
- 明确列出 BOUNDARY：本次只动了视觉层，未触碰 X / Y / Z。
- 全程不执行 git add / git commit / push。
```

---

## 2. 分模块提示词（按组件逐个升级）

> 每个子提示词都可独立投喂；开头沿用 §1 的【角色】【仓库事实】【硬约束】。

### 2.1 应用外壳：顶部工具栏 + 左侧导航（.xsj-app-topbar / .xsj-app-sidebar）

```text
【范围】apps/web/components/app-shell.css、apps/web/components/app-shell.tsx、apps/web/components/sidebar-foundation.tsx 的视觉层。

【目标】把"深灰 macOS 顶栏 + 朴素列表侧栏"改造成"星舰驾驶舱骨架"，信息结构不变。

【具体做法】
1. 顶栏 .xsj-app-topbar：
   - 背景改为 44px 高的半透明玻璃层：linear-gradient(180deg, rgba(14,22,38,.92), rgba(10,16,28,.78)) + backdrop-filter: blur(18px) saturate(1.25)。
   - 底边加 1px 渐变发光描边（左透明→中青蓝→右透明），而不是实线边框。
   - 品牌名左侧加一个 2px 宽的竖向青色发光条（纯装饰，aria-hidden）。
   - 导航项（文件/编辑/视图/窗口/帮助）：hover 用 rgba 青色 8% 填充 + 文字提亮 + 底部 2px 光条；[aria-expanded="true"] 保持与 hover 一致且光条常亮。
   - 窗口控制按钮 hover 加 1px 青色描边与轻微内发光；不要改变按钮尺寸与位置。
2. 侧栏 .xsj-app-sidebar：
   - 背景：垂直渐变（顶部 #0f1725 → 底部 #0a1018），右边界加 1px 渐变发光描边；展开/收起时该描边不得抖动。
   - 导航项 .app-sidebar-navigation > a：默认文字 var(--text-secondary)；hover 时左侧出现 2px 高亮滑轨（用 ::before，宽 2px，圆角，青色→蓝色渐变）+ 背景 rgba(90,160,255,.08)。
   - 选中态 a[aria-current="page"]：背景用"青色 10% 线性渐变 + 左侧 3px 实心光条 + 图标青色发光（filter: drop-shadow(0 0 6px rgba(60,200,255,.55))）"，文字 var(--text)。
   - 分组标题（最近项目 / 项目分组）加 letter-spacing 与更小字号，形成"仪表标签"质感。
   - 项目行图标底色改为 rgba(90,160,255,.10)，圆角 5px；行 hover 时图标底色加深、左侧出现 1px 连接线。
   - 搜索入口 .app-sidebar-search .global-search-trigger：改为"玻璃胶囊"，1px rgba(120,190,255,.18) 描边，hover 时描边变亮并出现外发光。
   - 账号区 .app-sidebar-account：顶边 1px 渐变分隔线；头像外圈加 1px 青色描边与柔和外发光。
3. 所有 transition 统一用 var(--motion-fast)/var(--motion-base) + var(--ease-standard)。
4. 保持收起态（.is-collapsed/.is-temporary/.is-pinned）的布局数值不变：宽度、图标槽位、隐藏逻辑一律照旧。

【自检】顶栏高 44px 不变；侧栏展开 256px / 收起 64px 不变；键盘 Tab 焦点环可见；无横向滚动条新增；对比度文本 ≥ 4.5:1。
```

### 2.2 KPI 指标卡组（.fusion-metrics / ConsoleKpi / ConsoleCard）

```text
【范围】packages/ui/src/console-kpi.tsx、packages/ui/src/console-card.tsx、packages/ui/src/card.tsx 的样式层，以及 apps/web/app/black-titanium.css 中 .fusion-metrics 相关规则。

【目标】把"四个灰底数字块"改造成截图里那种会呼吸的发光指标卡，且保持 props 与数据口径不变。

【具体做法】
1. ConsoleCard / Card：统一为玻璃面板
   - background: linear-gradient(160deg, rgba(24,38,62,.72), rgba(14,22,38,.86));
   - border: 1px solid rgba(120,190,255,.14)；
   - border-radius: var(--radius-panel)（不要每处硬编码新值）；
   - box-shadow: 0 18px 40px -28px rgba(0,0,0,.9), inset 0 1px 0 rgba(180,220,255,.06)；
   - backdrop-filter: blur(16px) saturate(1.2)。
2. 顶部高光条：用 ::before 在卡片顶部画 1px 渐变线（transparent → rgba(120,210,255,.55) → transparent），纯装饰。
3. ConsoleKpi：
   - 数值字号保持当前 48px 量级，颜色改 var(--text)，并加 text-shadow: 0 0 22px rgba(90,190,255,.28)；
   - 数字必须 font-variant-numeric: tabular-nums；
   - 单位"万"用 var(--text-secondary)；
   - 在标题左侧的 3px 竖条改为"青色→紫色渐变 + 外发光"（保持 aria-hidden）；
   - 允许在卡片右上角加一个 aria-hidden 的迷你趋势线占位（纯 CSS/SVG 装饰，不接数据；若无数据来源宁可留白，不要造数字）。
4. .fusion-metrics > a：
   - 默认与 hover 增加 1px 抬升（transform: translateY(-2px)）与描边提亮；
   - 左侧加 8px 宽的柔光色块（不同卡片用青/蓝/紫/绿区分，仅作视觉分类，不新增业务含义）；
   - "查看详情 ↗" 小链接 hover 时箭头右移 2px。
5. 全部动效受 @media (prefers-reduced-motion: reduce) 关闭。

【禁止】不要改动 value/title/description 的语义与格式化规则；不要新增假数据或 placeholder 数字。
```

### 2.3 数据可视化（趋势图 / 进度条 / 时段热力 / 关系图）

```text
【范围】现有展示数据的组件与样式。先搜索确认：仓库当前没有图表库，不得安装任何图表依赖。

【目标】用纯 CSS + 内联 SVG 做出"发光数据层"，达到截图里趋势线、横向进度条、活跃时段柱、账号矩阵关系图的观感。

【具体做法】
1. 趋势图（折线）：用内联 <svg viewBox> 绘制 path。
   - 线：stroke 用 linearGradient（青 #3fd8ff → 蓝 #4b8dff → 紫 #8b5cff），stroke-width 2，stroke-linecap round；
   - 线下方填充：同色 0→18% 透明渐变（linearGradient with stops rgba(...,.28) → transparent）；
   - 数据点：圆形 2.5px，同色，带 drop-shadow 光晕；当前最新点额外加一个静态外圈（不要做成无限动画）；
   - 网格：1px rgba(255,255,255,.05) 横线 + 纵线，坐标轴文字 var(--text-tertiary) 10-11px；
   - 图表容器底部加 2px 渐变底线。
2. 横向进度条（地域/年龄分布）：
   - 轨道：rgba(255,255,255,.06)，高 6px，圆角 999px；
   - 填充：青蓝渐变 + 右端 1px 白色高光；宽度用 style 内联百分比；
   - 数值用 tabular-nums 右对齐。
3. 时段热力条（24 小时活跃度）：
   - 24 个 4-5px 圆角小柱；非活跃 rgba(255,255,255,.08)；
   - 活跃柱用青→紫渐变并按强度调整高度与 opacity；
   - 峰值时段对应的标签用强调色，文字保持原数值。
4. 关系图（账号矩阵）：
   - 中心节点：圆形玻璃面板 + 2px 渐变描边 + 外发光环 + 内层柔光；
   - 周边节点：小圆形，1px 弱描边 + 品牌色点缀（保持 lucide 图标）；
   - 连线：1px 渐变曲线（用 path/quadratic），透明度 .25-.45；
   - 不引入 @xyflow/react 的交互重写；如果现有实现已用 React Flow，则只改其外观样式，不改交互逻辑。
5. 统一：所有图形元素 aria-hidden 或提供等效文本；纯装饰动画限制在 transform/opacity，且提供 reduced-motion 关闭。

【强制】不得为了"看起来丰富"编造数据点或百分比；所有数字必须来自现有 props/查询结果。若某模块暂无数据，保留现有空态文案。
```

### 2.4 内容卡片与表格（优秀作品表 / 最近项目 / 流程卡 / 登录页）

```text
【范围】.fusion-recent、.fusion-flow、.fusion-auth*、.settings-v1、source/asset 列表卡片，以及 product-v3.css 中的通用面板。

【具体做法】
1. 表格/榜单行：hover 时整行提亮 rgba(90,160,255,.06) + 左侧 2px 高亮条；排名徽章（1/2/3）改为"渐变描边圆角方块 + 数字渐变文字"，保持原有字符内容。
2. 缩略图/封面：统一 1px 弱描边 + 圆角 var(--radius-card) + 顶部内高光；封面容器加轻微 inset 阴影营造凹槽感。
3. 流程卡 .fusion-flow > a：序号方块改为渐变描边 + 青色数字；hover 时箭头右移、整块抬升 1px；连接线用 1px 渐变竖线（::before）。
4. 空态 .fusion-empty：改为居中排版 + 图标 + 一句行动建议的层级，保持原文案语义不变。
5. 登录/认证页 .fusion-auth*：左侧叙事区在星野背景上加 1px 渐变分割线与缓慢流动的极光层（transform 动画、可 reduced-motion 关闭）；右侧表单卡用玻璃面板 + 顶部高光；输入框 focus 用双层环（1px 强调边 + 3px 半透明外环）。
6. 按钮：主按钮用青蓝渐变 + 内高光 + hover 亮度提升；次按钮玻璃描边；危险操作仍用 var(--danger) 语义色，不要用渐变弱化危险感。

【禁止】不要为了视觉统一改写业务文案、术语或工作流顺序；不要删除"演示数据""平台尚未接入"这类状态标注。
```

---

## 3. 视觉规格书（单一事实来源）

> 施工时以本表为准，避免各组件各自发明颜色。所有颜色建议直接落成 CSS 变量（在 black-titanium.css 的 :root 内替换/扩展），不要在组件里散落硬编码色值；确需一次性装饰色时集中到文件顶部注释说明。

### 3.1 气质关键词

深空、星舰指挥台、冷冽、精密、玻璃与金属、青蓝极光、数据发光、克制的动效。
**反例（不要）**：赛博朋克霓虹紫红、荧光绿黑客风、玻璃拟态泛滥导致对比度不足、满屏无限动画、为视觉牺牲信息密度。

### 3.2 令牌表（深色 · 建议值）

> **先复用，再扩展**：仓库里已经有 `[data-surface="console-dark"]` 这套深空令牌（`apps/web/app/globals.css` 约 4225-4269 行）：
> `--background:#0A0E17`、`--surface:#121826`、`--surface-secondary:#182031`、`--border:#232D42`、`--text:#E8EDF7`、`--accent:#38BDF8`、`--accent-strong:#0EA5E9`、`--success:#34D399`、`--danger:#FB7185`、`--warning:#FBBF24`、数据色 `--data-1/2/3 = #38BDF8 / #A78BFA / #34D399`。
> **施工首选**：把这套值提升为全站深色基线（或让 `body[data-theme="black-titanium"]` 的变量与它对齐），下表用于补齐它缺失的层级（玻璃、发光、渐变），而不是另造一套。

| 令牌 | 建议值 | 用途 |
| --- | --- | --- |
| `--background` | `#070b14` | 页面最底 |
| `--background-deep` | `#04070d` | 遮罩/凹陷区 |
| `--surface` | `#0e1626` | 卡片底 |
| `--surface-secondary` | `#131d30` | 次级面板、hover 底 |
| `--surface-elevated` | `#17233a` | 浮层、菜单 |
| `--surface-glass` | `rgb(16 24 40 / 0.72)` | 玻璃层 |
| `--border` | `#1e2b45` | 常规描边 |
| `--border-strong` | `#2c3d5e` | 强调描边 |
| `--text` | `#e8f1ff` | 主文本 |
| `--text-secondary` | `#93a8c6` | 次文本 |
| `--text-tertiary` | `#6b7f9c` | 辅助/轴标签 |
| `--accent` | `#4cc9ff` | 主强调（青） |
| `--accent-strong` | `#8b5cff` | 渐变第二端（紫） |
| `--accent-soft` | `rgb(76 201 255 / 0.14)` | 选中底 |
| `--accent-border` | `rgb(76 201 255 / 0.38)` | 强调描边 |
| `--accent-ring` | `rgb(76 201 255 / 0.22)` | 焦点环 |
| `--success` | `#3ddc97` | 正向 |
| `--warning` | `#f0b45e` | 警示 |
| `--danger` | `#ff6b6b` | 危险 |
| `--gradient-brand` | `linear-gradient(90deg,#3fd8ff,#4b8dff,#8b5cff)` | 品牌渐变 |
| `--gradient-panel` | `linear-gradient(160deg,rgba(30,50,80,.72),rgba(12,20,34,.88))` | 玻璃面板 |
| `--glow-accent` | `0 0 24px rgb(76 201 255 / .28)` | 发光阴影 |
| `--shadow-card` | `0 18px 40px -28px rgb(0 0 0 / .9)` | 卡片阴影 |
| `--shadow-panel` | `0 28px 70px -40px rgb(0 0 0 / .95)` | 面板阴影 |

### 3.3 背景与空间层（建议叠 4 层，全部 position: fixed 或伪元素，pointer-events: none）

1. 基色：`--background` 径向/线性渐变（左上偏青、右下偏紫，透明度 ≤ 10%）。
2. 星野：极低对比的散点（CSS radial-gradient 重复或内联 SVG），透明度 3%-6%，不随滚动闪烁。
3. 网格：48px 见方的细线网格，透明度 2%-4%，可用 mask 向边缘淡出。
4. 极光：1-2 个大半径径向光斑（青/紫），blur(80px) 以上，透明度 ≤ 12%，**静态或极慢漂移**。

### 3.4 材质与描边配方

- 玻璃面板：`background: var(--gradient-panel)` + `backdrop-filter: blur(16px) saturate(1.2)` + 1px `rgba(120,190,255,.14)` 描边 + `inset 0 1px 0 rgba(180,220,255,.06)`。
- 顶部高光：`::before` 1px 渐变线（transparent → rgba(120,210,255,.55) → transparent）。
- 强调元素（选中/主按钮）：1px `--accent-border` + `--glow-accent`，避免厚重外发光。
- 圆角：沿用现有 `--radius-card` / `--radius-panel`，不要新增一套半径。

### 3.5 字体与数字

- 中文：继续使用现有字体栈（不要引入 Web Font，避免首屏抖动）。
- 数字：所有指标、百分比、时间统一 `font-variant-numeric: tabular-nums`。
- 层级：页面主标题 28-32px/600；卡片标题 15-16px/600；指标数值 44-52px/600；辅助 11-12px。
- 字距：中文标题 `letter-spacing: -0.02em`；仪表类小标签用 `+0.08em` + 小字号形成科技标签感。

### 3.6 动效规格

| 场景 | 时长/曲线 | 说明 |
| --- | --- | --- |
| hover / 焦点 | 120-160ms `--ease-standard` | 只动 color/background/border/transform |
| 面板浮入 | 180-220ms | `translateY(6px)` + opacity 0→1，最多一次 |
| 数值入场 | 400-600ms 一次性 | 数字滚动或淡入，不做循环 |
| 装饰扫描 | ≥ 6s 循环 | 仅 transform/opacity，透明度峰值 ≤ 8% |

**硬性要求**：`@media (prefers-reduced-motion: reduce)` 下，上述全部动画降级为无动画（保留终态）。

### 3.7 密度与可达性红线

- 不降低现有信息密度；卡片内边距变动幅度控制在 ±4px 内。
- 正文对比度 ≥ 4.5:1，大号数字 ≥ 3:1；不得让装饰光晕压过文字。
- 键盘焦点环在深色底上必须可见（用 `--accent-ring` + 1px 实边）。
- 所有装饰性元素 `aria-hidden="true"`；不改变任何 aria 语义与键盘顺序。

---

## 4. 施工范围与验收

### 4.1 允许触碰的文件（预计）

- `apps/web/app/black-titanium.css`（令牌与组件覆盖，主战场）
- `apps/web/app/globals.css`（仅补充深色下需覆盖的基础层；不动浅色基线值）
- `apps/web/components/app-shell.css`
- `apps/web/components/app-shell.tsx`、`apps/web/components/sidebar-foundation.tsx`（仅装饰层与类名）
- `apps/web/components/fusion-overview.tsx`（仅结构装饰）
- `packages/ui/src/{card,console-card,console-kpi}.tsx`（样式与装饰层）

### 4.2 禁止触碰

服务端 `server/`、`app/api/`、Prisma schema 与 migration、Provider/Adapter、权限与 scope 逻辑、`PRODUCT.md`/`ARCHITECTURE.md`/`LEGACY.md`/`AGENTS.md`、任何业务文案与数据口径。

### 4.3 验证清单（V1 等级，只跑直接相关项）

```bash
pnpm --filter @content-center/web typecheck
pnpm --filter @content-center/web lint
```

人工核对（必须逐条回答"是/否"，不得凭印象）：

1. 顶栏高度 44px、侧栏展开 256px / 收起 64px 是否与改造前一致？
2. 键盘 Tab 一圈，焦点环是否始终可见？
3. 系统开启"减少动态效果"后，是否所有装饰动画停止、内容仍完整可见？
4. 缩放/窄屏（≤1000px、≤640px）是否有新增溢出或遮挡？
5. 是否有任何数字、文案、按钮位置被改动？如有，逐条列出并说明原因。
6. 是否新增依赖？（答案必须是"否"）
7. `globals.css` 中 `[data-surface="console-dark"]` 令牌块是否仍完整可用（未被删除或改坏）？

### 4.4 报告格式

```text
STATUS:
CHANGED:（文件 → 位置 → 内容）
BOUNDARY:（明确本次未触碰的模块）
VERIFICATION:（已跑命令与结果；未跑项明确标注未运行）
RISKS:
GIT: READY_TO_STAGE / READY_TO_COMMIT（未执行 git add / commit）
```

---

## 附录 A 出图提示词（非代码场景）

> 用于 Figma AI / 即梦 / Midjourney 等，只出视觉稿，不改代码。

```text
一张 16:9 深色科技感数据看板 UI 界面设计稿。深空蓝黑基底（#070b14），叠加极低对比度的星野散点与 48px 细线网格，左上青蓝、右下紫色的大半径柔和极光光斑。
布局（严格保留）：顶部 44px 半透明玻璃工具栏（左侧品牌标识，中部导航，右侧窗口控制）；左侧 256px 玻璃侧边栏（品牌区、搜索胶囊、图标+文字一级导航、项目列表分组、底部账号区）；主内容区顶部一行 4 张 KPI 指标卡（大号发光数字 + 迷你趋势线 + 环比标签）；中部左侧大尺寸折线趋势图卡（青蓝紫渐变发光线、渐变填充、细网格），右侧粉丝画像卡（地域/年龄横向渐变进度条 + 24 小时活跃度渐变光柱，峰值高亮）；下部左侧排行榜表格（排名徽章 + 缩略图 + 三列数值），右侧账号矩阵关系图（中心玻璃圆形节点 + 外发光环 + 周边小节点 + 渐变曲线连线）。
材质：玻璃拟态面板、1px 青蓝弱描边、顶部 1px 高光渐变线、柔和外发光、克制的悬浮阴影。强调色为青 #4cc9ff → 紫 #8b5cff 渐变。数字使用等宽对齐、冷白 #e8f1ff。
风格：精密、冷冽、高端、信息密度高但不拥挤，类似科幻电影中的星舰指挥台 HUD。不要赛博朋克紫红霓虹，不要荧光绿，不要卡通，不要 3D 写实星球，不要杂乱装饰。
中文界面文案，字体为现代中文无衬线，层级清晰。
```

---

## 附录 B 约束短语（可反复粘贴给 Agent）

```text
只做视觉层：不改服务端逻辑、数据库、API、路由、权限、文案与数据口径。
不新增依赖、不新增图表库、不改 package.json、不跑 migration。
保留组件排版骨架与所有布局尺寸，保留 aria 与键盘可达性。
装饰动画全部支持 prefers-reduced-motion 关闭，不编造任何数据。
小 diff 收口，不顺手重构无关模块，不执行 git add / commit / push。
```
