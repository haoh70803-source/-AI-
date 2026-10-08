# V1 产品验收规范

原内部试用验收日期：2026-09-01

统一 Workbench 验收规范更新：2026-09-11

原验收分支：`chore/v1-product-acceptance`

当前施工分支：`feat/production-readiness-v1b`

验收范围：V1 统一 Workbench、信息架构、完整业务主链、员工语言、权限边界、事实安全、人工审核与 Desktop Pixel Spec。

运行模式：PostgreSQL / Redis / MinIO / Web / Worker 均为真实本地服务；未配置的外部能力使用显式 `MOCK MODE`，未连接真实发布平台。

## 最终产品信息架构

普通员工一级导航固定为：

- 开始创作
- 项目
- 研究
- 资产

方法属于资产体系；平台适配、审核和发布记录属于稿件后续链路；设置与管理员页面是次级、权限受控页面。Studio、方法、发布、Skill 和独立 AI 助手中心不作为一级导航。

`/dashboard` 是唯一 canonical Workbench：

- 有当前项目时，直接加载 Canvas、当前稿件、当前引用和鑫小助。
- 无当前项目时，只显示“从一个想法开始 / 从研究开始 / 从资产开始 / 继续最近工作”四个真实入口。
- 不显示旧 Dashboard Hero、统计看板、功能卡墙或第二套 AI 输入系统。

## V1 happy path

使用页面创建并完善 Creator A，随后仅通过产品 UI 完成：

1. 登录并进入“开始创作”。
2. 新建或选择一个 ContentProject，进入同一个 `/dashboard?project=:id` Workbench。
3. 从研究或资产加入参考素材和我方依据。
4. 查看并按需选择方法，默认方法继续自动参与生成。
5. 使用鑫小助的真实快捷动作协作；AI 结果先 Preview，用户确认后 Apply。
6. 形成并编辑我的口播稿，进入稿件 Focus Mode 完成选中文字、事实检查、自动保存和版本回看。
7. 处理阻断项并最终确认稿件。
8. 选择一个平台，按需生成并人工应用该平台版本。
9. 提交人工审核，填写结论并批准、退回或拒绝。
10. 对已批准内容创建发布任务，复制发布包，由人工完成真实发布并登记结果。
11. 返回同一个 Workbench，将项目完成或归档。

结果：主链路通过；AI 没有代替人工审批，发布也没有触发真实外部动作。

## P0

未发现阻断 V1 内部试用的 P0 问题。

## P1

| 问题 | 影响 | 处理 |
| --- | --- | --- |
| 侧栏展示不可用的 `Coming Later` 模块 | 用户误以为功能可用，主导航噪声大 | 已移除，只保留 V1 可用入口 |
| 旧 Dashboard 以统计、Hero 和功能卡墙组织入口 | 员工需要理解页面层级，不能直接继续当前工作 | `/dashboard` 改为统一 Workbench；无项目时只显示四个真实起点 |
| 旧 Studio 固定三栏并平铺创作、AI 和平台内容 | 挤压稿件、暴露系统结构、难以保持当前焦点 | 改为 Canvas + 可收起/resize 的鑫小助；稿件使用 Focus Mode，平台适配按需进入 |
| 创作简报保存后表单可能回退到旧显示值 | 用户会误判保存失败或覆盖新内容 | 已改为受控表单，并验证保存后值保持一致 |
| 核心页面暴露大量英文和枚举 | 增加理解成本 | 已统一关键术语与可见状态的中文展示 |
| 素材详情优先展示 Provider、Attempt 等技术信息 | 主内容被处理日志抢占 | 已把处理日志收进“高级信息与处理记录”折叠区 |
| 审核页出现原始状态、来源枚举和风险代码 | 审核者难以快速理解风险 | 已翻译状态、来源和严重程度；技术检查编号移入折叠详情 |
| 发布任务详情显示原始发布状态和内部模型名 | 人工发布操作不够产品化 | 已翻译状态，并将内容快照、平台草稿、核心母稿改为可理解文案 |

## P2

本阶段已顺手处理的明显 P2：

- 素材库平台、类型、状态和素材集文案中文化。
- 设置首页按个人创作、AI 与外部服务、团队权限重新命名。
- 平台内容中的 Hook / Hashtags 可见标签改为“开场 / 话题标签”。
- `MOCK` 徽标统一为醒目的 `MOCK MODE`。

仍保留的 P2：

- CreatorProfile 表单仍较长，后续可增加分组导航，但不影响填写和保存。
- 月历在窄屏以完整七列呈现，功能可用但阅读密度仍高。
- 本地开发环境仍会请求缺失的 `/favicon.ico`，不影响业务流程。
- Canvas 服务端布局、自由对话、对话历史、附件和结构化引用属于 V1.5，不阻塞 V1 Workbench 首次收口。

## Responsive

- 1440 / 1680 / 1920 Desktop：按 Pixel Visual Spec 验收统一 Shell、256px expanded sidebar、64px rail、Canvas / 鑫小助 split、Agent 260–520px、pane resize 和 20px grid。
- Workbench：Canvas 是主工作面；鑫小助可收起和调整宽度；两侧都不得低于各自 hard minimum。
- 稿件 Focus Mode：覆盖 Canvas，保留右侧鑫小助和当前上下文；支持键盘退出、焦点返回和 reduced motion。
- 小于 Desktop 工作宽度时切换单 pane，不强行保留旧三列布局。

## Data and boundaries

- 未新增数据库表、业务 API 或业务页面。
- V1 不新增自动发布、平台 OAuth、自由对话、联网搜索、Skill 系统、AI Canvas 自动整理或多账号矩阵。
- 测试账号、素材、项目、审核与发布任务来自真实 UI 操作，不使用数据库捷径推进最终状态。
- 外部模型和平台不可用时只使用显式 `MOCK MODE`；发布备注明确记录为内部试用模拟。

## 员工语言、事实与权限

- 普通员工 UI 不展示 Model、Provider、Attempt、Skill、Workflow、Node、AIRun、ApiUsage、内部枚举或 run id。
- AI 建议与已确认事实、我方输入、来源内容必须保持清晰区分。
- 不得把外部作者经历、数据、承诺或不确定实体改写成我方事实。
- VIEWER 保持只读；EDITOR / ADMIN / OWNER 继续沿用既有 Workspace RBAC。
- 所有真实外部发布继续要求人工审核和人工操作。

## Historical verification（2026-09-01）

- `pnpm lint`：8 / 8 workspace tasks 通过。
- `pnpm typecheck`：8 / 8 workspace tasks 通过。
- `pnpm test`：36 个测试文件、156 个测试通过；无失败。
- `pnpm build`：8 / 8 workspace tasks 通过，Next.js 生产构建成功。
- `pnpm test:e2e`：正常环境 14 个用例通过；仅限显式 `MOCK_MODE` 的 V1 Fixture 用例按设计跳过。
- V1 Happy Path：在显式 `MOCK_MODE` 下单独运行，1 / 1 通过。

以上是历史验收结果，不能替代统一 Workbench 实施后的重新验证。最终 QA 必须按当前规则执行 full Vitest、full typecheck、lint、build、critical E2E，以及 1440 / 1680 / 1920 visual QA。
