# 鑫世界 AI 工作台 · UI 现状审计与增量改造方案 V1

> 目的：在不破坏既有业务能力的前提下，把产品视觉升级为「经营驾驶舱」风格（参考稿：RevenuePulse 式深色 Bento 数据面板）。
> 原则：**先审计、后施工；只改 UI、不动业务；一个阶段一个小 diff。**
> 配套提示词模板：[UI_PROMPT_PACK_COCKPIT.md](UI_PROMPT_PACK_COCKPIT.md)
> 相关权威文档：[PRODUCT.md](../PRODUCT.md)（本次不修改）、[AGENTS.md](../AGENTS.md)（验证等级与 git 约束）

---

## 0. 一句话结论

产品的**数据层与业务层已经可用**（指标、趋势、画像、作品、账号、任务、资料、项目、成果都有真实实现），
问题集中在两处：**(1) 视觉语言不统一**——同一产品里并存深色驾驶舱与浅色工作台两套观感；**(2) 信息架构冗余**——首页有两个一级入口、研究/选题存在两套并存页面、`activeNavigation` 是未生效的死代码。

因此本次改造属于**纯呈现层增量改造**，不需要新建数据能力，也不需要重构路由；路由层面的冗余只做**报告**，不在本次施工范围内（见 §3 BOUNDARY）。

---

## 1. 审计范围与方法

| 维度 | 覆盖对象 |
| --- | --- |
| 路由与信息架构 | `apps/web/app` 全部 page/layout、`sidebar-foundation.tsx`、`app-shell.tsx` |
| 首页数据能力 | `video-analytics-workspace.tsx`、`lib/video-analytics.ts`、`/api/video-data`、`video-center.tsx` |
| 创作与成果链路 | `dashboard/page.tsx`、`workbench-start.tsx`、`studio-shell.tsx`、`library/*`、`projects/*` |
| 数据结构 | `packages/db/prisma/schema.prisma` |
| 视觉层 | 全部 CSS、主题定义、图表实现方式、动画与降级处理 |

验证等级：**V0（只读分析，未运行测试、未修改文件、未执行 git 操作）**。

---

## 2. 发现（带证据）

### 2.1 信息架构与路由

**路由规模**：约 60 个 URL，其中 **9 个是纯 redirect 兼容页**，另有若干条件性 redirect 与 notFound 出口。

纯 redirect（旧路径兼容）：

| 旧路径 | 目标 | 证据 |
| --- | --- | --- |
| `/discovery` | `/research` | `discovery/page.tsx:2` |
| `/discovery/benchmarks/[id]` | `/research/benchmarks/{id}` | `discovery/benchmarks/[id]/page.tsx:2` |
| `/projects/methods` | `/library/methods` | `projects/methods/page.tsx:4` |
| `/projects/[id]` | `/dashboard?project=id` | `projects/[id]/page.tsx:5` |
| `/projects/[id]/studio` | `/dashboard?project=id` | `projects/[id]/studio/page.tsx:5` |
| `/admin` | `/admin/users` | `admin/page.tsx:4` |
| `/` | `/home`（有成员）/ `/onboarding`（无成员） | `app/page.tsx:8,11` |
| `/onboarding` | `/dashboard`（已是成员时） | `onboarding/page.tsx:10` |

**一级导航实际结构**（`sidebar-foundation.tsx:14-18, 95-99`）：

- 组外两项：`/home`「首页」、`/dashboard`「工作台」
- 「内容创作」：今日任务 `/short-video/tasks`、项目管理 `/projects`、选题中心 `/topics`、内容审核 `/content-review`
- 「知识与资料」：资料库 `/library`、知识中心 `/knowledge`、事实确认 `/knowledge/facts`、创作方法 `/library/methods`、IP 背景信息 `/ip-context`
- 「研究与洞察」：开始研究 `/research/new`、对标研究 `/research/benchmarks`、热点趋势 `/research/trends`、研究成果 `/research/results`、研究总览 `/research`

**确认的问题**：

1. **两个首页入口并存**：`/home` 渲染 `VideoAnalyticsWorkspace`（深色驾驶舱，`home/page.tsx:4-7`），`/dashboard` 渲染 `WorkbenchStart + FusionOverview`（`dashboard/page.tsx:31`）。
   而登录后落点是 `/`→`/home`，onboarding 完成却去 `/dashboard`（`onboarding/page.tsx:10`）——**入口语义分裂**。
2. **`activeNavigation` 是死代码**：`app-shell.tsx:47-48` 花了一段三元链计算它，`sidebar-foundation.tsx:30` 声明了该 prop，
   但组件解构列表（`sidebar-foundation.tsx:40-58`）**没有取用**，渲染全程用 `usePathname()`。
   全仓该变量只在 `app-shell.tsx:48/180` 出现两次，无任何消费方。
3. **侧栏选中态规则残缺**：只有 `pathname === item.href` 精确匹配（`sidebar-foundation.tsx:97`），
   因此 `/library/[id]`、`/research/session/[id]`、`/calendar/tasks/[id]` 等二级页面上，父组不会高亮。
4. **选中态冲突**：`/short-video` 与 `/home` 共用「首页」的 `aria-current`（`sidebar-foundation.tsx:95`）。
5. **研究域两套页面并存**：`/research/trends*`（新，`[stableKey]`）与 `/discovery/trends*`（旧，`[key]`）同时可访问；
   `/discovery/ideas*` 与 `/discovery/recommendations/[id]` 没有 `/research` 对应项。
6. **同一实现两个 URL**：`/platform/accounts` 直接 re-export `/admin/users`（`platform/accounts/page.tsx:1`）。
7. **设置页双份实现**：`(app)/settings/*` 与并行路由 `(app)/@settings/(.)settings/*` 内容一一对应。
8. **没有 `not-found.tsx`**：全仓边界文件只有 `(app)/research/error.tsx` 与 `loading.tsx`。

> 以上路由问题**本次只报告不施工**（见 §3）。改动它们会触碰导航语义与可达性，超出"只改 UI"的边界。

### 2.2 首页数据能力（结论）

首页**已经是数据驾驶舱**，但"哪些区块有真实数据"需要说清楚，否则改造会画出空壳。

**有真实数据支撑的部分**：

- 数据入口：`/api/video-data` → `fromVideoRecords()` → `selectVideoAnalytics()`（`lib/video-analytics.ts:18-84`）
- 真实表：`VideoDailyMetric`（日粒度指标）、`VideoAccount`、`VideoContent`、`VideoTask`
- 可用指标：`plays / likes / comments / shares / saves / netFollowers / exposures(nullable)`，互动量 = 点赞+评论+收藏+分享（`lib/video-analytics.ts:52`）
- 环比：仅在前后两个等长周期**都被完整覆盖**时才计算，否则返回 `null`（`lib/video-analytics.ts:66-68`）——已有的诚实性设计，必须保留
- 趋势：按天聚合，缺失日保留 `null` 空档（`lib/video-analytics.ts:62-65`）
- 洞察：规则摘要，未调用真实模型，UI 已标注（`lib/video-analytics.ts:82`）
- 异常提醒：`alerts` 三类（流量下降 / 人工限流 / 评论异常），带依据文案与跳转链接（`service.ts:46-62`）
- 任务：`tasks` 含 `state` 与 `editable`（`service.ts:64,69`）
- 演示数据：`createVideoDemo()` 为确定性 fixture，**不写库**（`lib/video-analytics.ts:24-50`）

**只有演示模式才有数据、真实模式下必然为空的区块**（改造时必须保留空态，不能画假图）：

| 区块 | 真实现状 | 根因 |
| --- | --- | --- |
| 作品表现 / 作品榜 / 作品详情趋势 | **恒为空** | `VideoDailyMetric` **没有 `workId` 列**（`schema.prisma:2436-2460`），`fromVideoRecords` 直接置 `works: []`（`lib/video-analytics.ts:21`）→ `selectVideoAnalytics` 的 works 匹配不到任何行（`lib/video-analytics.ts:69-74`） |
| 粉丝画像（地域/年龄/性别/活跃时段） | **恒为空** | 真实模式 `audiences: []` 且 `followers` 恒为 `null`（`lib/video-analytics.ts:19,21`）→ 权重为 0 → `profile` 返回 `null`（`lib/video-analytics.ts:78-80`） |

**数据口径易错点（改造时不要弄混）**：

- API 的 `metrics` 是**"今日"**口径（`service.ts:43`），而首页 KPI 用的是**"所选周期"**口径，由客户端从 `records + comparisonRecords` 重算（`lib/video-analytics.ts:19-21,61,83`）。**同名不同义。**
- `exposures` 可为 `null`，且**首页 KPI 不展示曝光量**（`total()` 不含该字段，`lib/video-analytics.ts:52`）。
- `negativeComments / limited / isFinal` 有列，但只用于 video-center 的预警与录入（`service.ts:56-61`），首页链路不展示。

**现有数据结构下无法得到的指标**（任务书里的对应项必须降级为诚实空态）：

- **有效线索 / 报名 / 转化**：`VideoDailyMetric`、`VideoContent` 无任何线索类字段（`schema.prisma:2436-2478`），全仓"线索"只出现在 discovery/research 模块。
- **内容总曝光**：字段存在但可空，且未进入首页 KPI。
- **平台实时同步**：`alerts` 与录入均为人手/CSV 来源，页面已标注"平台尚未授权接入"。

> **结论修正**：首页改造仍然"不需要新增数据能力"，但**必须接受两个区块在真实模式下永远为空**。
> 因此作品榜与粉丝画像的视觉改造要**以空态为主要验收对象**，而不是按参考稿画出满屏图形。

### 2.2.1 首页链路的功能隐患（只报告，不在本次施工）

**演示模式下仍会挂载真实管理界面**：`demo === true` 时，`accounts / content / records` 三个 tab 依然渲染 `<VideoCenter mode="data">`（`video-analytics-workspace.tsx:87,107`），
而 `VideoCenter` 自身的取数与写入**不受 demo 开关控制**（`video-center.tsx:60-78,113-127`），仅把 `initialAccount/initialPlatform` 置空。
界面同时声明"演示账号不会写入数据库"（`video-analytics-workspace.tsx:107`）——**声明与实际行为存在落差**。
这属于功能与文案一致性问题，性质超出"只改 UI"，本次只报告。

> 环境说明：本次会话 `pwsh` 因沙箱 ACL 初始化失败不可用，全部证据由 read/grep/glob 取得，
> 属 **V0 只读分析**，未运行 typecheck / lint / 测试，未修改任何源文件。

### 2.3 可复用的既有资产（不要重造）

| 资产 | 位置 | 复用方式 |
| --- | --- | --- |
| 迷你可视化 `Spark`（内联 SVG 折线） | `video-center.tsx:22-31` | 直接搬进 KPI 卡插槽 |
| 环比展示 `Delta`（↗/↘ + 百分比 + 口径小字） | `video-center.tsx:32-35` | 提取为共享组件 |
| 任务视图（今日/状态筛选、`taskState`/`editable` 判定） | `video-center.tsx`、`server/video-operations/service.ts:69` | 首页任务待办区直接复用 |
| **异常提醒 `alerts`**（流量下降 / 人工限流 / 评论异常，含依据文案与跳转链接） | `server/video-operations/service.ts:46-62` | 首页"AI 工作状态"区的现成真实数据源 |
| 数据面板令牌与卡片材质 | `globals.css:4227-4316`（`[data-surface="console-dark"]`、`.console-kpi-starship`） | 作为唯一令牌来源扩展 |
| 设计系统组件 | `packages/ui/src`（Card / ConsoleCard / ConsoleKpi / Button / Badge / Input） | 只增强样式，不改 props |
| 接口响应已含首页所需一切 | `api/video-data/route.ts:15` → `service.ts:69`（`metrics` / `changes` / `trend` / `coverage` / `alerts` / `contents` / `tasks` / `members` / `projects`） | 首页无需新增接口 |

**权限事实**：`/api/video-data` 通过 `getApiWorkspaceContext()` 做工作空间作用域校验（`route.ts:8-10`），
`readVideo` 内再校验成员资格与账号归属（`service.ts:13,29,34-37`）；写操作校验 `Origin` 与 `VIEWER` 角色（`route.ts:20`、`service.ts:76-77`）。**UI 改造不得触碰这些校验。**

### 2.4 视觉层问题（结论）

1. **同一 token 有多个来源**（最需要先处理的一条）：
   - 深色颜色值的**唯一完整定义**在 `globals.css:4226-4266`，选择器是 `body[data-theme="black-titanium"], [data-surface="console-dark"]`。
   - `product-v3.css:46-59` 的 `body:has(.xsj-home-sidebar)` 会把 `--accent` 钉回浅紫 `#7258f5`、`--background` 钉回 `#f5f5fa`，
     但**已验证该规则当前不会生效**：`.xsj-home-sidebar` 及配套的 `.xsj-brand-row` / `.xsj-sidebar-search` /
     `.xsj-compact-hero` / `.v3-projects-page` 在全部 `.tsx` 中**零引用**（grep 无匹配）。
     即 `product-v3.css` 中约 60 行"首页侧栏"规则是**死 CSS**——风险不是"覆盖"，而是**清理时的误判**：
     改令牌时若顺手删除这些规则是安全的；反之若以为它们在生效，会白花时间排查。
   - `.settings-v1`（`settings-v1.css:2-6`）自带第三套浅色 token，深色下靠 `black-titanium.css:88-93` 的 `inherit` 桥接。
   - 三处 token 集合**互不相等**：`--v3-*` 27 个只在 `black-titanium.css` 定义，`--data-1/2/3` 与 `--gradient-*`/`--glow-accent` 只在 `globals.css` 深色中心定义。
2. **`--data-1/2/3` 只在深色下定义**（`globals.css:4249-4251`），浅色环境下 `video-analytics-workspace.css:82` 的时热力条会取到无效值。
3. **间距与字号没有任何变量体系**：不存在 `--space-*` / `--font-*`，`font-size` 硬编码命中 856 条匹配行（跨 8px–48px），padding/gap 几乎全部硬编码。
   圆角有变量但覆盖低，且**同一语义有 2 套命名、共 7 个变量名**（`--radius-*` 4 个 + `--v3-radius-*` 3 个），硬编码 `border-radius` 命中 ≥694 条匹配行。
4. **危险色有 7 个近似硬编码红**：`#b94b55 / #b74f57 / #cf4747 / #b64c56 / #b74952 / #b64c5b / #ff6b6b`，
   分散在 `app-shell.css:204,210,212,352,358,372,373,404`、`home-composer.css:19,29`、`home-reference.css:50`。
5. **深色中心里的数据色用大写 hex**（`#38BDF8 / #A78BFA / #34D399`），与全站小写风格不一致——细节但影响 grep 与替换安全性。
6. **背景实现分散**：全站 **0 处 `url()` 背景图**（图片都走 `<img>`），但背景渐变分散在 12+ 处，其中
   `apple-workbench.css:223-225` 是深色下的圆点网格（96px）、`home-reference.css:2,26` 是浅色点阵（20px）、`product-v3.css:3740` 又一套紫色点阵——**三套底纹并存**。
7. **两套视觉语言并存**：`/home` 深色驾驶舱 vs `/dashboard` 浅色工作台（`workbench-start.tsx:6` 引入 `home-reference.css`，
   含浅底点阵与 `mix-blend-mode: multiply` 的 logo 处理，`home-reference.css:2,11`）。
8. **图表全靠手写**：折线为内联 SVG 手绘（`video-analytics-workspace.tsx:41-45`），进度条与时热力条为 CSS 绘制；
   仓库**没有任何图表库**——这是约束，不是缺陷，本次继续沿用。
9. **动画降级不完整**：全仓 `prefers-reduced-motion` 共 **29 处 / 14 个文件**（`globals.css` 占 18 处），
   但以下含动画的文件**没有**降级块：`home-composer.css`、`voice-input.css`（有 `@keyframes voice-input-spin`）、
   `video-analytics-workspace.css`、`settings-v1.css`、`work-decision.css`、`benchmark-workbench.css`、
   `folder-library.css`、`artifact-window.css`、`project-tree-extension.css`、`project-agent.css`、
   `video-date-filter.css`、`feishu-library.css`、`global-search-v1.css`、`source-workspace.css`。
   全站共 13 个 `@keyframes`（`globals.css` 8 个、research.css 2 个，其余 3 个分散）。
10. **`packages/ui` 写法统一且干净**：全部是 Tailwind 原子类 + `[var(--*)]` 任意值，无内联 `style`、无十六进制色值；
    7 个导出中 `ConsoleCard`/`ConsoleKpi` 依赖应用侧语义 class（`.console-card`、`.console-kpi-starship`），
    后者仅在 `[data-surface="console-dark"]` 下被增强（`globals.css:4278-4307`）。
11. **`black-titanium.css` 有多处硬编码深色**（`#10141b`、`#223044`、`#1c222c` 等 `--v3-*` 深色组，`:10-14,23,37-38,44`），
    这些是绕过 token 的"影子深色"，是阶段 1 需要收敛的对象。

> 环境说明：本次会话的 `pwsh` 因沙箱 ACL 初始化失败（`SetNamedSecurityInfoW failed (Win32 5)`）不可用，
> 视觉层计数全部通过 read/grep 汇总，**行级数字为下限**（受 grep 250 条上限截断），未运行任何脚本。
> 这是环境限制，不是分析取舍；如需精确计数，可在 ACL 恢复后用一次性只读脚本补齐。

### 2.5 创作中心与成果链路（结论）

**布局真相与任务书里"三栏式"的差异**（提示词中的目标描述需要按此修正）：

| 任务书描述 | 代码现状 | 证据 |
| --- | --- | --- |
| 左：资料与创作设置 | **不是固定栏**，是画布顶部 `.canvas-context-bar` 芯片 + 覆盖层 `.canvas-tools-layer > aside`，另有独立抽屉 `.project-materials-panel` | `content-canvas.tsx:450-457,1275-1282`；`project-materials-panel.tsx:87` |
| 中：脚本编辑器 | **不是固定栏**，草稿是 React Flow 卡片节点，"继续编辑"打开全屏覆盖层 `.draft-focus-layer` | `content-canvas.tsx:592-600,1232-1243` |
| 右：AI 对话协作 | 唯一固定栏 `aside.workbench-assistant`，两列网格 `minmax(340px,1fr) minmax(0,var(--assistant-width,30%))` | `content-canvas.tsx:1262-1271`；`globals.css:2295` |

**默认状态是 `assistant-only`**——首次进入只看得到 AI 对话，画布被压到 1px 宽且不可交互（`studio-shell.tsx:97,111`；`globals.css:2697`）。
另：`.studio-v2` 三栏 grid 仍在 CSS 里（`globals.css:160-170` 等 4 处），但**全仓零引用**，属死 CSS。

**数据落在哪里**（改造时不要动这些表）：

| 内容 | 存储 | 说明 |
| --- | --- | --- |
| 脚本工作副本 | `DraftBranch.working*`（`schema.prisma:959-995`） | 权威来源 |
| 版本快照 | `DraftRevision`（`schema.prisma:997-1024`） | 不可变，`@@unique([draftBranchId, revision])` |
| 旧母稿 | `MotherContent`（`schema.prisma:1762-1785`） | legacy 镜像，仅主稿同步写 |
| 画布 | `CanvasObject` 等（`schema.prisma:1026-1139`） | 与草稿表无关 |
| 成果 | `Artifact`（`schema.prisma:2142-2165`） | 正文实际来自绑定的 `draftBranch.workingBody` |

**能力矩阵（对验收标准的关键差异）**：

| 任务书要求的能力 | 现状 | 证据 |
| --- | --- | --- |
| 自动保存 | ✅ 1800ms 防抖写 `DraftBranch`，version+1 | `mother-content-editor.tsx:89-99`；`drafts/service.ts:267-293` |
| 手动保存 | ⚠️ 存在，但**编辑器内没有按钮**，只能由外层 `flush()` + checkpoint 触发 | `studio-shell.tsx:206-223` |
| 版本历史 | ✅ 只读列表 | `studio-shell.tsx:237-246,410` |
| **版本恢复** | ❌ **未实现**（无回滚端点、无按钮） | `app/api/projects/[id]/drafts/**` 无恢复路由 |
| AI 修改"对比原文与新内容" | ⚠️ 组件已写好但**未挂载**（`ai-creation-panel.tsx` 全仓零 import）；服务端 `original` 还硬编码为空串 | `ai-creation-panel.tsx:122`；`assistant/service.ts:294-296` |
| 应用 / 放弃 | ⚠️ 只有"保存为成果 / 应用到当前成果"，**没有放弃按钮**，也没有应用前确认 | `studio-default-method.tsx:251,281` |
| 再次打开恢复上下文 | ✅ 三层恢复（服务端 `loadWorkbenchPageData` + 6 类 localStorage 键 + 对话最近 80 条） | `workbench-page-data.ts:40-100`；`studio-shell.tsx:115-128`；`assistant/service.ts:212-219` |

**孤儿能力（已实现但导航未暴露，改造时不要删）**：`ai-creation-panel.tsx`、`deep-content-workspace.tsx`、
`evidence-board.tsx`、`default-content-method.tsx`、`project-status-panel.tsx`、`project-archive-button.tsx`、
`project-cover-image.tsx`、`project-tree-extension.tsx`；接口层 GET `/api/projects/:id/mother-content` 亦无前端调用者。

**又一处死代码**：`StudioShell` 声明了 `activeNode` 但组件内从未使用（`studio-shell.tsx:61`，仅 `dashboard/page.tsx:28` 传入）。

> 结论：任务书里"AI 修改可以比较和撤销"这条验收标准**当前不成立**，属 `CURRENT IMPLEMENTATION GAP`。
> 补齐它需要挂载组件 + 改服务端 `original` 字段，性质是**功能开发**而非 UI 改造，
> 本次 UI 阶段只做报告；是否纳入施工请单独确认（见 §3 BOUNDARY）。

---

## 3. BOUNDARY（本次不做什么）

**不施工，只报告**：

- 路由合并与导航语义调整（§2.1 的 8 条问题）——涉及可达性与产品结构，需 Owner 决策
- `activeNavigation` 死代码清理——可顺手，但属范围外，需你确认后再单独一个 diff
- 服务端、API、Prisma、权限、Provider、Adapter 一律不动
- 历史文档与旧页面（`fusion-overview`、`discovery/*` 旧趋势页）不删除

**以下问题只报告，是否施工需你单独确认**（它们都超出"只改 UI"的边界）：

| 问题 | 性质 | 影响 |
| --- | --- | --- |
| 演示模式下仍挂载真实 `VideoCenter` 管理界面，可取数可写入（§2.2.1） | 功能与文案一致性 | 课堂演示有误写真实数据的风险 |
| 作品级指标无 `workId` 列，作品榜/作品详情在真实模式下恒空（§2.2） | 数据模型 | 参考稿式"作品排行"只能做空态或仅在演示模式有内容 |
| 粉丝画像真实模式恒 `null`（§2.2） | 数据来源 | 参考稿式"画像卡"只能做空态 |
| `DraftRevision` 版本恢复未实现（§2.5） | 功能缺口 | 任务书"版本恢复"验收项不成立 |
| AI 修改"对比原文与新内容 + 应用/放弃"组件未挂载（§2.5） | 功能缺口 | 任务书"可比较、可撤销"验收项不成立 |
| 路由冗余与两个首页入口（§2.1） | 信息架构 | 涉及可达性与产品结构 |

**不做视觉引入**：

- 不新增任何 npm 依赖（含图表库、动画库、UI 库）
- 不引入 Web Font
- 不做全屏 3D、星空贴图、网格铺满

---

## 4. 实施方案（分阶段 · 每阶段一个小 diff）

> 每阶段结束即停下报告，确认后再进入下一阶段。阶段之间不混提交。

### 阶段 1：令牌统一（最小、最安全）
- 把 `[data-surface="console-dark"]` 指定为深色令牌**唯一事实来源**，取值对齐驾驶舱色板（见提示词模板 §4）
- 让 `body[data-theme="black-titanium"]` 与 `.settings-v1` 改为继承/引用，而不是各写一套
- 建立 8px 间距变量与统一 focus 样式
- **验收**：无视觉回归（页面外观不应有明显变化，仅色值微调）；`typecheck` + `lint` 通过

### 阶段 2：通用卡片与指标卡
- `ConsoleCard` / `ConsoleKpi` 卡片材质统一（细描边 + 纵向渐变 + 内高光）
- 为 `ConsoleKpi` 增加**迷你可视化插槽**（可选 prop），并把 `Spark` 与 `Delta` 提取为共享组件
- **验收**：首页 4 张指标卡出现迷你图形；`value=null` 仍显示 `—`；无假数据

### 阶段 3：首页驾驶舱版式（本次重点）
- 顶部工具行：搜索框（含 ⌘K 提示）+ 主要操作
- 4 张指标卡横排 + 环比口径说明
- 趋势区（平台/时间/指标切换 + 缺失空档 + 更新时间与口径）
- AI 洞察区（结论/依据/推测/建议 + "未调用真实模型"标注）
- AI 工作状态与最近创作、任务待办、作品排行
- **强制接受两个恒空区块**：作品榜与粉丝画像在真实模式下没有数据（§2.2），
  本次只做**空态设计**，不得为了填满版式而造数；如需展示"有数据的形态"，走演示模式切换
- **验收**：7 个 tab 全部可用；演示/真实隔离不变；作品 dialog 正常；筛选与 CSV 导出正常；
  真实模式下作品榜与画像显示的是设计过的空态，而不是空白或假图表

### 阶段 4：图表增强
- 折线加渐变描边与线下填充、hover 高亮列；分布条与时热力条按参考稿细化
- 可选新增环形/漏斗（**必须**有真实阶段数据支撑，否则不做）
- **验收**：缺失值仍为空档；图形可访问（aria-hidden 或等效文本）；不引入 tooltip 库

### 阶段 5：第二入口视觉对齐
- `workbench-start.tsx` + `home-reference.css` 深色化，消除浅色残留
- 先核对一条已验证的事实：`product-v3.css:46-59` 的 `body:has(.xsj-home-sidebar)` 规则**不会生效**
  （`.xsj-home-sidebar` 等类名在全部 `.tsx` 中零引用），属死 CSS。清理它是安全的，但**不要在本次顺手删除**——
  归入"待清理清单"，单独一个 diff 处理
- 保留：草稿 sessionStorage、模板套用与撤销、Skill 加载、提交跳转、滚动 morph
- **验收**：`/home` 与 `/dashboard` 观感统一；键盘走查焦点可见；`--accent` 在两页取同一值

### 阶段 6：其余模块收口
- `projects / library / research / settings` 只做令牌与通用卡片对齐
- 每模块一个 diff，不与首页改造混提交

### 阶段 7：业务回归验证（V2 等级）
- 跑通课堂演示流程：上传资料 → 生成脚本 → 对话修改 → **对比** → 保存新版本 → 离开 → 资料库找回 → 恢复上下文 → 继续编辑
- ⚠️ 其中"对比"与"版本恢复"当前不成立（§2.5）。本阶段只能验证到现有能力边界；
  这两步需先决定是否补齐功能（见 §6 第 3 条），否则演示脚本要绕开它们
- **验收**：`typecheck` + `lint` + 相关单测；首页 E2E 关键路径人工走查

---

## 5. 风险登记

| 风险 | 影响 | 缓解 |
| --- | --- | --- |
| **误判死 CSS 为覆盖源** | 浪费排查时间，或反过来顺手删掉不该删的规则 | `product-v3.css` 的 `.xsj-home-sidebar` 系列已验证零引用；本次只登记不删除 |
| 令牌改动波及全站 | 某些页面在新色值下对比度不足 | 阶段 1 后做一次全站目视巡检，逐页记录 |
| `--data-1/2/3` 仅深色定义 | 浅色路径下时热力条取到无效值 | 阶段 1 补齐浅色侧取值或加 fallback |
| 卡片材质与 `video-center.css` 的 `!important` 规则冲突 | 管理页样式被覆盖 | 改动前先 grep `!important` 与优先级链 |
| 首页版式重构误伤 7 个 tab | 管理类 tab 不可用 | 阶段 3 每完成一个区块跑一遍 tab 切换 |
| **作品榜/画像空态被误当"没做完"** | 为填满版式而引入假数据 | 阶段 3 验收把"空态是否被设计过"列为通过条件 |
| 浅色残留清理不彻底 | 深浅混搭更明显 | 阶段 5 用 grep 定位 `home-reference.css` 与 `product-v3.css` 全部浅色值并逐条处理 |
| 动画降级遗漏 | 新增动画在 reduced-motion 下仍播放 | 14 个含动画但无降级块的文件在本次触碰时补上；新增动画必须自带降级 |
| 顺手重构诱惑 | 大 diff、难以回滚 | 每阶段结束核对改动文件数量，超出预期即停止 |

---

## 6. 需要你决策的三件事

1. **首页收敛**：`/home`（已有驾驶舱）与 `/dashboard`（工作台起始页）是否合并为一个入口？
   合并属信息架构改动，不在本次 UI 施工内；不合并就必须把两页视觉统一（阶段 5）。
2. **两个恒空区块**：作品榜与粉丝画像要么长期以空态呈现，要么先补数据模型（`workId` 列 / 画像来源）。
   后者是数据改造，需单独立项。
3. **三个功能缺口是否本阶段补**：版本恢复、AI 修改对比与放弃、演示模式下管理页误写真实数据。
   前两个是任务书验收项但属功能开发，第三个是风险项；**不补就要相应调整课堂演示脚本与验收口径。**

---

## 7. GIT 状态

```
STATUS: 审计完成，仅新增 2 个文档，未改动任何代码
CHANGED: docs/UI_PROMPT_PACK_COCKPIT.md（新增）、docs/UI_AUDIT_AND_ROADMAP_V1.md（新增）
BOUNDARY: 未触碰 apps/web 与 packages 下任何源文件；未改 PRODUCT.md/ARCHITECTURE.md/LEGACY.md/AGENTS.md
VERIFICATION: V0（只读分析）；未运行 typecheck / lint / 测试 / E2E
RISKS: 沙箱 pwsh ACL 故障导致无法做精确计数与命令类验证（详见 §2.4 环境说明）
GIT: READY_TO_STAGE（未执行 git add / commit / push）
```
