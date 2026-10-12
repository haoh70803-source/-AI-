# 鑫世界 · 第一轮审计与 UI 改造报告

日期：2026-10-10（Asia/Singapore）  
STATUS：READY_TO_STAGE · 独立原型已交付，未暂存、未提交  
验证等级：V0 源码审计 + V1 原型定向验证

当前版本：数据适配补充设计完成，最新定向验证为 **66 项检查通过、48 张完整截图**（VERIFICATION-ADAPTATION.json）。下文各阶段的 24、43、34、55 项及对应截图数字是历史记录，不作为当前结果。

当前增量：保留已确认首页和数据页的布局、图表类型、品牌与主题；补齐日度字段到统计展示的投影规则。今日快照与周期汇总分开，排名与平台占比使用同组记录，缺失值不转为零。新增现有能力与补充方案两种预览，小时、留存、设备来源缺口见 ANALYTICS-ADAPTATION.md，仍属于 CURRENT IMPLEMENTATION GAP / FUTURE 来源设计，未执行正式后端施工。

验证范围：独立原型的数据聚合断言、浏览器交互、深浅主题、桌面/手机、两种能力模式的卡片位置与尺寸一致性、48 张完整截图；无浏览器异常，无正式 API 请求。未运行正式应用 build/typecheck、Service/API 测试或数据库验证，本次不涉及其代码。未改权威规则、正式页面、API 或数据库；未执行 Git 暂存和提交。

## 1. 边界与审计方法

本轮目标为三类页面的 Dual Experience 高保真前端原型。用户明确要求第一轮不得覆盖正式页面或修改 API，因此只新增 `prototypes/dual-experience/`。未修改 PRODUCT.md、ARCHITECTURE.md、LEGACY.md、AGENTS.md；未运行数据库 migration；未操作 Git 暂存、提交或分支。

工作开始时仓库已有大量未提交修改，涉及首页、项目工作区、研究、API、Worker、Prisma 等。本报告审计的是当前工作树源码，不能将这些已有修改归入本轮。未登录、运行或截图正式生产页面，未进行全仓安全审计；截图均来自独立原型。

已检查权威文档、根 package.json、Web package.json、Web AGENTS.md，以及以下直接相关路径：

| 证据 | 发现 |
| --- | --- |
| `apps/web/app/(app)/home/page.tsx` | 当前首页验证 workspace 后渲染 `VideoAnalyticsWorkspace initialDemo` |
| `apps/web/app/(app)/dashboard/page.tsx` | 使用既有权限检查和工作区数据加载，调用 StudioShell / WorkbenchStart |
| `apps/web/components/sidebar-foundation.tsx` | 可折叠/临时展开/固定的应用外壳，包含多个历史业务导航组 |
| `apps/web/components/projects/studio-shell.tsx` | 已有项目、对话、资料、通用成果入口及 ArtifactWindow |
| `apps/web/components/content-hub.tsx` | 选题、审核、知识、事实、IP 背景多模式治理组件，读取 `/api/content-hub` |
| `apps/web/lib/appearance.ts` | 已有 light / black-titanium、同步初始化脚本、localStorage、storage 与自定义事件 |
| `apps/web/components/appearance-settings.tsx` | 已有互斥主题控件和存储失败反馈 |
| `apps/web/app/layout.tsx` | 依次导入 globals.css、product-v3.css、black-titanium.css、apple-workbench.css |
| `apps/web/app/globals.css` | 基础紫色强调；后段深色 Tokens 为深蓝 / 青色，浅色为苹果蓝；部分模块有固定浅色值 |
| `apps/web/app/black-titanium.css`、`apple-workbench.css` | 外壳与模块映射、覆盖规则、:has 选择器和品牌展示规则并存 |
| `apps/web/public/brand/` | 已有品牌资产，不能无依据建立新的平行 Logo 系统 |
| `apps/web/public/home-reference/README.md` | 旧参考缩略图低分辨率，为视觉灵感示例，不是高清用户作品 |

## 2. 产品与体验结论

### CURRENT IMPLEMENTATION

项目已具有主题基础、Project workspace、Conversation、Material 和 Artifact 的可复用能力。正式改造应从这些能力扩展，不能新建平行业务 Service、Provider 或 API。

### CURRENT IMPLEMENTATION GAP

1. 首页当前以视频分析体验呈现，未充分体现 PRODUCT.md 的“找到工作 / 创建项目 / 快速开始 / 回到最近工作”职责。本轮仅在原型中表达目标。
2. 深色实际 Tokens 是深蓝、青色与紫色辅助色，与此次“中性黑灰、精细层次”的视觉目标不同；浅色全局强调蓝色，与此次品牌红点策略不同。这是本轮设计目标差距，不是修改产品定义的理由。
3. CSS 多层覆盖和模块固定色值使主题一致性依赖选择器顺序，单独替换根色值不能保证所有页面正确。本轮没有机械清理正式 CSS。
4. Sidebar 的业务分组仍多于项目优先入口的核心对象；不能在视觉任务中顺手改动研究、发布、治理路由。
5. 通用 Artifact 与 MotherContent / Studio / Canvas 的兼容结构仍并存。原型以对话和文本成果为主要工作区，不删除兼容代码，也不将“Studio”视觉名称作为新的产品中心。

### EXPERIMENT

本轮用独立静态原型验证中性双主题、64px 导航、封面网格、苹果式浅色首页、共享组件和持续对话 / 成果编辑关系。内容中心是资料与成果的发现视图，不是对现有 ContentHub、Library 或 Artifact 服务的重构。

### FUTURE

发布作品、数据快照、创作者账号、经营复盘、License、本地优先桌面运行均未施工。本地原型不能据此宣称 Local-first Desktop 已完成。

## 3. CHANGED

- 新增独立 HTML / CSS / JavaScript 原型，三类页面共用外壳、卡片、图标、按钮、Badge、弹窗与反馈。
- `tokens.css` 定义颜色、间距、密度、标题尺度、表面、边界和强调状态；通过根 `data-theme` 切换。
- 保留用户原始 Logo，导航图标精确复用其中红点和水平弧线路径；品牌延展视觉用红色圆点和银色水平环。
- 新增三个原创 SVG 示例封面与一张 AI 生成主视觉，全部在仓库原型目录，不依赖临时路径或外部图片服务。
- 完成本地项目创建、示例对话、技能开关、文件名附加、文本成果编辑 / 保存 / 导出、内容搜索 / 筛选 / 收藏 / 详情 / 视图切换。
- 新增截图总览 `review.html`、本规范、设计文档、运行说明、浏览器验证脚本和验证结果。

## 4. 复用 → 扩展 → 适配的判断

先检查已有 appearance.ts、AppearanceSettings、SidebarFoundation、StudioShell、ArtifactWindow、ContentHub 和品牌资产。正式接入时应优先扩展这些组件，而非保留原型里的状态实现。

由于第一轮隔离要求，直接导入正式 React 外壳会带入全局 CSS、认证和数据服务；直接修改这些组件会侵入混合工作树。本轮因此采用零新增依赖的静态实验，不建立正式 V2 / New / Unified 系统，不修改共享 Service。原型 CSS 只由原型 index.html 加载。

## 5. VERIFICATION

最终验证使用本机现有 Chromium 1243 与仓库既有 Playwright，24 项定向检查通过，浏览器未捕获异常。

| 类别 | 当前结果 |
| --- | --- |
| 语法 | app.js、server.mjs 的 Node 语法检查通过 |
| 服务 | 127.0.0.1:4178 首页 HTTP 200 |
| 桌面六套页面 | 1440 × 1000，图像正常加载，无横向溢出 |
| 手机六套页面 | 390 × 844，无横向溢出 |
| 手机成果面板 | 深浅两套可切换，补充完整截图 |
| 平板 | 768 × 1024，浅色三页面无横向溢出 |
| 主题 | 真实切换，保留当前输入和编辑文本；主题及输入刷新恢复 |
| 文稿 | 编辑、显式保存、刷新恢复、Markdown 下载 |
| 对话与技能 | 固定演示回复完成，技能可开关，0 Skill 仍可对话 |
| 内容中心 | 搜索、空态、清除筛选、类型 / 状态、收藏、列表视图 |
| 项目与详情 | 创建本地项目并进入工作区；详情可打开并由 Escape 关闭 |
| API 边界 | 验证期间无 `/api/` 请求 |
| 截图 | 14 张完整 PNG，已复核全部桌面布局及代表性手机布局 |

过程问题与修正：默认 Playwright 指向未安装浏览器版本，改用本机已有版本；浅色移动间距被主题变量特异性覆盖，已补充等特异性断点覆盖并重新验证；手机长截图将导航临时移到画面底部避免内容遮挡，运行布局不变。

未运行全仓单元测试、正式 Next build/typecheck、正式页面 E2E、API / Service 测试、DB 验证、人工辅助技术审计。原因是本轮仅新增无编译的隔离静态原型，不涉及这些实现；本报告不引用历史测试结果为当前验收。

## 6. RISKS 与下一轮改造建议

- 当前数据是演示数据，项目数量、时间、进度与封面不代表真实业务。创建项目后继续使用共享示例工作区，不具备正式项目隔离。
- 当前只保存一份演示文稿和浏览器偏好；没有正式版本历史、并发编辑、跨设备同步或真实 Agent 流式生成。
- 文件附加仅记录名称，模型选项与技能均是交互演示；不执行正式模型选择、上传、转录、解析或研究。
- 全部文字、页面信息层级及密度需在真实项目、长标题、空列表、错误状态和大数据量下二次验收。
- 真实安全边界继续由既有服务端 workspace、user、project scope 与 RBAC 保证，不能用当前无登录原型代替。
- 下一轮在独立明确任务中，先将品牌和语义 Tokens 适配已有 appearance.ts；保留已存在的初始化和跨标签事件语义。逐页面映射旧变量，限定覆盖范围，避免一次重写全站 CSS。
- 再将 ProjectCard、内容列表和工作区布局落入现有组件体系，接入现有项目、资料、成果服务；移动到真实项目数据后移除原型本地状态。按变更范围运行相关 Service / API / 组件测试，模块收口升级到 V2。
- 首页恢复职责、正式内容中心如何与现有 Library / ContentHub / Artifact 分工，需作为后续明确模块任务处理。本轮无路由迁移，也无正式页面覆盖。

## 7. GIT

本轮交付目录：`prototypes/dual-experience/`。未执行 git add、commit、push、pull、merge、rebase、reset、stash、clean、分支切换。仓库其他已修改文件保持原样；状态为 READY_TO_STAGE，用户未授权暂存或提交。

## 8. 参考图细化轮增量

CHANGED：首页保留用户确认的深浅两张图的布局；应用导航补充数据中台。图三、图四分别成为数据总览和行为分析，每个视图都有深浅主题。两视图共用系统外壳、字体、表面、边界、控件与提示；图形采用暖灰序列色。

新增 `analytics.js`、`analytics.css`、`charts.js` 和 `FRONTEND-DESIGN.md`；扩展 app.js 的页面渲染映射和 review.html 的交付入口。未新增依赖、Service、Model、API 或数据库能力。

搜索等价能力：正式视频分析组件已有 SVG 趋势、分布和柱状图，但携带 React 与生产数据上下文。本轮为隔离静态设计实验，没有直接导入或修改生产组件；后续正式接入应优先复用/适配这些能力。

保留的结构：总览四个 KPI、全宽面积折线、下方堆叠占比/排行/来源环图三卡；行为分析的指标折线、7×24 时段热力、垂直柱状、三角留存矩阵、三条活跃趋势、设备环图。来源环图保留外部引线标注，设备图保留三列占比。

VERIFICATION：43 项当前定向检查通过，浏览器未捕获异常；验证期间无 `/api/` 请求。覆盖五视图×两主题×桌面/手机、平板溢出、原有关键交互、新增周期/指标/图例/数据点、范围、搜索、详情与 CSV 导出。22 张完整截图已生成并进行布局复核。数据页切换主题后卡片坐标与宽度保持一致。新增设计文档链接 HTTP 200。

过程修正：视图点击测试需要等待 hash 路由渲染，已补充等待；图表轴顶值改为合理分档，移动坐标字号与标签密度调整；来源图恢复外部标注；行为分析使用独立指标状态，百分比/时长与总览计数不混用。

RISKS：所有统计值都是视觉与交互样例。范围切换仅改变演示趋势与总览数值，设备比例、留存矩阵与多周期活跃序列仍是固定例子；不代表完整统一统计查询。行为分析、实时活跃、留存与设备采集没有正式后端实现；特殊活跃卡明确为快照。未进行全仓 build/typecheck、正式业务/API/数据库测试或正式无障碍认证。

BOUNDARY / GIT：仍仅修改 `prototypes/dual-experience/`，未覆盖正式页面、修改 API 或权威文件。未暂存、提交或推送，READY_TO_STAGE。

## 后端对应迭代交付（2026-10-10）
STATUS：READY_TO_STAGE；EXPERIMENT。
CHANGED：独立研究页、项目引用范围/多技能/版本展示、资料处理/事实确认、账号运营指标、导入预览/任务展示及未接入统计状态。
BOUNDARY：仅 prototypes/dual-experience；未修改正式页面、API、数据库或权威文档。未执行 Git 暂存、提交、推送。
VERIFICATION：本次 verify-backend.mjs 定向浏览器验证34项通过、26张更新截图；JSON为 VERIFICATION-BACKEND.json。上一轮43项为历史验证，不作为本轮结果。覆盖六视图双主题响应式、研究衔接、引用范围、多技能、历史入口、导入预览、未接入图表状态和零正式API请求。
RISKS：全部业务值为固定演示，接口存在不代表完整上线验收。版本恢复、实际CSV解析、研究执行与数据聚合未接入；所有未完成动作在页面明示。完整内容经营闭环仍为FUTURE。

## 全量接口登记与视频拆解交付（最新）
STATUS：READY_TO_STAGE / EXPERIMENT。
CHANGED：新增视频拆解、设置、功能接口地图三页；研究入口衔接拆解；新增API-INVENTORY.json、API-COVERAGE.md、API-GAP-DESIGN.md。196个路由文件/282个HTTP入口，571个server导出函数直接调用登记。具体业务重点人工核对teardown/service、core/teardown报告Schema、研究共享、资产访问、成果接口及日度数据契约。
BOUNDARY：静态声明登记不是所有业务运行验收；未找到直接调用的函数不视为缺少API。未改正式页面、API、Schema、权威规则或现有用户改动。没有Git暂存/提交。
GAPS：跨项目通用Artifact汇总；本地资料一键拆解；自选维度；小时/留存/设备统计；多媒体Artifact；运行权限与有效性。六项包含未来与待验证项，不全部属于本轮可施工的缺失接口。
VERIFICATION：最新verify-coverage.mjs：55项检查通过、44张截图、0浏览器异常、0正式API请求。检查包含视频时间轴/原文、比较口径、失败重试取消、只读按钮、导出、报告加入选定项目、接口搜索、action分支、缺口设计与9视图双主题响应式。未运行正式应用build、服务端测试或数据库迁移，因本轮仅独立静态原型与V0接口分析。
RISKS：拆解为固定样例，不能播放/采集真实视频。导出函数包含内部工具与读取投影，不等于571个独立产品功能。页面承接不代表282个接口全部联调，剩余入口以操作说明面板呈现。完整内容经营与桌面目标不宣称完成。
