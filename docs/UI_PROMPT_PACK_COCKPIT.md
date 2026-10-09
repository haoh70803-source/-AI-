# 鑫世界 AI 工作台 · UI 改造提示词模板 V2（经营驾驶舱 / 增量改造版）

> 版本：V2.0 · 取代 [UI_PROMPT_PACK_STARSHIP.md](UI_PROMPT_PACK_STARSHIP.md)（V1 的深空/发光方案已被部分落地，本版改为对齐新的经营驾驶舱视觉，并强制"先审计、再增量"）
> 配套：[UI_AUDIT_AND_ROADMAP_V1.md](UI_AUDIT_AND_ROADMAP_V1.md)（现有项目审计与实施方案）
> 仓库：`E:\AI工作台1.2` · Next.js 16 + React 19 + Tailwind v4 + 自研 CSS 变量体系

---

## 0. 怎么用这份模板

| 你的目的 | 投喂内容 |
| --- | --- |
| 让 Agent 先摸清现状 | **§2 审计提示词**（只读，不改代码） |
| 首页经营驾驶舱改造 | **§3 首页驾驶舱主提示词** |
| 全局视觉对齐 | **§4 Design System 提示词** |
| 逐页收口 | **§5 分模块提示词** |
| 验收 | **§6 验收标准**、**§7 禁止清单** |

**铁律**：一次投喂只做一件事。先审计 → 再令牌 → 再首页 → 再其他页。任何一步都不允许"顺手重构"。

---

## 1. 已确认的仓库事实（写进提示词，避免 Agent 猜测）

> 以下为审计得出的既有事实，投喂时应整段带上。详细证据见 [审计报告](UI_AUDIT_AND_ROADMAP_V1.md)。

```text
【当前真实状态 · 请勿重新发明】
1. 全站已是深色：apps/web/app/layout.tsx 的 <body data-theme="black-titanium">，
   深色令牌在 apps/web/app/black-titanium.css。
2. 存在专用深色数据面板令牌：[data-surface="console-dark"]，位于 apps/web/app/globals.css 约 4227 行起，
   已定义 background/surface/border/text/accent 与 --data-1/2/3 图表色，以及 --gradient-brand、--gradient-panel、--glow-accent。
3. 首页路由是两个不同入口，视觉语言目前不一致：
   - /home  → apps/web/components/video-analytics-workspace.tsx（深色运营指挥台，已有 KPI/趋势/画像/作品/账号）
   - /dashboard（无 project 参数）→ apps/web/components/workbench-start.tsx（浅色工作台起始页，imports home-reference.css）
   后者是本次首页视觉不一致的主要来源，必须一并处理。
4. 已有设计系统组件，不要另起一套：
   packages/ui/src/{card,console-card,console-kpi,button,badge,input}.tsx
   ConsoleKpi 已带 console-kpi-starship / console-kpi-number 类名，globals.css 已有对应样式（约 4277-4316 行）。
5. 已有图表实现：apps/web/components/video-analytics-workspace.tsx 内的 Trend 组件用内联 SVG 手绘折线，
   缺失值以空档处理；Distribution / va-hours 用 CSS 变量绘制横向进度条与时热力条。
   仓库没有任何图表库（recharts/echarts/d3 均未安装），本次也不得安装。
6. 首页数据链路：apps/web/lib/video-analytics.ts（selectVideoAnalytics / createVideoDemo / fromVideoRecords）
   + /api/video-data + VideoDailyMetric 表。演示数据与真实数据通过 demo 状态隔离，演示数据不写库。
7. 导航壳层：apps/web/components/app-shell.tsx（.xsj-app-topbar / .app-sidebar-*）
   + apps/web/components/sidebar-foundation.tsx（.xsj-app-sidebar）。
8. 全站已有较完整的 prefers-reduced-motion 处理（globals.css 内约 20 处、各组件 CSS 亦有），
   新增动画必须沿用同一约定，不要引入无降级的持续动画。
```

**已存在但未被导航暴露的资产**（不要删，不要擅自接入）：`fusion-overview.tsx`（.fusion-* 概览）、`video-center.tsx`（运营管理，已通过首页 accounts/content/records 三个 tab 复用）。

### 1.0 三条必须先知道的真相（否则会画出空壳）

审计已确认以下三条，投喂时务必带上：

**① 接口 `metrics` 与首页 KPI 同名不同义**
`/api/video-data` 返回的 `metrics` 是**"今日"**口径（`server/video-operations/service.ts:43`）；
首页 KPI 显示的是**"所选周期"**口径，由客户端用 `records + comparisonRecords` 重算（`lib/video-analytics.ts:19-21,61,83`）。
**改造时不要用接口的 `metrics` 去喂 KPI 卡**，否则数字会莫名其妙地变成单日值。

**② 作品榜与粉丝画像在真实模式下必然为空**
- 作品级数据：`VideoDailyMetric` **没有 `workId` 列**，`fromVideoRecords` 直接置 `works: []`（`lib/video-analytics.ts:19-22`）
  → 作品榜、作品详情、作品趋势在真实模式下**永远没有数据**。
- 粉丝画像：真实模式 `audiences: []` 且 `followers` 恒为 `null` → 权重为 0 → `profile` 返回 `null`（`lib/video-analytics.ts:78-80`）。
- **因此这两块的视觉改造要以"空态设计"为主要验收对象**，不要照参考稿画满屏环形图与气泡。

**③ 演示模式下管理 tab 仍会挂载真实管理界面**
`accounts / content / records` 三个 tab 在演示模式下依然渲染 `<VideoCenter mode="data">`（`video-analytics-workspace.tsx:87,107`），
而 `VideoCenter` 自身取数与写入不受 demo 开关控制（`video-center.tsx:60-78,113-127`）。
界面声明"演示账号不会写入数据库"与实际行为有落差——**本次只报告不动它**，但改造时不要把这个声明做得更醒目。

### 1.1 参考稿的视觉配方（截图逐项拆解 · 施工时照此对齐）

| 截图区域 | 视觉事实（可量化） | 本仓库对应落点 |
| --- | --- | --- |
| 应用外壳 | 外层近黑底 + 一道大半径蓝色辉光从左侧/顶部溢出；应用区圆角约 16px，比内层卡片更亮一档 | `body` 背景层 + `.app-shell`；注意现有 `black-titanium.css` 无辉光层 |
| 侧边栏 | 比主区更亮的"抬升面板"，轮廓由比自身更亮的细边勾出；分组标签小号大写字母间距大；选中项 = 淡紫填充 + 紫字 + 圆角 10px | `.xsj-app-sidebar`、`.app-sidebar-navigation > a[aria-current="page"]` |
| 顶栏搜索 | 高约 40px 的圆角矩形输入框，内含放大镜 + 占位文字 + 右侧 `⌘K`；无独立顶栏分隔线 | `.xsj-app-topbar` 目前是仿 macOS 菜单栏，需按 §5.1 改造 |
| KPI 指标卡 | 每张卡底部有**不同的迷你可视化**（点阵 / 平滑面积波 / 折线+点）；数值约 32-40px；环比行是"细箭头 + 百分比 + 灰色对比周期文字"；左上角有绿色 `Live` 胶囊 | `ConsoleKpi` + 新增迷你图形插槽；胶囊可复用于"演示模式/真实记录" |
| 大卡（环形） | 粗环形（约 20px 环宽），中心放最大值 + 文字说明；右侧图例为"色点 + 名称 + 金额 + 百分比"四列 | 现有 `Distribution` 是横条，若新增环形必须内联 SVG |
| 漏斗卡 | 平滑流动的渐变带（紫→蓝→青→薄荷），顶部四列阶段指标（名称 / 大数值 / 百分比胶囊），阶段间虚线引导，底部一行总转化率 | 现有仓库无漏斗；属可选增强，需真实阶段数据支撑 |
| 分布卡 | 横条轨道很细（约 4-6px），填充为纯色或双色渐变，右列数值单独成列右对齐 | `.va-distribution-row`（已有，增强即可） |
| 气泡卡 | 4 个大小不等的实心圆（紫/薄荷/青/蓝），圆内两行文字 | 可选；仅在真实分类占比存在时使用 |
| 动态列表 | "描述文字 + 相对时间"两列，行间无分隔线，靠间距分隔 | `.fusion-recent` / 最近创作区 |
| 通用规则 | 卡片描边极低对比（约 8% 白）、圆角统一约 12-16px、卡片间距约 12-16px、内边距约 20-24px；字号三档（约 22-24 / 14-16 / 11-12px）；无重投影、无霓虹描边 | §4 Design System |

> **重要提醒**：截图是英文营收类产品的示意数据。**只借鉴版式、密度与视觉语言，指标名称与数值一律使用本仓库真实数据口径**（播放量/互动量/净增粉丝/作品数/任务），严禁照搬 `$248,420`、`MRR`、`Conversion Rate` 之类的字段名与数字。

### 1.2 版式蓝图（把现有 va-* 网格改成 Bento）

现状（`video-analytics-workspace.tsx:110-114`，样式 `video-analytics-workspace.css:33-36`）：

```text
.va-top-grid   = [ .va-metrics(3 张卡) | .va-review ]   1.65fr : 1fr
.va-main-grid  = [ .va-trend          | .va-audience ]  1.65fr : 1fr
.va-bottom-grid= [ 作品榜             | 账号表现 ]
```

目标（12 列 Bento，行间 gap 16px，与参考稿一致）：

```css
.va-cockpit { display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); gap: 16px; }
.va-cockpit > .va-metrics   { grid-column: 1 / -1; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 16px; }
.va-cockpit > .va-trend     { grid-column: 1 / 7;  grid-row: span 2; }   /* 主趋势，占左半，跨两行 */
.va-cockpit > .va-review    { grid-column: 7 / 13; }                     /* AI 洞察，右上 */
.va-cockpit > .va-audience  { grid-column: 7 / 13; }                     /* 粉丝画像，右下 */
.va-cockpit > .va-bottom-grid { grid-column: 1 / -1; display: grid; grid-template-columns: 1.4fr 1fr; gap: 16px; }
/* 断点：≤1200px 全部单列；≤900px 指标卡 2 列；≤600px 指标卡 1 列 */
```

**改造要点**：这只是 grid 容器与 column span 的调整，**卡片内部的 DOM、数据绑定、aria 属性一律不动**。
`va-top-grid / va-main-grid` 两个类可保留为别名，避免一次性重命名引发大 diff。

---

## 2. 审计提示词（只读 · 每次改造前先跑）

```text
【任务】只读审计，不修改任何文件，不执行 git 写操作。产出事实清单，不要评价代码风格，不要提改造建议。

【审计范围】
- 路由：apps/web/app 下全部 page.tsx / layout.tsx 的路由结构
- 壳层：apps/web/components/app-shell.tsx、sidebar-foundation.tsx
- 首页：apps/web/app/(app)/home/page.tsx、apps/web/app/(app)/dashboard/page.tsx、
        video-analytics-workspace.tsx、workbench-start.tsx、fusion-overview.tsx
- 数据：apps/web/lib/video-analytics.ts、/api/video-data、packages/db/prisma/schema.prisma 中
        VideoAccount / VideoDailyMetric / VideoContent / VideoTask / Artifact / DraftRevision / PublishTask
- 样式：apps/web/app/{globals,black-titanium,apple-workbench}.css、apps/web/components/*.css

【必须回答】
1. 首页两个入口（/home、/dashboard）各自渲染什么、视觉语言是否一致、有无重复入口？
2. 每个可用指标的真实来源字段是什么？哪些字段可为空？哪些指标在现有数据结构下无法得到？
3. 现有交互状态（loading/error/empty/notice/dialog）分别在哪里实现？有没有只用视觉演示的假按钮？
4. 图表是怎么画的？缺失数据如何处理？是否已有 hover/tooltip/坐标轴？
5. 主题与令牌：共有几处定义了同名的 --accent / --background / --border？彼此取值是否冲突？
6. 硬编码颜色与硬编码圆角/间距的分布（给出文件与数量）。
7. 是否存在"已实现但导航未暴露"的组件或页面？
8. 哪些页面在深色主题下仍使用浅色样式（视觉不一致点）？逐条列出文件与选择器。

【输出格式】Markdown，分 8 节，每条结论带 `文件路径:行号` 证据。不要粘贴超过 5 行的代码片段。
【禁止】不要改文件、不要运行任何写操作、不要给出改造方案（那是下一步的事）。
```

---

## 3. 首页驾驶舱主提示词（本次重点）

```text
【角色】你是资深产品设计工程师，负责把已上线的「鑫世界 AI 工作台」首页改造为高端经营驾驶舱。
产出必须可直接编译运行，不引入新依赖，不破坏既有功能。

【设计目标】
视觉语言对齐"克制、精密、可信的未来科技感"：
- 深空蓝基底（不是纯黑、不是中性灰），层次靠"纵向渐变的卡片 + 细边框 + 大量留白"建立，
  而不是靠发光、玻璃拟态或星空贴图堆叠。
- 强调色严格控制面积：品牌青（交互/选中）、AI 紫（智能/洞察）、薄荷绿（增长/成功）三色分工，
  数据可视化处可用渐变，其余位置以中性色为主。
- 每个指标卡内嵌一个迷你可视化（点阵 / 迷你折线 / 迷你面积 / 迷你环），
  让"数据流动感"来自数据本身，而不是来自装饰动画。
- 8px 间距体系；数字统一等宽数字（tabular-nums）。

【首页必须包含的区块（自上而下）】
A. 顶部工具行：全局搜索（含 ⌘K 提示）+ 右侧主要操作（今日任务 / 刷新 / 导出）
B. 核心指标区：一排 4 张指标卡，每卡含标题、大号数值、环比变化（带升降图标与对比周期说明）、迷你可视化
   - 指标一律来自现有数据：周期播放量、周期互动量、周期净增粉丝、账号日记录覆盖率
   - 若某指标缺失（如"有效线索""内容总曝光"），保留诚实的空态与说明，不得编造、不得用其他指标冒充
C. 数据趋势区：主趋势卡（平台切换 + 时间范围 + 指标切换 + 缺失值空档 + 数据更新时间与口径说明）
   + 平台/账号维度拆分的次级可视化
D. AI 智能洞察区：结论 + 依据 + 推测 + 建议 + 数据范围说明，并保留"未调用真实模型"的诚实标注
E. AI 工作状态 / 最近创作：最近项目、最近脚本、继续编辑入口、AI 任务状态
   - 可直接复用接口已返回的真实数据：`alerts`（流量下降/人工限流/评论异常，含依据文案与跳转链接）
   - 与 `tasks`（含 `state` 与 `editable` 字段）
F. 任务待办区：今日/本周任务、负责人、截止时间、状态（数据来自 VideoTask，字段 status/dueAt/assigneeId）
G. 内容表现排行：作品榜（保持现有 va-work-table 结构与"点击查看详情"的 dialog 能力）

【硬约束】
1. 增量改造：保留 video-analytics-workspace.tsx 的全部数据流、状态机、无障碍属性与 tab 结构；
   只重构版式、样式与卡片内部呈现。不得改写 selectVideoAnalytics / API / Prisma。
2. 不得新增依赖、不得新增图表库、不得新增 npm 包、不改 package.json、不跑 migration。
3. 不得编造数据：所有数字必须来自 view/metrics/trend/stats/works 等既有返回值；
   缺失即空态。演示数据与真实数据的隔离逻辑与文案标注必须原样保留。
4. 不得删改"演示模式""平台尚未授权接入""未调用真实模型""未录入不等于零"等诚实性标注。
5. 视觉一致性：/home 与 /dashboard（无 project 参数）必须共用同一套深色令牌与卡片语言，
   消除 workbench-start.tsx 当前的浅色视觉（home-reference.css 的浅底点阵背景、mix-blend-mode: multiply 等）。
6. 可达性：焦点环可见、Tab 顺序不变、对比度正文 ≥ 4.5:1、所有装饰元素 aria-hidden、
   动画全部支持 prefers-reduced-motion 降级。
7. 响应式：保留并核对现有断点（1200 / 900 / 600px），窄屏不得出现横向溢出或遮挡。

【执行顺序】
第 1 步：先输出改动清单（文件 → 定位锚点 → 改动内容 → 为什么安全），等我确认。
第 2 步：按"令牌 → 卡片基础 → 首页版式 → 迷你可视化 → 动效"的顺序小步施工，每步停下报告 diff。
第 3 步：给出验证结果；未运行的验证必须明确说明未运行。

【报告格式】STATUS / CHANGED / BOUNDARY / VERIFICATION / RISKS / GIT
```

---

## 4. Design System 提示词（全局令牌对齐）

```text
【任务】把全站深色令牌对齐到新的经营驾驶舱色板，并补齐缺失的层级变量。
只改令牌与通用卡片/按钮/输入的基础样式，不改任何页面结构。

【当前实际值（V1 已落地，仅作对照，不要当成目标）】
globals.css:4226-4266 现为：--background #070b14 / --surface #0e1626 / --surface-secondary #131d30 /
--border #1e2b45 / --text #e8f1ff / --accent #4cc9ff / --accent-strong #8b5cff / --success #3ddc97 /
--data-1/2/3 #38BDF8 / #A78BFA / #34D399 / --gradient-brand linear-gradient(90deg,#3fd8ff,#4b8dff,#8b5cff)。
本次要把这套值**替换**为下面的目标色板（不是并存）。

【目标色板（写入 [data-surface="console-dark"]，并让 black-titanium.css 的 body[data-theme] 与其对齐）】
页面背景 --background:        #080F1D
背景深色 --background-deep:   #060B14
一级容器 --surface:           #111E32
二级容器 --surface-secondary: #17263D
浮层 --surface-elevated:      #1D2E49
描边 --border:                #1E3049
强调描边 --border-strong:     #2A4160
品牌青 --accent:              #2DD4EF
AI 紫 --accent-strong:        #8977F8
成功/增长 --success:          #39CDB1
警示 --warning:               #F0AE57
危险 --danger:                #EF6678
主文字 --text:                #F2F6FC
次文字 --text-secondary:      #A5B5CC
三级文字 --text-tertiary:     #7386A0
数据色 --data-1/2/3:          #2DD4EF / #8977F8 / #39CDB1
品牌渐变 --gradient-brand:    linear-gradient(90deg, #2DD4EF, #8977F8)
卡片渐变 --gradient-panel:    linear-gradient(180deg, rgb(23 38 61 / .55), rgb(9 16 28 / .35))
发光 --glow-accent:           0 0 20px rgb(45 212 239 / .22)   ← 仅用于强调元素，禁止全卡片使用

【规则】
1. 建立 8px 基础间距体系：使用 --space-1..8 = 4/8/12/16/24/32/48/64 或等价命名，
   新写的样式必须引用变量；已有硬编码值不要全站批量替换（避免大 diff），只在本次触碰的区块内统一。
2. 圆角：沿用现有 --radius-control / --radius-card / --radius-panel，禁止新增第三套圆角。
   （注意：同一语义圆角目前有 2 套命名共 7 个变量，本次不合并，只保证新代码只用 --radius-*。）
3. 数字：所有指标、百分比、时间使用 font-variant-numeric: tabular-nums。
4. 发光节制：默认卡片只用 1px 描边与内高光；仅"当前选中/主要操作/AI 状态"允许外发光。
5. 背景层：允许一层极低对比的径向渐变（青/紫各一，透明度 ≤ 8%），禁止星野贴图与网格铺满。
6. 统一 focus 样式：1px var(--accent) 实边 + 3px var(--accent-ring) 外环，全站一致。
7. 顺手修两处已知瑕疵（都属于本次触碰范围）：
   - 危险色目前有 7 个近似硬编码红（#b94b55/#b74f57/#cf4747/#b64c56/#b74952/#b64c5b/#ff6b6b），
     统一收敛到 var(--danger)，涉及 app-shell.css:204,210,212,352,358,372,373,404、home-composer.css:19,29、home-reference.css:50；
   - 深色中心的数据色用了大写 hex（#38BDF8 等），替换时统一为小写。

【边界】
- 不动 globals.css 中浅色基线的原始取值（:root 块），只允许在深色选择器内覆盖。
- 不动 packages/ui 组件的对外 props 签名。
- **一条已验证的事实，可以省你一轮排查**：`product-v3.css:46-59` 的 `body:has(.xsj-home-sidebar)` 规则
  看起来会用浅紫覆盖深色 `--accent`，但 `.xsj-home-sidebar` / `.xsj-brand-row` / `.xsj-sidebar-search` /
  `.xsj-compact-hero` / `.v3-projects-page` 在全部 `.tsx` 中**零引用**，所以它**不生效**。
  这 ~60 行属死 CSS：**不要把它当成"覆盖源"去排查，也不要在本次顺手删除**，只登记到待清理清单。
- 深色令牌目前在 3 处重复定义（`globals.css:4226`、`black-titanium.css:2-15`、`settings-v1.css:2-6`），
  且集合互不相等：`--v3-*` 27 个只在 black-titanium.css，`--data-*`/`--gradient-*`/`--glow-accent` 只在 globals.css。
  本次只允许指定 `globals.css:4226` 为唯一事实来源，其余改为引用/继承；不得再新增第 4 处。
- `--data-1/2/3` 目前只在深色下定义，浅色路径会取到无效值（video-analytics-workspace.css:82 受影响）：
  本次请补上浅色侧取值或加 fallback。
- reduced-motion 目前有 14 个含动画的文件没有降级块（含 video-analytics-workspace.css、home-composer.css、
  voice-input.css、settings-v1.css 等）；本次触碰到的文件请补上，未触碰的不动。

【输出】改动清单 → 确认 → 小步施工 → STATUS/CHANGED/BOUNDARY/VERIFICATION/RISKS/GIT 报告。
```

---

## 5. 分模块提示词

### 5.1 顶部工具行与全局搜索
```text
范围：apps/web/components/app-shell.tsx（.xsj-app-topbar）+ global-search.tsx + global-search-v1.css。
目标：把当前"仿 macOS 菜单栏"的顶栏改造为驾驶舱工具行：
- 中部或右侧放置高 40-44px 的搜索框，含放大镜图标、占位文案、右侧 ⌘K 快捷键提示；
- 搜索框使用一级容器底色 + 1px 描边 + focus 时强调描边与外环；
- 右侧主要操作按钮（今日任务等）用品牌青描边或实心，数量不超过 2 个。
约束：不改菜单项语义、不改窗口控制按钮行为、不改键盘快捷键逻辑、不改 .xsj-app-sidebar 的任何布局数值。
```

### 5.2 指标卡（ConsoleKpi）
```text
范围：packages/ui/src/console-kpi.tsx（样式与装饰层）+ 相关深色样式。
目标：每张指标卡 = 标题行（可含右侧状态胶囊）+ 大号数值 + 环比行 + 底部迷你可视化槽位。
- 数值 40-48px、600 字重、tabular-nums；单位与环比用次文字色。
- 环比：上升用 --success + 上升图标，下降用 --danger，并保留"较前一等长周期"的口径说明。
- 迷你可视化通过可选插槽传入（点阵 / 迷你折线 / 迷你面积 / 迷你环），
  由首页侧决定画哪种；无数据时该区域留空并保留原文案，不画占位假图形。
- 卡片底部可加一条极低对比的纵向渐变（模拟截图中的地平线光带），透明度 ≤ 10%。
约束：不改 props 语义；value 为 null 时仍显示 "—"；不新增第三方图表库，迷你图形用内联 SVG 或 CSS 绘制。
```

### 5.3 图表区（趋势 / 分布 / 时热力 / 环形 / 漏斗）
```text
范围：video-analytics-workspace.tsx 内 Trend、Distribution、AudiencePanel 及其 CSS。
目标：在现有实现上增强，不推倒重写：
- 折线：加渐变描边（--gradient-brand）+ 线下渐变填充 + hover/tap 高亮列 + 缺失值保持空档语义；
- 分布条：改为 6px 圆角轨道 + 渐变填充 + 右端高光，数值 tabular-nums 右对齐；
- 时热力：24 根 4-5px 圆角柱，按强度用 --data-1 → --accent-strong 渐变，峰值小时标签提亮；
- 新增环形/漏斗类可视化时：只用内联 SVG 手绘，不引入图表库；必须有明确的数值、单位与口径说明。
约束：所有图形元素可访问（aria-hidden 或等效文本）；hover 提示用现有 title/aria-label 机制，不引入第三方 tooltip 库。
```

### 5.4 首页第二入口（/dashboard 起始页）视觉对齐
```text
范围：apps/web/components/workbench-start.tsx + home-reference.css（浅色样式）。
目标：消除浅色残留，使其与驾驶舱同一视觉语言：
- 移除 / 覆盖浅底点阵背景与 mix-blend-mode: multiply 的 logo 处理；
- 输入创作区改为一级容器卡片 + 1px 描边 + focus 外环；
- 模板卡与 Skill 卡统一为驾驶舱卡片（细描边、纵向渐变、hover 描边提亮）；
- 保留现有交互：草稿 sessionStorage、模板套用与撤销、Skill 加载与空态、提交后跳转逻辑。
约束：不动 HomeComposer 的表单逻辑、不动 creationPrompts 数据、不动滚动 morph 行为（可保留但需在深色下视觉合理）。
```

### 5.5 其余页面收口
```text
范围：projects / library / research / discovery / settings 等页面。
目标：只做令牌与通用卡片对齐，不重排版式、不改业务结构：
- 统一卡片：1px 描边 + 8px 间距体系 + 统一圆角；
- 统一表格：表头次文字色、行 hover 提亮、数值列 tabular-nums 右对齐；
- 统一空态/加载/错误三态样式（不新增文案）。
约束：一个模块一个 diff，不与首页改造混在同一个提交里。
```

---

## 6. 验收标准（每条都要给"是/否 + 证据"）

**视觉**
1. 首页所有卡片是否共用同一套容器样式（描边、圆角、间距、渐变方向）？
2. 强调色使用面积是否受控（无满屏发光、无霓虹堆叠）？列出仍在使用外发光的元素清单。
3. 深色主题下是否还存在浅色残留页面或区块？逐条列出文件与选择器。
4. 数字是否全部等宽对齐？字号层级是否统一（标题/数值/辅助三级）？

**功能不减**
5. 首页 7 个 tab 是否全部仍可切换并正常渲染？
6. 演示模式与真实数据切换是否仍隔离？演示数据是否仍未写入数据库？
7. 作品详情 dialog 是否仍可打开、关闭、恢复焦点？
8. 筛选（平台/账号/时间范围）与导出 CSV 是否仍工作？

**诚实性**
9. "演示数据""平台尚未授权接入""未调用真实模型""未录入不等于零"等标注是否全部保留？
10. 是否出现任何新增的假数字、假百分比、假趋势？

**空态与口径（本次新增的必查项）**
11. 真实模式下，作品榜与粉丝画像显示的是**设计过的空态**，还是空白/假图表？
12. KPI 数字是否仍为"所选周期"口径（而不是误用接口的"今日"口径 `metrics`）？
13. 环比在周期不完整时是否仍返回"暂无对比"而不是编出一个百分比？缺失日期在趋势图上是否仍为空档？

**可达性与性能**
14. Tab 键走查一遍，焦点环是否始终可见、顺序是否与改造前一致？
15. 开启系统"减少动态效果"后，所有装饰动画是否停止、内容是否完整？
16. 1200/900/600px 三档断点是否无横向溢出与遮挡？
17. 是否新增依赖？（答案必须是"否"）

**验证命令（V1 等级，只跑直接相关项）**
```bash
pnpm --filter @content-center/web typecheck
pnpm --filter @content-center/web lint
```
> 注：本次会话沙箱的 `pwsh` 不可用，上述命令需由你在本机执行；
> 未运行的验证必须在 REPORT 中明确标注"未运行"，不得当作已通过。

---

## 7. 禁止清单（反例，直接写进提示词）

```text
【禁止】
1. 禁止全站重构、禁止批量格式化、禁止重命名既有 CSS 类或变量。
2. 禁止新增依赖、图表库、图标库、动画库、UI 组件库。
3. 禁止改动服务端逻辑、API、Prisma schema、migration、权限与 scope 检查。
4. 禁止改 PRODUCT.md / ARCHITECTURE.md / LEGACY.md / AGENTS.md。
5. 禁止删改业务文案、指标口径、诚实性标注。
6. 禁止编造数据或用随机数、占位数字填充界面。
7. 禁止用 UI 隐藏代替权限控制。
8. 禁止为视觉效果牺牲信息密度、对比度和键盘可达性。
9. 禁止给所有卡片加发光/玻璃/星空背景；发光只留给强调元素。
10. 禁止无 prefers-reduced-motion 降级的持续动画。
11. 禁止在同一个提交里混合"首页改造"与"其他模块收口"。
12. 禁止执行 git add / git commit / push（除非我明确授权）。
```

---

## 8. 单段速用版（复制即用）

```text
在 E:\AI工作台1.2 这个已上线的 Next.js 16 + Tailwind v4 项目里做 UI 增量改造，不改业务逻辑。

先只读审计：apps/web/app 的路由、app-shell.tsx 与 sidebar-foundation.tsx 壳层、
home/page.tsx 与 dashboard/page.tsx 两个首页入口、video-analytics-workspace.tsx 的数据流、
lib/video-analytics.ts 与 /api/video-data、packages/ui 组件、全部 CSS 主题定义。
输出事实清单（带 文件:行号），不改任何文件。

审计确认后再动 UI，顺序固定：深色令牌对齐 → 通用卡片 → 首页经营驾驶舱 → 迷你可视化 → 动效。
参考色板：#080F1D 底 / #111E32 一级容器 / #17263D 二级容器 / #2DD4EF 品牌青 / #8977F8 AI 紫 /
#39CDB1 增长 / #F0AE57 警示 / #EF6678 危险 / #F2F6FC 主文字 / #A5B5CC 次文字。
风格：克制精密，靠纵向渐变卡片 + 细边框 + 留白建立层次，强调色小面积使用，发光只给重点元素。

首页必须有：工具行（搜索 + ⌘K）、4 张带迷你可视化的指标卡（含环比与口径说明）、
趋势区（平台/时间/指标切换 + 缺失值空档 + 数据更新时间）、AI 洞察区（结论/依据/推测/建议）、
AI 工作状态与最近创作、任务待办、作品排行。所有数字必须来自现有数据，缺失即诚实空态。

禁止：新增依赖与图表库、改 API/Prisma/权限/文案口径、编造数据、全站重构、批量格式化、
给所有卡片加发光、无 reduced-motion 降级的动画、擅自 git 提交。

每步先给改动清单等我确认，完成后按 STATUS/CHANGED/BOUNDARY/VERIFICATION/RISKS/GIT 报告，
未运行的验证必须说明未运行。
```
