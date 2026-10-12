# 工作台 UI 与分页修复（2026-10-10）

主要目标：让项目对话保持视觉中心，统一本次涉及的资料、成果、拆解与数据页面的阅读和控件行为。产品对象和服务端权限沿用 PRODUCT.md / ARCHITECTURE.md；本任务不是 Governance Update。

## 分类、证据与设计

| 类别 | 对应问题 | 当前实现证据与根因 | 本次处理 |
| --- | --- | --- | --- |
| 阅读分页 | 1、6、8、9 | ArtifactEditor 一次渲染全部 Markdown；账号表现、作品列表、账号矩阵、内容台账与任务列表直接 map 全量数据 | 共用 Pagination 与 pageWindow；正文约 2400 字符一页，保留代码和表格完整区块，超长结构区块内部滚动 |
| 布局比例 | 2、6、8、12 | artifactWindowOpen 默认 true；最后一条布局规则中成果宽度是对话的 1.5 倍；临时侧栏不推移主内容；数据卡片最低 400px；封面 object-fit:cover 裁切 | 空成果默认收起；对话/右栏约 1.8:1；侧栏与主区域同一时长同步；数据卡片按内容独立高度；缩略图 contain |
| 工作交接与状态 | 3、4、5 | 项目成果读取 Artifact；只有保存成果后才有记录，转录/分析不是 Artifact；首页链接跳资料库，但 HomeComposer 已有选择器；资料创建项目后只带 project 参数 | 首页原地复用选择器，接入服务端搜索分页；资料进入项目时携带 source 与 focus=conversation；右侧明确显示原始文字稿参考，保留成果独立身份 |
| 主题与控件 | 7、10、11 | 拆解根容器已使用主题变量，但历史侧栏仍 background:white，部分文字仍固定深色；页面原生 select 样式分散，focus 使用品牌强调色 | 清理拆解固定中性色，沿用 UI 字体；复用原生 select 实现 ThemedSelect，保留原表单/键盘/禁用语义；焦点使用中性轮廓，错误仍保留语义色 |

## 方案比较与选择

1. 逐页补丁：短期较快，但分页、主题和状态会继续分散。
2. 重建 UI 框架或新增组件库：影响范围和依赖代价过大，不适合本次修复。
3. 复用现有首页选择器、主题变量、Markdown、编辑保护和原生表单控件，只补缺失的共享分页及 Select 外观：本次采用。

原始资料和保存成果分开显示符合产品的 Material / Artifact 职责。未保存的分析和对话回复不会自动伪装成成果。普通进入项目时成果默认收起，显式打开成果链接时展开；从资料进入对话时展示原始文字参考。切换项目重新初始化工作区 UI，切换参考资料仍经过已有未保存成果保护。

## 分页矩阵

| 入口 | 分页方式 | 页大小 | 统计/持久化边界 |
| --- | --- | --- | --- |
| 首页资料选择 | 既有 /api/source-items 服务端 page/search | 12 | 跨页保留已选资料，搜索回第一页，失败与空状态区分；直接锚定首页按钮，主题/布局变化重新定位，触发按钮离开视口收起选择框 |
| 成果正文预览 | 读取时按区块分页 | 约 2400 字符 | 编辑、保存和导出仍使用全文；不修改持久化格式 |
| 成果列表 | 当前项目已读取列表分页 | 嵌入 5 / 窗口 8 | 当前成果与版本保留；直接打开后页成果自动定位所在页；切换条目仍走原编辑保护 |
| 数据总览账号表现 | 完整筛选数据的客户端分页 | 5 | 扇形图和汇总按完整筛选范围计算，不按当前页计算 |
| 作品表现 | 排名后的客户端分页 | 10 | 切换排名回第一页；概览精选列表维持原范围 |
| 账号矩阵 / 内容台账 / 全部任务 | 筛选后的客户端分页 | 12 | 新筛选回第一页；修改操作仍沿用现有 API 和权限 |
| 数据记录 | 已存在分页，保留 | 20 | 本任务未修改记录写入与导入行为 |
| 资料库 / 拆解历史 / 成果版本历史 | 已存在服务端分页或游标，保留 | 原规则 | 不重复建设 |

CURRENT IMPLEMENTATION GAP：运营服务仍有内容 500 条、任务 1000 条和项目选项 200 条的既有读取上限。本次客户端分页解决显示和 DOM 体量，不是服务端无限数据分页；没有改变统计数据契约。超出上限后的完整查询、游标和计数需要单独定义兼容 API 并做数据库回归，不能宣称已经实现。原生 Select 展开菜单的细节由浏览器/操作系统控制，主题和触发控件已统一，无新增外部 UI 依赖。

## 验证与边界

验证等级：V2 前端 UI 收口，并追加 Web 全包类型和生产编译检查。真实数据库与 AI 链路 E2E 不使用模拟结果替代。

| 链路 | 实现与权限边界 | 本次证据 | 未覆盖 |
| --- | --- | --- | --- |
| 首页选资料 → 新项目 | 原首页创建和资料 scope 保留 | 浏览器：原地打开、12/12/6 分页、跨页勾选、搜索重置、错误、Escape、深浅主题、较低窗口、弹层视口位置及 Escape 焦点恢复 | 真实项目创建与上传 |
| 资料 → 项目对话 | 原创建 API 保留；仅可访问的项目资料用于右栏 | 浏览器：创建请求 sourceItemId 与目标 source/focus 参数 | 实际登录、数据库关联和完整 AI 对话恢复 |
| 成果预览 → 编辑 → 保存 | 原版本检查、权限、锁定和未保存保护保留 | 浏览器：分页预览、恢复全文、保存完整正文；成果列表 5/5/3；单测：结构区块与 Unicode 无丢字 | 真实 PUT、历史回退、AI 修改、实际下载和跨账号权限回归 |
| 总览账号 → 筛选 | 不改变完整范围统计口径 | 浏览器：13 个账号 5/5/3，翻页总计仍 1300，筛选后 100 | 真实平台接入与数据库读取 |
| 作品排名 | 保留现有排名算法 | 浏览器：10/6 分页、切换排名重置；原数据计算单测 | 大量真实作品 |
| 两种主题与布局 | 不改权限或业务状态 | 浏览器：侧栏 64→236、对话比参考栏宽、contain、Select 和拆解主题；截图人工查看 | 完整登录页面截图、触屏和真实业务交互 |

测试使用 LOCAL_TEST 目标检查。新增 UI 测试在随机端口使用静态组件与模拟 API，Next 路由/Link 为适配器；不写数据库，不启动或停止其他窗口服务。服务端 scope 和权限没有变更。

本次通过：分页/侧栏/数据计算 21 项单测；8 项隔离浏览器回归；组件及新增测试 ESLint；Web 全包类型检查；git diff --check。Next 生产编译检查通过（--experimental-build-mode compile，不等同完整 release build 和静态生成验收）。完整 release build、数据库集成、真实 AI 与外部平台验收未执行：Worktree 无已确认的隔离运行环境文件。

## Git 与回滚

任务分支 fix/workspace-ui-pagination，Worktree E:/AI工作台1.2/.worktrees/workspace-ui-pagination，基线 caf7162。原目录 AGENTS.md 与另外两个 Worktree 的工作保留。无 Schema、Migration、Service、API 响应、依赖版本或锁文件变更。没有暂存、提交、合并或推送。

回滚仅涉及本任务 UI、分页与相关测试文件；无数据迁移或外部副作用。集成与提交需另行授权，之后需要在集成环境重新执行相关验证。


## 可复现检查命令

工作目录为本任务 Worktree。Windows 沙箱对 pnpm 符号链接、临时文件重命名和 SWC 路径解析有限制，本次相关命令经工具审批在沙箱外运行；没有关闭 Lint、TypeScript 或测试目标检查。

- `node node_modules/eslint/bin/eslint.js app components lib server tests e2e --max-warnings=0`（apps/web，Web 全量 Lint）。
- `node node_modules/next/dist/bin/next typegen`（apps/web，LOCAL_TEST）；`node node_modules/typescript/bin/tsc -p apps/web/tsconfig.json --noEmit --incremental false`（根目录，Web 全包类型检查）。
- `node node_modules/vitest/vitest.mjs run apps/web/tests/content-pagination.test.ts apps/web/tests/sidebar-state.test.ts apps/web/tests/video-analytics.test.ts --no-file-parallelism`（根目录，21 项）。
- `node ../../node_modules/@playwright/test/cli.js test --config playwright.ui-components.config.ts`（apps/web，8 项）。
- `node node_modules/next/dist/bin/next build --webpack --experimental-build-mode compile`（apps/web，LOCAL_TEST、NEXT_TELEMETRY_DISABLED=1）。
- `git diff --check`。

无数据库访问的单元/浏览器测试保留 ENVIRONMENT_ID=LOCAL_TEST，DATABASE_URL 指向既有检查允许的本机 55433/content_center_test 隔离目标，使用测试占位凭据；没有用真实连接串。Prisma 仅用本机同版本引擎生成客户端，不运行迁移。证据文件和截图在 `output/workspace-ui/`，均为模拟数据，不纳入 Git。

## 原目录集成检查（2026-10-10）

经用户“合并 / 将源代码更新”授权，本任务 30 个文件已合入 E:/AI工作台1.2 的工作文件。原目录分支仍为 integration/github-safe-20261010；未暂存、未创建 Git 提交、未推送。AGENTS.md、FRONTEND_IMPLEMENTATION_REPORT.md、app-shell.tsx、sidebar-foundation.tsx 与 app-shell-topbar.test.tsx 的原有修改经哈希核对完整保留。共享 app-shell.css 采用 hunk 合并，保留另一个任务新增的顶部导航样式，不覆盖文件。

合入后重新执行：23 项单测（分页、侧栏、数据计算和顶部导航）、8 项隔离浏览器回归、Web 全包 ESLint、Web 全包 TypeScript、git diff --check，均通过。首次根目录单测命令还匹配了 Worktree，且顶部导航测试遇到 JSX 转换配置错误；改为在 apps/web 复用顶部导航任务已有的 output/remove-topbar/vitest.config.mts 后，4 个目标测试文件全部通过，未修改测试断言或全局配置。

本轮未重新执行生产编译、完整 release build、数据库及真实 AI E2E；前一节编译证据属于独立 Worktree，不能作为合入后构建结果。此次没有修改数据库、依赖、运行服务或发布产物。源码已更新；若查看的是已有生产构建，需要重新构建与启动后才能看到更新。

## 首页工作台直接展示与焦点样式（2026-10-10）

按用户“也是直接修改源码”的要求，在原目录继续修改。首页创作输入现在始终展示，取消折叠状态和收起按钮；开始对话、开启项目、套用提示词仍可定位输入，资料选择、模型、Skill、发送与草稿恢复继续使用原实现。

根因：WorkbenchStart 默认将 composerOpen 设为 false；带 apple-workspace-marker 的首页旧规则具有更高优先级，仍给输入外层和 textarea 添加红色边框及光圈，覆盖了已有中性焦点样式。修改 workbench-start.tsx、home-reference.css 和 apple-workbench.css：移除折叠开关、保持输入框正常边界、将通用键盘焦点统一为中性轮廓。保留错误状态颜色。

在既有 workspace-ui.spec.ts 中增加行为回归：首次进入可直接输入，深浅主题点击无外圈，Tab 操作有中性焦点，刷新后草稿保留。修复前实际失败于输入框隐藏；修复后通过。沿用 LOCAL_TEST 目标检查、随机本地端口及 Mock 接口，不访问业务数据库。

本轮结果：9 项 UI 浏览器回归、定向 ESLint、Web 全包 TypeScript 和 git diff --check 均通过。本轮为小范围 UI 调整，未重复运行完整生产构建或真实业务 E2E。

截图：output/workspace-ui/home-composer-neutral-black-titanium.png、home-composer-neutral-light.png。本轮未暂存、提交或推送；回滚仅需恢复上述文件中的本轮 hunk，不涉及数据恢复，不能覆盖同文件中已存在的其他任务修改。

## 对话区精简 · 2026-10-10

按用户截图反馈，`studio-shell.tsx` 将项目上下文默认收起，沿用已有单列布局；顶部保留“项目资料与设置”入口。移除项目标题下重复说明。`creation-controls.tsx` 移除参数上方的常驻使用提示。`studio-default-method.tsx` 将逐条消息的资料 / 背景说明并入默认关闭的来源详情，不再显示黄色提示条；实际加载失败、发送失败、权限异常与消息状态仍保留。资料选择、Skill、引用、存储和后端上下文组装未改。

验证：新增并执行隔离浏览器回归 `chat keeps contextual notes collapsed and still exposes actual loading failures`，验证回答正文、提示默认隐藏 / 手动展开、输入框可用、403 读取错误继续展示。命令为现有 `playwright.ui-components.config.ts -g "chat keeps"`，LOCAL_TEST 与隔离数据库目标保护保留，所有接口为 mock。定向 ESLint 与 git diff --check 通过。完整 web 包 TypeScript 检查通过。本轮未运行完整构建或真实模型对话；未新增提交。

## 项目摘要边缘预览 · 2026-10-10

按用户提供的浮层参考，移除 `studio-shell.tsx` 普通对话视图中的上下文 aside、折叠状态与顶部开关，始终使用已有无上下文侧栏布局。新增局部组件 `project-context-preview.tsx`，左缘单个刻度按钮对应当前项目：悬停 / 键盘聚焦预览，点击固定，点击外部 / Esc / 焦点移出关闭。标题、三行摘要来自真实项目字段，不伪造会话目录或 AI 总结。

浮层内“资料与设置”复用原 StudioSources、项目 Skill、事实和研究入口；输入框原有引用 / Skill 操作保留。原始项目说明与后端上下文组装未修改。局部样式位于 `artifact-window.css`；无依赖变更。

验证：现有隔离 Playwright 配置执行 `-g "context marker|chat keeps"`，2 项通过。覆盖默认关闭、悬停、不产生布局位移、点击固定、外部关闭、键盘 Escape、资料操作入口、1440 / 390 两主题浮层边界及聊天真实错误保留。截图 `output/workspace-ui/context-preview-{black-titanium,light}-{1440,390}.png` 为组件示例；未对登录后的完整工作区或实际资料写入进行端到端验收。定向 ESLint、diff --check 通过；最终完整 web 包 TypeScript 检查通过。本次未重跑正式构建。未暂存、提交或推送。

## 最终调整：撤除摘要浮层 · 2026-10-10

以用户最新“返回原来的样式，去掉上下文即可”为准，上一节的刻度 / 浮层方案已撤回。删除本次新增的 ProjectContextPreview、专属样式和对应示例测试，移除工作区调用；保留此前其他任务改动。普通对话恢复原有样式，既无左侧上下文栏，也无顶部上下文开关或替代浮层；继续使用现有单列布局。后台上下文逻辑、输入框资料 / Skill 操作以及高级视图中的既有资料管理保持不变。此处删除的测试只对应用户明确撤回的浮层功能。

本轮定向 ESLint、diff --check 已通过。完整 web 包 TypeScript 检查通过；聊天定向浏览器回归 1 项通过。没有执行完整构建，也没有提交或推送。

## 当前生效：保留左侧任务操作 · 2026-10-10

根据用户最新截图恢复左侧常显操作栏：当前资料 / 添加资料、项目 Skill、已确认信息、从此项目开始研究。仅移除重复的“项目上下文”标题和长篇任务描述，不恢复顶部折叠开关、刻度或摘要浮层。复用原 StudioSources 和原响应式侧栏布局，仅修改 studio-shell.tsx；前述“无左侧栏”的状态已被本次要求替代。后台上下文、资料 ID、权限和业务事件未变。

本轮定向 ESLint、git diff --check 通过；完整 web 包 TypeScript 检查通过。本次未重新运行浏览器测试和正式构建，不将历史截图作为本次验证。未暂存、提交或推送。
