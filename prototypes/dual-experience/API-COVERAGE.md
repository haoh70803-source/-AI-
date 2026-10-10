# 前后端功能与接口逐项对应检查

状态：EXPERIMENT；范围：独立原型与静态代码核对，不修改正式 API。
扫描 196 个 route.ts，登记 282 个 HTTP 方法入口及 571 个 server 导出函数。

当前工作区静态快照；API逐方法登记，导出函数仅直接调用检索，不是运行验收

## 阅读规则
- CURRENT IMPLEMENTATION：代码中存在接口声明；不等于接口已联调。
- LEGACY COMPATIBILITY：保留原功能入口关系，不将母稿、Canvas或默认方法升级为产品中心。
- INTERNAL：内部/基础设施接口不强制设计普通用户按钮。
- 没有直接路由调用的导出函数不自动视为缺少接口，需要追踪其内部调用链。
- 页面列是设计承接位置；全量入口可在原型功能地图搜索，领域主流程有专属交互，其余用操作说明面板呈现。

## 接口缺口与补充设计

### 跨项目成果汇总 · CURRENT IMPLEMENTATION GAP
已有项目级 Artifact 列表；未找到通用 workspace 级 Artifact 汇总接口。content-hub 是知识/事实/选题治理，不能替代成果列表。
优先组合现有项目级列表；规模需要时设计 GET /api/artifacts?projectId=&type=TEXT&cursor= ，仅为契约草案，服务端检查 workspace、项目可见性。

### 本地视频与其他平台的一键拆解 · EXPERIMENT
专用 teardown POST 当前仅接收抖音分享文字。文件上传接口存在，但不等于支持上传文件后一键拆解。
先复用资料上传/处理；另行设计 sourceItemId 输入适配，保留转写时间戳校验和权限，不重复创建采集服务。当前页面仅接受抖音链接。

### 用户自选拆解维度 · EXPERIMENT
teardown 输入只有 shareText/requestKey；分析结构由既定 Schema 定义，未接受用户自选维度。
如产品确认需要，在既有契约扩展经过校验的 analysisOptions；本轮不添加会误导用户的可用开关。

### 时段、留存、设备统计 · FUTURE
video-data 为账号日度记录，没有小时事件、用户 cohort 或设备维度。
保留图形与待接入状态；未来必须先定义对应数据来源、采集粒度和权限。不得由日度数据推造统计。

### 通用图片 / 视频成果 · CURRENT IMPLEMENTATION GAP
通用 ArtifactType 目前只有 TEXT；视频资料、封面和平台旧路径不能证明多媒体成果能力。
页面明确文本成果与原始媒体资料；未来扩展类型、存储与编辑器契约后开放。

### 运行期权限与接口有效性 · VERIFY
文件中存在处理器不代表依赖服务、配置、RBAC和运行环境已验收。
正式接入按模块验证401/403/404/409、取消/超时、版本冲突和范围隔离。本轮不调用生产API或外部收费服务。

## 视频拆解专属链路
输入抖音链接 → MATERIAL → TRANSCRIPTION → BASELINE → ANALYSIS → COMPLETED → 阅读报告/导出/加入项目。
GET/POST /api/research/teardown：历史分页/创建（shareText, requestKey）。
GET /api/research/teardown/[runId]：状态、阶段、转写进度、报告和 videoAssetId。
DELETE 同路径：停止任务，服务端状态为 FAILED + CANCELLED。
POST 同路径：version + mode(retry/refresh)，版本防护与任务恢复。
DELETE /api/research/teardown/[runId]/history：个人历史删除，不删除资料或共享成果。
GET /api/research/teardown/[runId]/export：完成报告 Markdown 下载。
GET /api/source-items/[id]/assets/[assetId]/access?preview=video：受控视频预览。
GET/POST /api/research/results/[runId]/share：预览/加入已有或新项目，校验版本与可分享内容。
报告承接字段：work、baseline、transcript、analysis.thesis/sections/strengths/distractions/virality/trendAssessment。
重要边界：不分析画面、配乐或后台留存；时间戳来自实际 ASR，不能由模型编造。

## 全量接口登记
| 方法 | 路径 | 模块 | 页面承接 | 状态 | 源码 |
| --- | --- | --- | --- | --- | --- |
| POST | `/api/account/invitation` | 登录与账号 | 登录 / 邀请 / 验证 / 账号恢复 | CURRENT IMPLEMENTATION | `apps/web/app/api/account/invitation/route.ts:4` |
| POST | `/api/account/recovery` | 登录与账号 | 登录 / 邀请 / 验证 / 账号恢复 | CURRENT IMPLEMENTATION | `apps/web/app/api/account/recovery/route.ts:5` |
| PATCH | `/api/account/recovery` | 登录与账号 | 登录 / 邀请 / 验证 / 账号恢复 | CURRENT IMPLEMENTATION | `apps/web/app/api/account/recovery/route.ts:13` |
| POST | `/api/account/verification` | 登录与账号 | 登录 / 邀请 / 验证 / 账号恢复 | CURRENT IMPLEMENTATION | `apps/web/app/api/account/verification/route.ts:7` |
| PATCH | `/api/account/verification` | 登录与账号 | 登录 / 邀请 / 验证 / 账号恢复 | CURRENT IMPLEMENTATION | `apps/web/app/api/account/verification/route.ts:15` |
| GET | `/api/admin/system/providers/[provider]` | 系统管理员 | 管理员工作区 / 用户 / 服务 / 用量 | CURRENT IMPLEMENTATION | `apps/web/app/api/admin/system/providers/[provider]/route.ts:10` |
| PUT | `/api/admin/system/providers/[provider]` | 系统管理员 | 管理员工作区 / 用户 / 服务 / 用量 | CURRENT IMPLEMENTATION | `apps/web/app/api/admin/system/providers/[provider]/route.ts:24` |
| GET | `/api/admin/system` | 系统管理员 | 管理员工作区 / 用户 / 服务 / 用量 | CURRENT IMPLEMENTATION | `apps/web/app/api/admin/system/route.ts:5` |
| GET | `/api/admin/usage` | 系统管理员 | 管理员工作区 / 用户 / 服务 / 用量 | CURRENT IMPLEMENTATION | `apps/web/app/api/admin/usage/route.ts:7` |
| PATCH | `/api/admin/users/[id]` | 系统管理员 | 管理员工作区 / 用户 / 服务 / 用量 | CURRENT IMPLEMENTATION | `apps/web/app/api/admin/users/[id]/route.ts:10` |
| GET | `/api/admin/users` | 系统管理员 | 管理员工作区 / 用户 / 服务 / 用量 | CURRENT IMPLEMENTATION | `apps/web/app/api/admin/users/route.ts:16` |
| POST | `/api/admin/users` | 系统管理员 | 管理员工作区 / 用户 / 服务 / 用量 | CURRENT IMPLEMENTATION | `apps/web/app/api/admin/users/route.ts:26` |
| GET | `/api/admin/workspaces` | 系统管理员 | 管理员工作区 / 用户 / 服务 / 用量 | CURRENT IMPLEMENTATION | `apps/web/app/api/admin/workspaces/route.ts:6` |
| POST | `/api/admin/workspaces` | 系统管理员 | 管理员工作区 / 用户 / 服务 / 用量 | CURRENT IMPLEMENTATION | `apps/web/app/api/admin/workspaces/route.ts:11` |
| POST | `/api/auth/[...all]` | 登录与账号 | 登录 / 邀请 / 验证 / 账号恢复 | CURRENT IMPLEMENTATION | `apps/web/app/api/auth/[...all]/route.ts:31` |
| GET | `/api/auth/[...all]` | 登录与账号 | 登录 / 邀请 / 验证 / 账号恢复 | CURRENT IMPLEMENTATION | `apps/web/app/api/auth/[...all]/route.ts:24` |
| POST | `/api/benchmark-topics/[runId]/select` | 研究与对标 | 研究范围 / 会话 / 结果 / 对标记录 | CURRENT IMPLEMENTATION | `apps/web/app/api/benchmark-topics/[runId]/select/route.ts:8` |
| POST | `/api/benchmark-topics` | 研究与对标 | 研究范围 / 会话 / 结果 / 对标记录 | CURRENT IMPLEMENTATION | `apps/web/app/api/benchmark-topics/route.ts:6` |
| GET | `/api/collections` | 资料与知识 | 内容列表 / 资料详情 / 处理状态 / 知识确认 | CURRENT IMPLEMENTATION | `apps/web/app/api/collections/route.ts:6` |
| POST | `/api/collections` | 资料与知识 | 内容列表 / 资料详情 / 处理状态 / 知识确认 | CURRENT IMPLEMENTATION | `apps/web/app/api/collections/route.ts:13` |
| GET | `/api/content-hub` | 资料与知识 | 内容列表 / 资料详情 / 处理状态 / 知识确认 | CURRENT IMPLEMENTATION | `apps/web/app/api/content-hub/route.ts:7` |
| POST | `/api/content-hub` | 资料与知识 | 内容列表 / 资料详情 / 处理状态 / 知识确认 | CURRENT IMPLEMENTATION | `apps/web/app/api/content-hub/route.ts:16` |
| GET | `/api/creation/models` | 创作输入与模型 | 资料引用选择 / 模型选择 / 语音输入 | CURRENT IMPLEMENTATION | `apps/web/app/api/creation/models/route.ts:4` |
| POST | `/api/creation/sources` | 创作输入与模型 | 资料引用选择 / 模型选择 / 语音输入 | CURRENT IMPLEMENTATION | `apps/web/app/api/creation/sources/route.ts:5` |
| GET | `/api/creator-profile` | 设置与偏好 | 成员 / 服务配置 / 模型 / 存储 / 创作偏好 | CURRENT IMPLEMENTATION | `apps/web/app/api/creator-profile/route.ts:15` |
| PUT | `/api/creator-profile` | 设置与偏好 | 成员 / 服务配置 / 模型 / 存储 / 创作偏好 | CURRENT IMPLEMENTATION | `apps/web/app/api/creator-profile/route.ts:21` |
| PATCH | `/api/creator-profile/suggestions/[suggestionId]` | 设置与偏好 | 成员 / 服务配置 / 模型 / 存储 / 创作偏好 | CURRENT IMPLEMENTATION | `apps/web/app/api/creator-profile/suggestions/[suggestionId]/route.ts:9` |
| GET | `/api/creator-profile/suggestions` | 设置与偏好 | 成员 / 服务配置 / 模型 / 存储 / 创作偏好 | CURRENT IMPLEMENTATION | `apps/web/app/api/creator-profile/suggestions/route.ts:7` |
| POST | `/api/creator-profile/suggestions` | 设置与偏好 | 成员 / 服务配置 / 模型 / 存储 / 创作偏好 | CURRENT IMPLEMENTATION | `apps/web/app/api/creator-profile/suggestions/route.ts:8` |
| GET | `/api/dev/runtime-health` | 基础能力与内部入口 | 基础设施状态；内部调用不设计普通用户按钮 | INTERNAL | `apps/web/app/api/dev/runtime-health/route.ts:7` |
| GET | `/api/discovery/benchmarks/[id]/collection-runs/[runId]` | 研究与对标 | 研究范围 / 会话 / 结果 / 对标记录 | CURRENT IMPLEMENTATION | `apps/web/app/api/discovery/benchmarks/[id]/collection-runs/[runId]/route.ts:5` |
| GET | `/api/discovery/benchmarks/[id]/collection-runs` | 研究与对标 | 研究范围 / 会话 / 结果 / 对标记录 | CURRENT IMPLEMENTATION | `apps/web/app/api/discovery/benchmarks/[id]/collection-runs/route.ts:7` |
| POST | `/api/discovery/benchmarks/[id]/collection-runs` | 研究与对标 | 研究范围 / 会话 / 结果 / 对标记录 | CURRENT IMPLEMENTATION | `apps/web/app/api/discovery/benchmarks/[id]/collection-runs/route.ts:14` |
| POST | `/api/discovery/benchmarks/[id]/comments/analyze` | 研究与对标 | 研究范围 / 会话 / 结果 / 对标记录 | CURRENT IMPLEMENTATION | `apps/web/app/api/discovery/benchmarks/[id]/comments/analyze/route.ts:6` |
| POST | `/api/discovery/benchmarks/[id]/comments/collect` | 研究与对标 | 研究范围 / 会话 / 结果 / 对标记录 | CURRENT IMPLEMENTATION | `apps/web/app/api/discovery/benchmarks/[id]/comments/collect/route.ts:7` |
| GET | `/api/discovery/benchmarks/[id]/inputs` | 研究与对标 | 研究范围 / 会话 / 结果 / 对标记录 | CURRENT IMPLEMENTATION | `apps/web/app/api/discovery/benchmarks/[id]/inputs/route.ts:12` |
| POST | `/api/discovery/benchmarks/[id]/inputs` | 研究与对标 | 研究范围 / 会话 / 结果 / 对标记录 | CURRENT IMPLEMENTATION | `apps/web/app/api/discovery/benchmarks/[id]/inputs/route.ts:16` |
| PATCH | `/api/discovery/benchmarks/[id]/method-suggestions/[suggestionId]` | 研究与对标 | 研究范围 / 会话 / 结果 / 对标记录 | CURRENT IMPLEMENTATION | `apps/web/app/api/discovery/benchmarks/[id]/method-suggestions/[suggestionId]/route.ts:10` |
| GET | `/api/discovery/benchmarks/[id]/method-suggestions` | 研究与对标 | 研究范围 / 会话 / 结果 / 对标记录 | CURRENT IMPLEMENTATION | `apps/web/app/api/discovery/benchmarks/[id]/method-suggestions/route.ts:9` |
| POST | `/api/discovery/benchmarks/[id]/method-suggestions` | 研究与对标 | 研究范围 / 会话 / 结果 / 对标记录 | CURRENT IMPLEMENTATION | `apps/web/app/api/discovery/benchmarks/[id]/method-suggestions/route.ts:14` |
| PATCH | `/api/discovery/benchmarks/[id]/organization` | 研究与对标 | 研究范围 / 会话 / 结果 / 对标记录 | CURRENT IMPLEMENTATION | `apps/web/app/api/discovery/benchmarks/[id]/organization/route.ts:6` |
| GET | `/api/discovery/benchmarks/[id]/report` | 研究与对标 | 研究范围 / 会话 / 结果 / 对标记录 | CURRENT IMPLEMENTATION | `apps/web/app/api/discovery/benchmarks/[id]/report/route.ts:6` |
| GET | `/api/discovery/benchmarks/[id]` | 研究与对标 | 研究范围 / 会话 / 结果 / 对标记录 | CURRENT IMPLEMENTATION | `apps/web/app/api/discovery/benchmarks/[id]/route.ts:6` |
| DELETE | `/api/discovery/benchmarks/[id]` | 研究与对标 | 研究范围 / 会话 / 结果 / 对标记录 | CURRENT IMPLEMENTATION | `apps/web/app/api/discovery/benchmarks/[id]/route.ts:22` |
| GET | `/api/discovery/benchmarks/[id]/studies` | 研究与对标 | 研究范围 / 会话 / 结果 / 对标记录 | CURRENT IMPLEMENTATION | `apps/web/app/api/discovery/benchmarks/[id]/studies/route.ts:20` |
| POST | `/api/discovery/benchmarks/[id]/studies` | 研究与对标 | 研究范围 / 会话 / 结果 / 对标记录 | CURRENT IMPLEMENTATION | `apps/web/app/api/discovery/benchmarks/[id]/studies/route.ts:31` |
| GET | `/api/discovery/benchmarks` | 研究与对标 | 研究范围 / 会话 / 结果 / 对标记录 | CURRENT IMPLEMENTATION | `apps/web/app/api/discovery/benchmarks/route.ts:8` |
| POST | `/api/discovery/benchmarks` | 研究与对标 | 研究范围 / 会话 / 结果 / 对标记录 | CURRENT IMPLEMENTATION | `apps/web/app/api/discovery/benchmarks/route.ts:14` |
| POST | `/api/discovery/collect` | 研究与对标 | 研究范围 / 会话 / 结果 / 对标记录 | CURRENT IMPLEMENTATION | `apps/web/app/api/discovery/collect/route.ts:7` |
| POST | `/api/discovery/ideas/[id]/references` | 研究与对标 | 研究范围 / 会话 / 结果 / 对标记录 | CURRENT IMPLEMENTATION | `apps/web/app/api/discovery/ideas/[id]/references/route.ts:7` |
| GET | `/api/discovery/ideas/[id]` | 研究与对标 | 研究范围 / 会话 / 结果 / 对标记录 | CURRENT IMPLEMENTATION | `apps/web/app/api/discovery/ideas/[id]/route.ts:7` |
| PATCH | `/api/discovery/ideas/[id]` | 研究与对标 | 研究范围 / 会话 / 结果 / 对标记录 | CURRENT IMPLEMENTATION | `apps/web/app/api/discovery/ideas/[id]/route.ts:15` |
| POST | `/api/discovery/ideas/[id]/start` | 研究与对标 | 研究范围 / 会话 / 结果 / 对标记录 | CURRENT IMPLEMENTATION | `apps/web/app/api/discovery/ideas/[id]/start/route.ts:7` |
| GET | `/api/discovery/ideas` | 研究与对标 | 研究范围 / 会话 / 结果 / 对标记录 | CURRENT IMPLEMENTATION | `apps/web/app/api/discovery/ideas/route.ts:7` |
| POST | `/api/discovery/ideas` | 研究与对标 | 研究范围 / 会话 / 结果 / 对标记录 | CURRENT IMPLEMENTATION | `apps/web/app/api/discovery/ideas/route.ts:13` |
| POST | `/api/discovery/projects` | 研究与对标 | 研究范围 / 会话 / 结果 / 对标记录 | CURRENT IMPLEMENTATION | `apps/web/app/api/discovery/projects/route.ts:7` |
| GET | `/api/discovery/recommendations/[id]` | 研究与对标 | 研究范围 / 会话 / 结果 / 对标记录 | CURRENT IMPLEMENTATION | `apps/web/app/api/discovery/recommendations/[id]/route.ts:7` |
| POST | `/api/discovery/recommendations/[id]` | 研究与对标 | 研究范围 / 会话 / 结果 / 对标记录 | CURRENT IMPLEMENTATION | `apps/web/app/api/discovery/recommendations/[id]/route.ts:16` |
| GET | `/api/discovery/recommendations` | 研究与对标 | 研究范围 / 会话 / 结果 / 对标记录 | CURRENT IMPLEMENTATION | `apps/web/app/api/discovery/recommendations/route.ts:6` |
| POST | `/api/discovery/recommendations` | 研究与对标 | 研究范围 / 会话 / 结果 / 对标记录 | CURRENT IMPLEMENTATION | `apps/web/app/api/discovery/recommendations/route.ts:13` |
| POST | `/api/discovery/search` | 研究与对标 | 研究范围 / 会话 / 结果 / 对标记录 | CURRENT IMPLEMENTATION | `apps/web/app/api/discovery/search/route.ts:13` |
| POST | `/api/discovery/trends/[key]/ideas` | 研究与对标 | 研究范围 / 会话 / 结果 / 对标记录 | CURRENT IMPLEMENTATION | `apps/web/app/api/discovery/trends/[key]/ideas/route.ts:8` |
| POST | `/api/discovery/trends/[key]/related` | 研究与对标 | 研究范围 / 会话 / 结果 / 对标记录 | CURRENT IMPLEMENTATION | `apps/web/app/api/discovery/trends/[key]/related/route.ts:8` |
| POST | `/api/discovery/trends/[key]/topics` | 研究与对标 | 研究范围 / 会话 / 结果 / 对标记录 | CURRENT IMPLEMENTATION | `apps/web/app/api/discovery/trends/[key]/topics/route.ts:8` |
| GET | `/api/discovery/trends` | 研究与对标 | 研究范围 / 会话 / 结果 / 对标记录 | CURRENT IMPLEMENTATION | `apps/web/app/api/discovery/trends/route.ts:8` |
| POST | `/api/discovery/trends` | 研究与对标 | 研究范围 / 会话 / 结果 / 对标记录 | CURRENT IMPLEMENTATION | `apps/web/app/api/discovery/trends/route.ts:19` |
| POST | `/api/experience/start` | 登录与账号 | 登录 / 邀请 / 验证 / 账号恢复 | CURRENT IMPLEMENTATION | `apps/web/app/api/experience/start/route.ts:3` |
| POST | `/api/feishu/browse` | 资料与知识 | 内容列表 / 资料详情 / 处理状态 / 知识确认 | CURRENT IMPLEMENTATION | `apps/web/app/api/feishu/browse/route.ts:6` |
| GET | `/api/feishu` | 资料与知识 | 内容列表 / 资料详情 / 处理状态 / 知识确认 | CURRENT IMPLEMENTATION | `apps/web/app/api/feishu/route.ts:11` |
| POST | `/api/feishu` | 资料与知识 | 内容列表 / 资料详情 / 处理状态 / 知识确认 | CURRENT IMPLEMENTATION | `apps/web/app/api/feishu/route.ts:31` |
| GET | `/api/health/live` | 基础能力与内部入口 | 基础设施状态；内部调用不设计普通用户按钮 | INTERNAL | `apps/web/app/api/health/live/route.ts:3` |
| HEAD | `/api/health/live` | 基础能力与内部入口 | 基础设施状态；内部调用不设计普通用户按钮 | INTERNAL | `apps/web/app/api/health/live/route.ts:6` |
| GET | `/api/health/ready` | 基础能力与内部入口 | 基础设施状态；内部调用不设计普通用户按钮 | INTERNAL | `apps/web/app/api/health/ready/route.ts:4` |
| HEAD | `/api/health/ready` | 基础能力与内部入口 | 基础设施状态；内部调用不设计普通用户按钮 | INTERNAL | `apps/web/app/api/health/ready/route.ts:8` |
| POST | `/api/ingest-jobs/[id]/cancel` | 资料与知识 | 内容列表 / 资料详情 / 处理状态 / 知识确认 | CURRENT IMPLEMENTATION | `apps/web/app/api/ingest-jobs/[id]/cancel/route.ts:5` |
| POST | `/api/ingest-jobs/[id]/retry` | 资料与知识 | 内容列表 / 资料详情 / 处理状态 / 知识确认 | CURRENT IMPLEMENTATION | `apps/web/app/api/ingest-jobs/[id]/retry/route.ts:8` |
| GET | `/api/ingest-jobs/[id]` | 资料与知识 | 内容列表 / 资料详情 / 处理状态 / 知识确认 | CURRENT IMPLEMENTATION | `apps/web/app/api/ingest-jobs/[id]/route.ts:18` |
| POST | `/api/integrations/[provider]/disable` | 设置与偏好 | 成员 / 服务配置 / 模型 / 存储 / 创作偏好 | CURRENT IMPLEMENTATION | `apps/web/app/api/integrations/[provider]/disable/route.ts:9` |
| POST | `/api/integrations/[provider]/enable` | 设置与偏好 | 成员 / 服务配置 / 模型 / 存储 / 创作偏好 | CURRENT IMPLEMENTATION | `apps/web/app/api/integrations/[provider]/enable/route.ts:9` |
| GET | `/api/integrations/[provider]` | 设置与偏好 | 成员 / 服务配置 / 模型 / 存储 / 创作偏好 | CURRENT IMPLEMENTATION | `apps/web/app/api/integrations/[provider]/route.ts:11` |
| PUT | `/api/integrations/[provider]` | 设置与偏好 | 成员 / 服务配置 / 模型 / 存储 / 创作偏好 | CURRENT IMPLEMENTATION | `apps/web/app/api/integrations/[provider]/route.ts:22` |
| DELETE | `/api/integrations/[provider]` | 设置与偏好 | 成员 / 服务配置 / 模型 / 存储 / 创作偏好 | CURRENT IMPLEMENTATION | `apps/web/app/api/integrations/[provider]/route.ts:46` |
| POST | `/api/integrations/[provider]/test` | 设置与偏好 | 成员 / 服务配置 / 模型 / 存储 / 创作偏好 | CURRENT IMPLEMENTATION | `apps/web/app/api/integrations/[provider]/test/route.ts:9` |
| GET | `/api/integrations/LLM/models` | 设置与偏好 | 成员 / 服务配置 / 模型 / 存储 / 创作偏好 | CURRENT IMPLEMENTATION | `apps/web/app/api/integrations/LLM/models/route.ts:5` |
| GET | `/api/integrations` | 设置与偏好 | 成员 / 服务配置 / 模型 / 存储 / 创作偏好 | CURRENT IMPLEMENTATION | `apps/web/app/api/integrations/route.ts:7` |
| GET | `/api/internal/media-storage/[assetId]` | 基础能力与内部入口 | 基础设施状态；内部调用不设计普通用户按钮 | INTERNAL | `apps/web/app/api/internal/media-storage/[assetId]/route.ts:124` |
| PUT | `/api/internal/media-storage/[assetId]` | 基础能力与内部入口 | 基础设施状态；内部调用不设计普通用户按钮 | INTERNAL | `apps/web/app/api/internal/media-storage/[assetId]/route.ts:175` |
| DELETE | `/api/internal/media-storage/[assetId]` | 基础能力与内部入口 | 基础设施状态；内部调用不设计普通用户按钮 | INTERNAL | `apps/web/app/api/internal/media-storage/[assetId]/route.ts:176` |
| POST | `/api/internal-signup` | 登录与账号 | 登录 / 邀请 / 验证 / 账号恢复 | CURRENT IMPLEMENTATION | `apps/web/app/api/internal-signup/route.ts:3` |
| POST | `/api/local-asr/models/initialize` | 设置与偏好 | 成员 / 服务配置 / 模型 / 存储 / 创作偏好 | CURRENT IMPLEMENTATION | `apps/web/app/api/local-asr/models/initialize/route.ts:7` |
| GET | `/api/local-asr/status` | 设置与偏好 | 成员 / 服务配置 / 模型 / 存储 / 创作偏好 | CURRENT IMPLEMENTATION | `apps/web/app/api/local-asr/status/route.ts:5` |
| GET | `/api/media/[token]` | 基础能力与内部入口 | 基础设施状态；内部调用不设计普通用户按钮 | INTERNAL | `apps/web/app/api/media/[token]/route.ts:17` |
| GET | `/api/methods/[id]` | 技能与方法 | 可选技能 / 技能版本 / 导入与维护 | CURRENT IMPLEMENTATION | `apps/web/app/api/methods/[id]/route.ts:12` |
| PUT | `/api/methods/[id]` | 技能与方法 | 可选技能 / 技能版本 / 导入与维护 | CURRENT IMPLEMENTATION | `apps/web/app/api/methods/[id]/route.ts:21` |
| PATCH | `/api/methods/[id]` | 技能与方法 | 可选技能 / 技能版本 / 导入与维护 | CURRENT IMPLEMENTATION | `apps/web/app/api/methods/[id]/route.ts:35` |
| DELETE | `/api/methods/[id]` | 技能与方法 | 可选技能 / 技能版本 / 导入与维护 | CURRENT IMPLEMENTATION | `apps/web/app/api/methods/[id]/route.ts:49` |
| GET | `/api/methods/default` | 技能与方法 | 可选技能 / 技能版本 / 导入与维护 | LEGACY COMPATIBILITY | `apps/web/app/api/methods/default/route.ts:24` |
| POST | `/api/methods/default` | 技能与方法 | 可选技能 / 技能版本 / 导入与维护 | LEGACY COMPATIBILITY | `apps/web/app/api/methods/default/route.ts:30` |
| PUT | `/api/methods/default` | 技能与方法 | 可选技能 / 技能版本 / 导入与维护 | LEGACY COMPATIBILITY | `apps/web/app/api/methods/default/route.ts:45` |
| PATCH | `/api/methods/default` | 技能与方法 | 可选技能 / 技能版本 / 导入与维护 | LEGACY COMPATIBILITY | `apps/web/app/api/methods/default/route.ts:55` |
| POST | `/api/methods/import` | 技能与方法 | 可选技能 / 技能版本 / 导入与维护 | CURRENT IMPLEMENTATION | `apps/web/app/api/methods/import/route.ts:15` |
| GET | `/api/methods` | 技能与方法 | 可选技能 / 技能版本 / 导入与维护 | CURRENT IMPLEMENTATION | `apps/web/app/api/methods/route.ts:11` |
| POST | `/api/methods` | 技能与方法 | 可选技能 / 技能版本 / 导入与维护 | CURRENT IMPLEMENTATION | `apps/web/app/api/methods/route.ts:23` |
| POST | `/api/projects/[id]/ai/run` | 项目与成果 | 项目工作区 / 引用 / 成果 / 历史操作 | CURRENT IMPLEMENTATION | `apps/web/app/api/projects/[id]/ai/run/route.ts:15` |
| POST | `/api/projects/[id]/ai/runs/[runId]/apply` | 项目与成果 | 项目工作区 / 引用 / 成果 / 历史操作 | CURRENT IMPLEMENTATION | `apps/web/app/api/projects/[id]/ai/runs/[runId]/apply/route.ts:10` |
| POST | `/api/projects/[id]/ai/runs/[runId]/discard` | 项目与成果 | 项目工作区 / 引用 / 成果 / 历史操作 | CURRENT IMPLEMENTATION | `apps/web/app/api/projects/[id]/ai/runs/[runId]/discard/route.ts:6` |
| GET | `/api/projects/[id]/artifacts/[artifactId]/history` | 项目与成果 | 项目工作区 / 引用 / 成果 / 历史操作 | CURRENT IMPLEMENTATION | `apps/web/app/api/projects/[id]/artifacts/[artifactId]/history/route.ts:6` |
| POST | `/api/projects/[id]/artifacts/[artifactId]/history` | 项目与成果 | 项目工作区 / 引用 / 成果 / 历史操作 | CURRENT IMPLEMENTATION | `apps/web/app/api/projects/[id]/artifacts/[artifactId]/history/route.ts:14` |
| POST | `/api/projects/[id]/artifacts/[artifactId]/revisions` | 项目与成果 | 项目工作区 / 引用 / 成果 / 历史操作 | CURRENT IMPLEMENTATION | `apps/web/app/api/projects/[id]/artifacts/[artifactId]/revisions/route.ts:9` |
| PATCH | `/api/projects/[id]/artifacts/[artifactId]` | 项目与成果 | 项目工作区 / 引用 / 成果 / 历史操作 | CURRENT IMPLEMENTATION | `apps/web/app/api/projects/[id]/artifacts/[artifactId]/route.ts:8` |
| GET | `/api/projects/[id]/artifacts/[artifactId]` | 项目与成果 | 项目工作区 / 引用 / 成果 / 历史操作 | CURRENT IMPLEMENTATION | `apps/web/app/api/projects/[id]/artifacts/[artifactId]/route.ts:17` |
| PUT | `/api/projects/[id]/artifacts/[artifactId]` | 项目与成果 | 项目工作区 / 引用 / 成果 / 历史操作 | CURRENT IMPLEMENTATION | `apps/web/app/api/projects/[id]/artifacts/[artifactId]/route.ts:26` |
| GET | `/api/projects/[id]/artifacts` | 项目与成果 | 项目工作区 / 引用 / 成果 / 历史操作 | CURRENT IMPLEMENTATION | `apps/web/app/api/projects/[id]/artifacts/route.ts:9` |
| POST | `/api/projects/[id]/artifacts` | 项目与成果 | 项目工作区 / 引用 / 成果 / 历史操作 | CURRENT IMPLEMENTATION | `apps/web/app/api/projects/[id]/artifacts/route.ts:17` |
| POST | `/api/projects/[id]/assistant/messages/[messageId]/save` | 项目与成果 | 项目工作区 / 引用 / 成果 / 历史操作 | CURRENT IMPLEMENTATION | `apps/web/app/api/projects/[id]/assistant/messages/[messageId]/save/route.ts:9` |
| GET | `/api/projects/[id]/assistant/models` | 项目与成果 | 项目工作区 / 引用 / 成果 / 历史操作 | CURRENT IMPLEMENTATION | `apps/web/app/api/projects/[id]/assistant/models/route.ts:6` |
| GET | `/api/projects/[id]/assistant/references` | 项目与成果 | 项目工作区 / 引用 / 成果 / 历史操作 | CURRENT IMPLEMENTATION | `apps/web/app/api/projects/[id]/assistant/references/route.ts:5` |
| PATCH | `/api/projects/[id]/assistant` | 项目与成果 | 项目工作区 / 引用 / 成果 / 历史操作 | CURRENT IMPLEMENTATION | `apps/web/app/api/projects/[id]/assistant/route.ts:27` |
| GET | `/api/projects/[id]/assistant` | 项目与成果 | 项目工作区 / 引用 / 成果 / 历史操作 | CURRENT IMPLEMENTATION | `apps/web/app/api/projects/[id]/assistant/route.ts:40` |
| POST | `/api/projects/[id]/assistant` | 项目与成果 | 项目工作区 / 引用 / 成果 / 历史操作 | CURRENT IMPLEMENTATION | `apps/web/app/api/projects/[id]/assistant/route.ts:50` |
| PUT | `/api/projects/[id]/brief` | 项目与成果 | 项目工作区 / 引用 / 成果 / 历史操作 | CURRENT IMPLEMENTATION | `apps/web/app/api/projects/[id]/brief/route.ts:21` |
| GET | `/api/projects/[id]/canvas/objects/[objectId]/assistant` | 项目与成果 | 项目工作区 / 引用 / 成果 / 历史操作 | LEGACY COMPATIBILITY | `apps/web/app/api/projects/[id]/canvas/objects/[objectId]/assistant/route.ts:9` |
| POST | `/api/projects/[id]/canvas/objects/[objectId]/assistant` | 项目与成果 | 项目工作区 / 引用 / 成果 / 历史操作 | LEGACY COMPATIBILITY | `apps/web/app/api/projects/[id]/canvas/objects/[objectId]/assistant/route.ts:16` |
| POST | `/api/projects/[id]/canvas/objects/[objectId]/restore` | 项目与成果 | 项目工作区 / 引用 / 成果 / 历史操作 | LEGACY COMPATIBILITY | `apps/web/app/api/projects/[id]/canvas/objects/[objectId]/restore/route.ts:9` |
| PATCH | `/api/projects/[id]/canvas/objects/[objectId]` | 项目与成果 | 项目工作区 / 引用 / 成果 / 历史操作 | LEGACY COMPATIBILITY | `apps/web/app/api/projects/[id]/canvas/objects/[objectId]/route.ts:14` |
| DELETE | `/api/projects/[id]/canvas/objects/[objectId]` | 项目与成果 | 项目工作区 / 引用 / 成果 / 历史操作 | LEGACY COMPATIBILITY | `apps/web/app/api/projects/[id]/canvas/objects/[objectId]/route.ts:30` |
| GET | `/api/projects/[id]/canvas/objects` | 项目与成果 | 项目工作区 / 引用 / 成果 / 历史操作 | LEGACY COMPATIBILITY | `apps/web/app/api/projects/[id]/canvas/objects/route.ts:23` |
| POST | `/api/projects/[id]/canvas/objects` | 项目与成果 | 项目工作区 / 引用 / 成果 / 历史操作 | LEGACY COMPATIBILITY | `apps/web/app/api/projects/[id]/canvas/objects/route.ts:33` |
| POST | `/api/projects/[id]/creative-basis` | 项目与成果 | 项目工作区 / 引用 / 成果 / 历史操作 | CURRENT IMPLEMENTATION | `apps/web/app/api/projects/[id]/creative-basis/route.ts:8` |
| POST | `/api/projects/[id]/deep-content-package/apply` | 项目与成果 | 项目工作区 / 引用 / 成果 / 历史操作 | LEGACY COMPATIBILITY | `apps/web/app/api/projects/[id]/deep-content-package/apply/route.ts:9` |
| POST | `/api/projects/[id]/deep-content-package/generate` | 项目与成果 | 项目工作区 / 引用 / 成果 / 历史操作 | LEGACY COMPATIBILITY | `apps/web/app/api/projects/[id]/deep-content-package/generate/route.ts:6` |
| GET | `/api/projects/[id]/deep-content-package` | 项目与成果 | 项目工作区 / 引用 / 成果 / 历史操作 | LEGACY COMPATIBILITY | `apps/web/app/api/projects/[id]/deep-content-package/route.ts:18` |
| PUT | `/api/projects/[id]/deep-content-package` | 项目与成果 | 项目工作区 / 引用 / 成果 / 历史操作 | LEGACY COMPATIBILITY | `apps/web/app/api/projects/[id]/deep-content-package/route.ts:26` |
| POST | `/api/projects/[id]/drafts/[draftId]/checkpoint` | 项目与成果 | 项目工作区 / 引用 / 成果 / 历史操作 | CURRENT IMPLEMENTATION | `apps/web/app/api/projects/[id]/drafts/[draftId]/checkpoint/route.ts:9` |
| POST | `/api/projects/[id]/drafts/[draftId]/confirm` | 项目与成果 | 项目工作区 / 引用 / 成果 / 历史操作 | CURRENT IMPLEMENTATION | `apps/web/app/api/projects/[id]/drafts/[draftId]/confirm/route.ts:10` |
| GET | `/api/projects/[id]/drafts/[draftId]/history` | 项目与成果 | 项目工作区 / 引用 / 成果 / 历史操作 | CURRENT IMPLEMENTATION | `apps/web/app/api/projects/[id]/drafts/[draftId]/history/route.ts:6` |
| POST | `/api/projects/[id]/drafts/[draftId]/primary` | 项目与成果 | 项目工作区 / 引用 / 成果 / 历史操作 | CURRENT IMPLEMENTATION | `apps/web/app/api/projects/[id]/drafts/[draftId]/primary/route.ts:9` |
| GET | `/api/projects/[id]/drafts/[draftId]` | 项目与成果 | 项目工作区 / 引用 / 成果 / 历史操作 | CURRENT IMPLEMENTATION | `apps/web/app/api/projects/[id]/drafts/[draftId]/route.ts:12` |
| PUT | `/api/projects/[id]/drafts/[draftId]` | 项目与成果 | 项目工作区 / 引用 / 成果 / 历史操作 | CURRENT IMPLEMENTATION | `apps/web/app/api/projects/[id]/drafts/[draftId]/route.ts:20` |
| PATCH | `/api/projects/[id]/drafts/[draftId]` | 项目与成果 | 项目工作区 / 引用 / 成果 / 历史操作 | CURRENT IMPLEMENTATION | `apps/web/app/api/projects/[id]/drafts/[draftId]/route.ts:31` |
| DELETE | `/api/projects/[id]/drafts/[draftId]` | 项目与成果 | 项目工作区 / 引用 / 成果 / 历史操作 | CURRENT IMPLEMENTATION | `apps/web/app/api/projects/[id]/drafts/[draftId]/route.ts:42` |
| GET | `/api/projects/[id]/drafts` | 项目与成果 | 项目工作区 / 引用 / 成果 / 历史操作 | CURRENT IMPLEMENTATION | `apps/web/app/api/projects/[id]/drafts/route.ts:10` |
| POST | `/api/projects/[id]/drafts` | 项目与成果 | 项目工作区 / 引用 / 成果 / 历史操作 | CURRENT IMPLEMENTATION | `apps/web/app/api/projects/[id]/drafts/route.ts:18` |
| PATCH | `/api/projects/[id]/evidence/[evidenceId]` | 项目与成果 | 项目工作区 / 引用 / 成果 / 历史操作 | CURRENT IMPLEMENTATION | `apps/web/app/api/projects/[id]/evidence/[evidenceId]/route.ts:21` |
| DELETE | `/api/projects/[id]/evidence/[evidenceId]` | 项目与成果 | 项目工作区 / 引用 / 成果 / 历史操作 | CURRENT IMPLEMENTATION | `apps/web/app/api/projects/[id]/evidence/[evidenceId]/route.ts:40` |
| POST | `/api/projects/[id]/evidence` | 项目与成果 | 项目工作区 / 引用 / 成果 / 历史操作 | CURRENT IMPLEMENTATION | `apps/web/app/api/projects/[id]/evidence/route.ts:16` |
| GET | `/api/projects/[id]/feedback` | 项目与成果 | 项目工作区 / 引用 / 成果 / 历史操作 | CURRENT IMPLEMENTATION | `apps/web/app/api/projects/[id]/feedback/route.ts:11` |
| PUT | `/api/projects/[id]/feedback` | 项目与成果 | 项目工作区 / 引用 / 成果 / 历史操作 | CURRENT IMPLEMENTATION | `apps/web/app/api/projects/[id]/feedback/route.ts:22` |
| POST | `/api/projects/[id]/gpt-task-package/copied` | 项目与成果 | 项目工作区 / 引用 / 成果 / 历史操作 | LEGACY COMPATIBILITY | `apps/web/app/api/projects/[id]/gpt-task-package/copied/route.ts:9` |
| GET | `/api/projects/[id]/gpt-task-package` | 项目与成果 | 项目工作区 / 引用 / 成果 / 历史操作 | LEGACY COMPATIBILITY | `apps/web/app/api/projects/[id]/gpt-task-package/route.ts:9` |
| POST | `/api/projects/[id]/import-gpt-draft` | 项目与成果 | 项目工作区 / 引用 / 成果 / 历史操作 | CURRENT IMPLEMENTATION | `apps/web/app/api/projects/[id]/import-gpt-draft/route.ts:9` |
| GET | `/api/projects/[id]/methods` | 项目与成果 | 项目工作区 / 引用 / 成果 / 历史操作 | CURRENT IMPLEMENTATION | `apps/web/app/api/projects/[id]/methods/route.ts:11` |
| PUT | `/api/projects/[id]/methods` | 项目与成果 | 项目工作区 / 引用 / 成果 / 历史操作 | CURRENT IMPLEMENTATION | `apps/web/app/api/projects/[id]/methods/route.ts:22` |
| POST | `/api/projects/[id]/mother-content/confirm` | 项目与成果 | 项目工作区 / 引用 / 成果 / 历史操作 | LEGACY COMPATIBILITY | `apps/web/app/api/projects/[id]/mother-content/confirm/route.ts:10` |
| PUT | `/api/projects/[id]/mother-content/confirmation` | 项目与成果 | 项目工作区 / 引用 / 成果 / 历史操作 | LEGACY COMPATIBILITY | `apps/web/app/api/projects/[id]/mother-content/confirmation/route.ts:8` |
| GET | `/api/projects/[id]/mother-content` | 项目与成果 | 项目工作区 / 引用 / 成果 / 历史操作 | LEGACY COMPATIBILITY | `apps/web/app/api/projects/[id]/mother-content/route.ts:14` |
| PUT | `/api/projects/[id]/mother-content` | 项目与成果 | 项目工作区 / 引用 / 成果 / 历史操作 | LEGACY COMPATIBILITY | `apps/web/app/api/projects/[id]/mother-content/route.ts:22` |
| POST | `/api/projects/[id]/mother-content/warnings` | 项目与成果 | 项目工作区 / 引用 / 成果 / 历史操作 | LEGACY COMPATIBILITY | `apps/web/app/api/projects/[id]/mother-content/warnings/route.ts:8` |
| POST | `/api/projects/[id]/platform-variants/[platform]/apply` | 项目与成果 | 项目工作区 / 引用 / 成果 / 历史操作 | LEGACY COMPATIBILITY | `apps/web/app/api/projects/[id]/platform-variants/[platform]/apply/route.ts:10` |
| POST | `/api/projects/[id]/platform-variants/[platform]/review/ai` | 项目与成果 | 项目工作区 / 引用 / 成果 / 历史操作 | LEGACY COMPATIBILITY | `apps/web/app/api/projects/[id]/platform-variants/[platform]/review/ai/route.ts:8` |
| POST | `/api/projects/[id]/platform-variants/[platform]/review/approve` | 项目与成果 | 项目工作区 / 引用 / 成果 / 历史操作 | LEGACY COMPATIBILITY | `apps/web/app/api/projects/[id]/platform-variants/[platform]/review/approve/route.ts:10` |
| POST | `/api/projects/[id]/platform-variants/[platform]/review/reject` | 项目与成果 | 项目工作区 / 引用 / 成果 / 历史操作 | LEGACY COMPATIBILITY | `apps/web/app/api/projects/[id]/platform-variants/[platform]/review/reject/route.ts:10` |
| POST | `/api/projects/[id]/platform-variants/[platform]/review/request-changes` | 项目与成果 | 项目工作区 / 引用 / 成果 / 历史操作 | LEGACY COMPATIBILITY | `apps/web/app/api/projects/[id]/platform-variants/[platform]/review/request-changes/route.ts:10` |
| POST | `/api/projects/[id]/platform-variants/[platform]/review/submit` | 项目与成果 | 项目工作区 / 引用 / 成果 / 历史操作 | LEGACY COMPATIBILITY | `apps/web/app/api/projects/[id]/platform-variants/[platform]/review/submit/route.ts:10` |
| GET | `/api/projects/[id]/platform-variants/[platform]/reviews` | 项目与成果 | 项目工作区 / 引用 / 成果 / 历史操作 | LEGACY COMPATIBILITY | `apps/web/app/api/projects/[id]/platform-variants/[platform]/reviews/route.ts:8` |
| GET | `/api/projects/[id]/platform-variants/[platform]` | 项目与成果 | 项目工作区 / 引用 / 成果 / 历史操作 | LEGACY COMPATIBILITY | `apps/web/app/api/projects/[id]/platform-variants/[platform]/route.ts:12` |
| PUT | `/api/projects/[id]/platform-variants/[platform]` | 项目与成果 | 项目工作区 / 引用 / 成果 / 历史操作 | LEGACY COMPATIBILITY | `apps/web/app/api/projects/[id]/platform-variants/[platform]/route.ts:22` |
| POST | `/api/projects/[id]/platform-variants/generate` | 项目与成果 | 项目工作区 / 引用 / 成果 / 历史操作 | LEGACY COMPATIBILITY | `apps/web/app/api/projects/[id]/platform-variants/generate/route.ts:11` |
| GET | `/api/projects/[id]/platform-variants` | 项目与成果 | 项目工作区 / 引用 / 成果 / 历史操作 | LEGACY COMPATIBILITY | `apps/web/app/api/projects/[id]/platform-variants/route.ts:6` |
| POST | `/api/projects/[id]/restore` | 项目与成果 | 项目工作区 / 引用 / 成果 / 历史操作 | CURRENT IMPLEMENTATION | `apps/web/app/api/projects/[id]/restore/route.ts:6` |
| GET | `/api/projects/[id]` | 项目与成果 | 项目工作区 / 引用 / 成果 / 历史操作 | CURRENT IMPLEMENTATION | `apps/web/app/api/projects/[id]/route.ts:15` |
| PATCH | `/api/projects/[id]` | 项目与成果 | 项目工作区 / 引用 / 成果 / 历史操作 | CURRENT IMPLEMENTATION | `apps/web/app/api/projects/[id]/route.ts:24` |
| DELETE | `/api/projects/[id]` | 项目与成果 | 项目工作区 / 引用 / 成果 / 历史操作 | CURRENT IMPLEMENTATION | `apps/web/app/api/projects/[id]/route.ts:39` |
| DELETE | `/api/projects/[id]/sources/[sourceId]` | 项目与成果 | 项目工作区 / 引用 / 成果 / 历史操作 | CURRENT IMPLEMENTATION | `apps/web/app/api/projects/[id]/sources/[sourceId]/route.ts:6` |
| POST | `/api/projects/[id]/sources` | 项目与成果 | 项目工作区 / 引用 / 成果 / 历史操作 | CURRENT IMPLEMENTATION | `apps/web/app/api/projects/[id]/sources/route.ts:12` |
| POST | `/api/projects/[id]/transition` | 项目与成果 | 项目工作区 / 引用 / 成果 / 历史操作 | CURRENT IMPLEMENTATION | `apps/web/app/api/projects/[id]/transition/route.ts:10` |
| GET | `/api/projects` | 首页与项目组织 | 项目创建 / 最近工作 / 收藏 / 文件夹 | CURRENT IMPLEMENTATION | `apps/web/app/api/projects/route.ts:22` |
| POST | `/api/projects` | 首页与项目组织 | 项目创建 / 最近工作 / 收藏 / 文件夹 | CURRENT IMPLEMENTATION | `apps/web/app/api/projects/route.ts:29` |
| POST | `/api/publish-tasks/[id]/cancel` | 运营与发布 | 运营统计 / 日度录入 / 内容阶段 / 发布任务 | CURRENT IMPLEMENTATION | `apps/web/app/api/publish-tasks/[id]/cancel/route.ts:7` |
| POST | `/api/publish-tasks/[id]/failed` | 运营与发布 | 运营统计 / 日度录入 / 内容阶段 / 发布任务 | CURRENT IMPLEMENTATION | `apps/web/app/api/publish-tasks/[id]/failed/route.ts:7` |
| POST | `/api/publish-tasks/[id]/package/copied` | 运营与发布 | 运营统计 / 日度录入 / 内容阶段 / 发布任务 | CURRENT IMPLEMENTATION | `apps/web/app/api/publish-tasks/[id]/package/copied/route.ts:6` |
| GET | `/api/publish-tasks/[id]/package` | 运营与发布 | 运营统计 / 日度录入 / 内容阶段 / 发布任务 | CURRENT IMPLEMENTATION | `apps/web/app/api/publish-tasks/[id]/package/route.ts:6` |
| POST | `/api/publish-tasks/[id]/published` | 运营与发布 | 运营统计 / 日度录入 / 内容阶段 / 发布任务 | CURRENT IMPLEMENTATION | `apps/web/app/api/publish-tasks/[id]/published/route.ts:7` |
| GET | `/api/publish-tasks/[id]` | 运营与发布 | 运营统计 / 日度录入 / 内容阶段 / 发布任务 | CURRENT IMPLEMENTATION | `apps/web/app/api/publish-tasks/[id]/route.ts:9` |
| PATCH | `/api/publish-tasks/[id]` | 运营与发布 | 运营统计 / 日度录入 / 内容阶段 / 发布任务 | CURRENT IMPLEMENTATION | `apps/web/app/api/publish-tasks/[id]/route.ts:16` |
| POST | `/api/publish-tasks/[id]/schedule` | 运营与发布 | 运营统计 / 日度录入 / 内容阶段 / 发布任务 | CURRENT IMPLEMENTATION | `apps/web/app/api/publish-tasks/[id]/schedule/route.ts:7` |
| GET | `/api/publish-tasks` | 运营与发布 | 运营统计 / 日度录入 / 内容阶段 / 发布任务 | CURRENT IMPLEMENTATION | `apps/web/app/api/publish-tasks/route.ts:17` |
| POST | `/api/publish-tasks` | 运营与发布 | 运营统计 / 日度录入 / 内容阶段 / 发布任务 | CURRENT IMPLEMENTATION | `apps/web/app/api/publish-tasks/route.ts:27` |
| POST | `/api/research/benchmarks/[id]/research` | 研究与对标 | 研究范围 / 会话 / 结果 / 对标记录 | CURRENT IMPLEMENTATION | `apps/web/app/api/research/benchmarks/[id]/research/route.ts:7` |
| POST | `/api/research/benchmarks/[id]/research-v2` | 研究与对标 | 研究范围 / 会话 / 结果 / 对标记录 | CURRENT IMPLEMENTATION | `apps/web/app/api/research/benchmarks/[id]/research-v2/route.ts:7` |
| POST | `/api/research/benchmarks/[id]/sync` | 研究与对标 | 研究范围 / 会话 / 结果 / 对标记录 | CURRENT IMPLEMENTATION | `apps/web/app/api/research/benchmarks/[id]/sync/route.ts:6` |
| GET | `/api/research/benchmarks/[id]/works/[workId]/analysis/[runId]/export` | 研究与对标 | 研究范围 / 会话 / 结果 / 对标记录 | CURRENT IMPLEMENTATION | `apps/web/app/api/research/benchmarks/[id]/works/[workId]/analysis/[runId]/export/route.ts:5` |
| POST | `/api/research/benchmarks/[id]/works/[workId]/analysis/[runId]/prepare-creation` | 研究与对标 | 研究范围 / 会话 / 结果 / 对标记录 | CURRENT IMPLEMENTATION | `apps/web/app/api/research/benchmarks/[id]/works/[workId]/analysis/[runId]/prepare-creation/route.ts:7` |
| POST | `/api/research/benchmarks/[id]/works/[workId]/analysis` | 研究与对标 | 研究范围 / 会话 / 结果 / 对标记录 | CURRENT IMPLEMENTATION | `apps/web/app/api/research/benchmarks/[id]/works/[workId]/analysis/route.ts:7` |
| POST | `/api/research/benchmarks/[id]/works/[workId]/collect` | 研究与对标 | 研究范围 / 会话 / 结果 / 对标记录 | CURRENT IMPLEMENTATION | `apps/web/app/api/research/benchmarks/[id]/works/[workId]/collect/route.ts:6` |
| GET | `/api/research/benchmarks/[id]/works/[workId]/media` | 研究与对标 | 研究范围 / 会话 / 结果 / 对标记录 | CURRENT IMPLEMENTATION | `apps/web/app/api/research/benchmarks/[id]/works/[workId]/media/route.ts:10` |
| GET | `/api/research/benchmarks/[id]/works/[workId]` | 研究与对标 | 研究范围 / 会话 / 结果 / 对标记录 | CURRENT IMPLEMENTATION | `apps/web/app/api/research/benchmarks/[id]/works/[workId]/route.ts:4` |
| POST | `/api/research/benchmarks/import` | 研究与对标 | 研究范围 / 会话 / 结果 / 对标记录 | CURRENT IMPLEMENTATION | `apps/web/app/api/research/benchmarks/import/route.ts:5` |
| GET | `/api/research/creation` | 研究与对标 | 研究范围 / 会话 / 结果 / 对标记录 | CURRENT IMPLEMENTATION | `apps/web/app/api/research/creation/route.ts:10` |
| POST | `/api/research/creation` | 研究与对标 | 研究范围 / 会话 / 结果 / 对标记录 | CURRENT IMPLEMENTATION | `apps/web/app/api/research/creation/route.ts:19` |
| POST | `/api/research/focus-v2` | 研究与对标 | 研究范围 / 会话 / 结果 / 对标记录 | CURRENT IMPLEMENTATION | `apps/web/app/api/research/focus-v2/route.ts:7` |
| GET | `/api/research/materials` | 研究与对标 | 研究范围 / 会话 / 结果 / 对标记录 | CURRENT IMPLEMENTATION | `apps/web/app/api/research/materials/route.ts:3` |
| GET | `/api/research/news` | 研究与对标 | 研究范围 / 会话 / 结果 / 对标记录 | CURRENT IMPLEMENTATION | `apps/web/app/api/research/news/route.ts:7` |
| POST | `/api/research/news` | 研究与对标 | 研究范围 / 会话 / 结果 / 对标记录 | CURRENT IMPLEMENTATION | `apps/web/app/api/research/news/route.ts:10` |
| POST | `/api/research/preferences` | 研究与对标 | 研究范围 / 会话 / 结果 / 对标记录 | CURRENT IMPLEMENTATION | `apps/web/app/api/research/preferences/route.ts:3` |
| GET | `/api/research/results/[runId]/share` | 研究与对标 | 研究范围 / 会话 / 结果 / 对标记录 | CURRENT IMPLEMENTATION | `apps/web/app/api/research/results/[runId]/share/route.ts:7` |
| POST | `/api/research/results/[runId]/share` | 研究与对标 | 研究范围 / 会话 / 结果 / 对标记录 | CURRENT IMPLEMENTATION | `apps/web/app/api/research/results/[runId]/share/route.ts:14` |
| POST | `/api/research/results/study/[studyId]/share` | 研究与对标 | 研究范围 / 会话 / 结果 / 对标记录 | CURRENT IMPLEMENTATION | `apps/web/app/api/research/results/study/[studyId]/share/route.ts:6` |
| GET | `/api/research/sessions/[id]` | 研究与对标 | 研究范围 / 会话 / 结果 / 对标记录 | CURRENT IMPLEMENTATION | `apps/web/app/api/research/sessions/[id]/route.ts:3` |
| GET | `/api/research/sessions/[id]/runs/[runId]` | 研究与对标 | 研究范围 / 会话 / 结果 / 对标记录 | CURRENT IMPLEMENTATION | `apps/web/app/api/research/sessions/[id]/runs/[runId]/route.ts:4` |
| POST | `/api/research/sessions/[id]/runs/[runId]` | 研究与对标 | 研究范围 / 会话 / 结果 / 对标记录 | CURRENT IMPLEMENTATION | `apps/web/app/api/research/sessions/[id]/runs/[runId]/route.ts:5` |
| POST | `/api/research/sessions/[id]/runs` | 研究与对标 | 研究范围 / 会话 / 结果 / 对标记录 | CURRENT IMPLEMENTATION | `apps/web/app/api/research/sessions/[id]/runs/route.ts:5` |
| GET | `/api/research/sessions` | 研究与对标 | 研究范围 / 会话 / 结果 / 对标记录 | CURRENT IMPLEMENTATION | `apps/web/app/api/research/sessions/route.ts:3` |
| POST | `/api/research/sessions` | 研究与对标 | 研究范围 / 会话 / 结果 / 对标记录 | CURRENT IMPLEMENTATION | `apps/web/app/api/research/sessions/route.ts:4` |
| POST | `/api/research/sources/[id]/clippings` | 研究与对标 | 研究范围 / 会话 / 结果 / 对标记录 | CURRENT IMPLEMENTATION | `apps/web/app/api/research/sources/[id]/clippings/route.ts:3` |
| POST | `/api/research/sources/[id]/topic` | 研究与对标 | 研究范围 / 会话 / 结果 / 对标记录 | CURRENT IMPLEMENTATION | `apps/web/app/api/research/sources/[id]/topic/route.ts:7` |
| GET | `/api/research/teardown/[runId]/export` | 视频拆解 | 拆解任务 / 报告 / 依据 | CURRENT IMPLEMENTATION | `apps/web/app/api/research/teardown/[runId]/export/route.ts:3` |
| DELETE | `/api/research/teardown/[runId]/history` | 视频拆解 | 拆解任务 / 报告 / 依据 | CURRENT IMPLEMENTATION | `apps/web/app/api/research/teardown/[runId]/history/route.ts:4` |
| GET | `/api/research/teardown/[runId]` | 视频拆解 | 拆解任务 / 报告 / 依据 | CURRENT IMPLEMENTATION | `apps/web/app/api/research/teardown/[runId]/route.ts:3` |
| DELETE | `/api/research/teardown/[runId]` | 视频拆解 | 拆解任务 / 报告 / 依据 | CURRENT IMPLEMENTATION | `apps/web/app/api/research/teardown/[runId]/route.ts:7` |
| POST | `/api/research/teardown/[runId]` | 视频拆解 | 拆解任务 / 报告 / 依据 | CURRENT IMPLEMENTATION | `apps/web/app/api/research/teardown/[runId]/route.ts:11` |
| GET | `/api/research/teardown` | 视频拆解 | 拆解任务 / 报告 / 依据 | CURRENT IMPLEMENTATION | `apps/web/app/api/research/teardown/route.ts:3` |
| POST | `/api/research/teardown` | 视频拆解 | 拆解任务 / 报告 / 依据 | CURRENT IMPLEMENTATION | `apps/web/app/api/research/teardown/route.ts:7` |
| POST | `/api/research/trends/[stableKey]/opportunity-v2` | 研究与对标 | 研究范围 / 会话 / 结果 / 对标记录 | CURRENT IMPLEMENTATION | `apps/web/app/api/research/trends/[stableKey]/opportunity-v2/route.ts:7` |
| POST | `/api/research/trends/[stableKey]/related` | 研究与对标 | 研究范围 / 会话 / 结果 / 对标记录 | CURRENT IMPLEMENTATION | `apps/web/app/api/research/trends/[stableKey]/related/route.ts:9` |
| GET | `/api/search` | 首页与项目组织 | 全局搜索 / 项目与资料结果 | INTERNAL | `apps/web/app/api/search/route.ts:5` |
| GET | `/api/settings/diagnostics` | 设置与偏好 | 成员 / 服务配置 / 模型 / 存储 / 创作偏好 | CURRENT IMPLEMENTATION | `apps/web/app/api/settings/diagnostics/route.ts:3` |
| GET | `/api/settings/invitations` | 设置与偏好 | 成员 / 服务配置 / 模型 / 存储 / 创作偏好 | CURRENT IMPLEMENTATION | `apps/web/app/api/settings/invitations/route.ts:6` |
| POST | `/api/settings/invitations` | 设置与偏好 | 成员 / 服务配置 / 模型 / 存储 / 创作偏好 | CURRENT IMPLEMENTATION | `apps/web/app/api/settings/invitations/route.ts:11` |
| DELETE | `/api/settings/invitations` | 设置与偏好 | 成员 / 服务配置 / 模型 / 存储 / 创作偏好 | CURRENT IMPLEMENTATION | `apps/web/app/api/settings/invitations/route.ts:17` |
| PATCH | `/api/settings/members/[id]` | 设置与偏好 | 成员 / 服务配置 / 模型 / 存储 / 创作偏好 | CURRENT IMPLEMENTATION | `apps/web/app/api/settings/members/[id]/route.ts:12` |
| DELETE | `/api/settings/members/[id]` | 设置与偏好 | 成员 / 服务配置 / 模型 / 存储 / 创作偏好 | CURRENT IMPLEMENTATION | `apps/web/app/api/settings/members/[id]/route.ts:13` |
| GET | `/api/settings/members` | 设置与偏好 | 成员 / 服务配置 / 模型 / 存储 / 创作偏好 | CURRENT IMPLEMENTATION | `apps/web/app/api/settings/members/route.ts:7` |
| POST | `/api/settings/members` | 设置与偏好 | 成员 / 服务配置 / 模型 / 存储 / 创作偏好 | CURRENT IMPLEMENTATION | `apps/web/app/api/settings/members/route.ts:13` |
| POST | `/api/settings/owner` | 设置与偏好 | 成员 / 服务配置 / 模型 / 存储 / 创作偏好 | CURRENT IMPLEMENTATION | `apps/web/app/api/settings/owner/route.ts:5` |
| GET | `/api/settings/sessions` | 设置与偏好 | 成员 / 服务配置 / 模型 / 存储 / 创作偏好 | CURRENT IMPLEMENTATION | `apps/web/app/api/settings/sessions/route.ts:13` |
| DELETE | `/api/settings/sessions` | 设置与偏好 | 成员 / 服务配置 / 模型 / 存储 / 创作偏好 | CURRENT IMPLEMENTATION | `apps/web/app/api/settings/sessions/route.ts:17` |
| GET | `/api/settings/storage` | 设置与偏好 | 成员 / 服务配置 / 模型 / 存储 / 创作偏好 | CURRENT IMPLEMENTATION | `apps/web/app/api/settings/storage/route.ts:19` |
| POST | `/api/settings/storage` | 设置与偏好 | 成员 / 服务配置 / 模型 / 存储 / 创作偏好 | CURRENT IMPLEMENTATION | `apps/web/app/api/settings/storage/route.ts:27` |
| POST | `/api/settings/workspace` | 设置与偏好 | 成员 / 服务配置 / 模型 / 存储 / 创作偏好 | CURRENT IMPLEMENTATION | `apps/web/app/api/settings/workspace/route.ts:9` |
| PATCH | `/api/settings/workspace` | 设置与偏好 | 成员 / 服务配置 / 模型 / 存储 / 创作偏好 | CURRENT IMPLEMENTATION | `apps/web/app/api/settings/workspace/route.ts:20` |
| PATCH | `/api/sidebar/folders/[folderId]` | 首页与项目组织 | 项目创建 / 最近工作 / 收藏 / 文件夹 | CURRENT IMPLEMENTATION | `apps/web/app/api/sidebar/folders/[folderId]/route.ts:13` |
| DELETE | `/api/sidebar/folders/[folderId]` | 首页与项目组织 | 项目创建 / 最近工作 / 收藏 / 文件夹 | CURRENT IMPLEMENTATION | `apps/web/app/api/sidebar/folders/[folderId]/route.ts:26` |
| POST | `/api/sidebar/folders` | 首页与项目组织 | 项目创建 / 最近工作 / 收藏 / 文件夹 | CURRENT IMPLEMENTATION | `apps/web/app/api/sidebar/folders/route.ts:9` |
| POST | `/api/sidebar/projects/[projectId]/opened` | 首页与项目组织 | 项目创建 / 最近工作 / 收藏 / 文件夹 | CURRENT IMPLEMENTATION | `apps/web/app/api/sidebar/projects/[projectId]/opened/route.ts:8` |
| PATCH | `/api/sidebar/projects/[projectId]/preference` | 首页与项目组织 | 项目创建 / 最近工作 / 收藏 / 文件夹 | CURRENT IMPLEMENTATION | `apps/web/app/api/sidebar/projects/[projectId]/preference/route.ts:13` |
| POST | `/api/sidebar/projects` | 首页与项目组织 | 项目创建 / 最近工作 / 收藏 / 文件夹 | CURRENT IMPLEMENTATION | `apps/web/app/api/sidebar/projects/route.ts:7` |
| GET | `/api/sidebar` | 首页与项目组织 | 项目创建 / 最近工作 / 收藏 / 文件夹 | CURRENT IMPLEMENTATION | `apps/web/app/api/sidebar/route.ts:5` |
| GET | `/api/source-items/[id]/assets/[assetId]/access` | 资料与知识 | 内容列表 / 资料详情 / 处理状态 / 知识确认 | CURRENT IMPLEMENTATION | `apps/web/app/api/source-items/[id]/assets/[assetId]/access/route.ts:9` |
| GET | `/api/source-items/[id]/assets/[assetId]/preview` | 资料与知识 | 内容列表 / 资料详情 / 处理状态 / 知识确认 | CURRENT IMPLEMENTATION | `apps/web/app/api/source-items/[id]/assets/[assetId]/preview/route.ts:5` |
| POST | `/api/source-items/[id]/collections` | 资料与知识 | 内容列表 / 资料详情 / 处理状态 / 知识确认 | CURRENT IMPLEMENTATION | `apps/web/app/api/source-items/[id]/collections/route.ts:24` |
| DELETE | `/api/source-items/[id]/collections` | 资料与知识 | 内容列表 / 资料详情 / 处理状态 / 知识确认 | CURRENT IMPLEMENTATION | `apps/web/app/api/source-items/[id]/collections/route.ts:34` |
| GET | `/api/source-items/[id]/distillation` | 资料与知识 | 内容列表 / 资料详情 / 处理状态 / 知识确认 | CURRENT IMPLEMENTATION | `apps/web/app/api/source-items/[id]/distillation/route.ts:11` |
| POST | `/api/source-items/[id]/distillation` | 资料与知识 | 内容列表 / 资料详情 / 处理状态 / 知识确认 | CURRENT IMPLEMENTATION | `apps/web/app/api/source-items/[id]/distillation/route.ts:22` |
| PATCH | `/api/source-items/[id]/knowledge/candidates/[candidateId]` | 资料与知识 | 内容列表 / 资料详情 / 处理状态 / 知识确认 | CURRENT IMPLEMENTATION | `apps/web/app/api/source-items/[id]/knowledge/candidates/[candidateId]/route.ts:8` |
| GET | `/api/source-items/[id]/knowledge` | 资料与知识 | 内容列表 / 资料详情 / 处理状态 / 知识确认 | CURRENT IMPLEMENTATION | `apps/web/app/api/source-items/[id]/knowledge/route.ts:6` |
| POST | `/api/source-items/[id]/knowledge` | 资料与知识 | 内容列表 / 资料详情 / 处理状态 / 知识确认 | CURRENT IMPLEMENTATION | `apps/web/app/api/source-items/[id]/knowledge/route.ts:7` |
| PUT | `/api/source-items/[id]/material-analysis/[analysisId]` | 资料与知识 | 内容列表 / 资料详情 / 处理状态 / 知识确认 | CURRENT IMPLEMENTATION | `apps/web/app/api/source-items/[id]/material-analysis/[analysisId]/route.ts:6` |
| POST | `/api/source-items/[id]/material-analysis/project` | 资料与知识 | 内容列表 / 资料详情 / 处理状态 / 知识确认 | CURRENT IMPLEMENTATION | `apps/web/app/api/source-items/[id]/material-analysis/project/route.ts:6` |
| GET | `/api/source-items/[id]/material-analysis` | 资料与知识 | 内容列表 / 资料详情 / 处理状态 / 知识确认 | CURRENT IMPLEMENTATION | `apps/web/app/api/source-items/[id]/material-analysis/route.ts:6` |
| POST | `/api/source-items/[id]/material-analysis` | 资料与知识 | 内容列表 / 资料详情 / 处理状态 / 知识确认 | CURRENT IMPLEMENTATION | `apps/web/app/api/source-items/[id]/material-analysis/route.ts:17` |
| POST | `/api/source-items/[id]/metadata/refresh` | 资料与知识 | 内容列表 / 资料详情 / 处理状态 / 知识确认 | CURRENT IMPLEMENTATION | `apps/web/app/api/source-items/[id]/metadata/refresh/route.ts:10` |
| GET | `/api/source-items/[id]/processing` | 资料与知识 | 内容列表 / 资料详情 / 处理状态 / 知识确认 | CURRENT IMPLEMENTATION | `apps/web/app/api/source-items/[id]/processing/route.ts:8` |
| GET | `/api/source-items/[id]` | 资料与知识 | 内容列表 / 资料详情 / 处理状态 / 知识确认 | CURRENT IMPLEMENTATION | `apps/web/app/api/source-items/[id]/route.ts:10` |
| PATCH | `/api/source-items/[id]` | 资料与知识 | 内容列表 / 资料详情 / 处理状态 / 知识确认 | CURRENT IMPLEMENTATION | `apps/web/app/api/source-items/[id]/route.ts:27` |
| DELETE | `/api/source-items/[id]` | 资料与知识 | 内容列表 / 资料详情 / 处理状态 / 知识确认 | CURRENT IMPLEMENTATION | `apps/web/app/api/source-items/[id]/route.ts:77` |
| POST | `/api/source-items/[id]/tags` | 资料与知识 | 内容列表 / 资料详情 / 处理状态 / 知识确认 | CURRENT IMPLEMENTATION | `apps/web/app/api/source-items/[id]/tags/route.ts:24` |
| DELETE | `/api/source-items/[id]/tags` | 资料与知识 | 内容列表 / 资料详情 / 处理状态 / 知识确认 | CURRENT IMPLEMENTATION | `apps/web/app/api/source-items/[id]/tags/route.ts:34` |
| POST | `/api/source-items/[id]/transcribe` | 资料与知识 | 内容列表 / 资料详情 / 处理状态 / 知识确认 | CURRENT IMPLEMENTATION | `apps/web/app/api/source-items/[id]/transcribe/route.ts:7` |
| PUT | `/api/source-items/[id]/transcript` | 资料与知识 | 内容列表 / 资料详情 / 处理状态 / 知识确认 | CURRENT IMPLEMENTATION | `apps/web/app/api/source-items/[id]/transcript/route.ts:9` |
| POST | `/api/source-items/[id]/understanding` | 资料与知识 | 内容列表 / 资料详情 / 处理状态 / 知识确认 | CURRENT IMPLEMENTATION | `apps/web/app/api/source-items/[id]/understanding/route.ts:7` |
| GET | `/api/source-items` | 资料与知识 | 内容列表 / 资料详情 / 处理状态 / 知识确认 | CURRENT IMPLEMENTATION | `apps/web/app/api/source-items/route.ts:28` |
| POST | `/api/source-items` | 资料与知识 | 内容列表 / 资料详情 / 处理状态 / 知识确认 | CURRENT IMPLEMENTATION | `apps/web/app/api/source-items/route.ts:35` |
| POST | `/api/source-items/upload` | 资料与知识 | 内容列表 / 资料详情 / 处理状态 / 知识确认 | CURRENT IMPLEMENTATION | `apps/web/app/api/source-items/upload/route.ts:17` |
| POST | `/api/system/health/queue` | 基础能力与内部入口 | 基础设施状态；内部调用不设计普通用户按钮 | INTERNAL | `apps/web/app/api/system/health/queue/route.ts:6` |
| GET | `/api/tags` | 资料与知识 | 内容列表 / 资料详情 / 处理状态 / 知识确认 | CURRENT IMPLEMENTATION | `apps/web/app/api/tags/route.ts:7` |
| POST | `/api/tags` | 资料与知识 | 内容列表 / 资料详情 / 处理状态 / 知识确认 | CURRENT IMPLEMENTATION | `apps/web/app/api/tags/route.ts:14` |
| GET | `/api/video-data` | 运营与发布 | 运营统计 / 日度录入 / 内容阶段 / 发布任务 | CURRENT IMPLEMENTATION | `apps/web/app/api/video-data/route.ts:7` |
| POST | `/api/video-data` | 运营与发布 | 运营统计 / 日度录入 / 内容阶段 / 发布任务 | CURRENT IMPLEMENTATION | `apps/web/app/api/video-data/route.ts:20` |
| GET | `/api/voice-input` | 创作输入与模型 | 资料引用选择 / 模型选择 / 语音输入 | INTERNAL | `apps/web/app/api/voice-input/route.ts:17` |
| POST | `/api/voice-input` | 创作输入与模型 | 资料引用选择 / 模型选择 / 语音输入 | INTERNAL | `apps/web/app/api/voice-input/route.ts:25` |
| GET | `/api/workspaces/[workspaceId]` | 基础能力与内部入口 | 基础设施状态；内部调用不设计普通用户按钮 | INTERNAL | `apps/web/app/api/workspaces/[workspaceId]/route.ts:6` |

## 多操作接口的已找到 action 分支
| 方法与路径 | action 入口 |
| --- | --- |
| `POST /api/content-hub` | `topic.create`, `topic.revise`, `topic.score`, `topic.veto`, `topic.resolve`, `topic.review`, `topic.project`, `topic.archive`, `knowledge.create`, `knowledge.revise`, `knowledge.archive`, `fact.create`, `fact.request`, `fact.decide`, `fact.archive`, `policy.save`, `context.save` |
| `POST /api/projects/[id]/creative-basis` | `DISMISS` |
| `POST /api/settings/storage` | `pick`, `relocateSelected`, `probe`, `relocate`, `reset` |
| `PATCH /api/sidebar/folders/[folderId]` | `RENAME` |
| `PATCH /api/sidebar/projects/[projectId]/preference` | `MOVE` |
| `POST /api/video-data` | `account.create`, `account.archive`, `metrics.save`, `csv.preview`, `content.create`, `content.stage`, `task.create`, `task.update` |

## server 导出函数与直接入口
| 函数 | 源码 | 直接 HTTP 入口 |
| --- | --- | --- |
| `requireSession` | `apps/web/server/access.ts:8` | 未发现直接路由调用；需追踪间接/内部用途 |
| `requireWorkspace` | `apps/web/server/access.ts:16` | 未发现直接路由调用；需追踪间接/内部用途 |
| `requireSystemAdmin` | `apps/web/server/access.ts:30` | 未发现直接路由调用；需追踪间接/内部用途 |
| `requireWorkspaceRole` | `apps/web/server/access.ts:40` | 未发现直接路由调用；需追踪间接/内部用途 |
| `accountApiError` | `apps/web/server/account-api.ts:5` | POST /api/account/invitation；POST /api/account/recovery；PATCH /api/account/recovery；POST /api/account/verification；PATCH /api/account/verification；GET /api/admin/users；POST /api/admin/users；GET /api/admin/workspaces；POST /api/admin/workspaces；GET /api/settings/invitations；POST /api/settings/invitations；DELETE /api/settings/invitations；GET /api/settings/members；POST /api/settings/members；POST /api/settings/owner |
| `rejectCrossOrigin` | `apps/web/server/account-api.ts:12` | POST /api/account/invitation；POST /api/account/recovery；PATCH /api/account/recovery；POST /api/account/verification；PATCH /api/account/verification；PATCH /api/admin/users/[id]；GET /api/admin/users；POST /api/admin/users；GET /api/admin/workspaces；POST /api/admin/workspaces；POST /api/integrations/[provider]/disable；POST /api/integrations/[provider]/enable；GET /api/integrations/[provider]；PUT /api/integrations/[provider]；DELETE /api/integrations/[provider]；POST /api/integrations/[provider]/test；GET /api/settings/invitations；POST /api/settings/invitations；DELETE /api/settings/invitations；GET /api/settings/members；POST /api/settings/members；POST /api/settings/owner；GET /api/settings/sessions；DELETE /api/settings/sessions；GET /api/settings/storage；POST /api/settings/storage；POST /api/settings/workspace；PATCH /api/settings/workspace |
| `accountDelivery` | `apps/web/server/account-delivery.ts:4` | POST /api/account/recovery；PATCH /api/account/recovery；POST /api/account/verification；PATCH /api/account/verification；GET /api/admin/workspaces；POST /api/admin/workspaces；GET /api/settings/invitations；POST /api/settings/invitations；DELETE /api/settings/invitations |
| `accountDeliveryStatus` | `apps/web/server/account-delivery.ts:5` | GET /api/admin/workspaces；POST /api/admin/workspaces；GET /api/settings/invitations；POST /api/settings/invitations；DELETE /api/settings/invitations |
| `accountSession` | `apps/web/server/account-security-api.ts:5` | POST /api/account/invitation；POST /api/account/verification；PATCH /api/account/verification |
| `accountRequestLimit` | `apps/web/server/account-security-api.ts:10` | POST /api/account/invitation；POST /api/account/recovery；PATCH /api/account/recovery；POST /api/account/verification；PATCH /api/account/verification |
| `securityAudit` | `apps/web/server/account-security.ts:20` | 未发现直接路由调用；需追踪间接/内部用途 |
| `requestPasswordRecovery` | `apps/web/server/account-security.ts:52` | POST /api/account/recovery；PATCH /api/account/recovery |
| `finishPasswordRecovery` | `apps/web/server/account-security.ts:63` | POST /api/account/recovery；PATCH /api/account/recovery |
| `requestEmailVerification` | `apps/web/server/account-security.ts:82` | POST /api/account/verification；PATCH /api/account/verification |
| `finishEmailVerification` | `apps/web/server/account-security.ts:92` | POST /api/account/verification；PATCH /api/account/verification |
| `issueInvitation` | `apps/web/server/account-security.ts:106` | GET /api/settings/invitations；POST /api/settings/invitations；DELETE /api/settings/invitations |
| `openCustomerWorkspace` | `apps/web/server/account-security.ts:145` | GET /api/admin/workspaces；POST /api/admin/workspaces |
| `listInvitations` | `apps/web/server/account-security.ts:159` | GET /api/settings/invitations；POST /api/settings/invitations；DELETE /api/settings/invitations |
| `revokeInvitation` | `apps/web/server/account-security.ts:166` | GET /api/settings/invitations；POST /api/settings/invitations；DELETE /api/settings/invitations |
| `acceptInvitation` | `apps/web/server/account-security.ts:179` | POST /api/account/invitation |
| `sessionDevice` | `apps/web/server/account-sessions.ts:3` | 未发现直接路由调用；需追踪间接/内部用途 |
| `listAccountSessions` | `apps/web/server/account-sessions.ts:9` | GET /api/settings/sessions；DELETE /api/settings/sessions |
| `revokeAccountSessions` | `apps/web/server/account-sessions.ts:13` | GET /api/settings/sessions；DELETE /api/settings/sessions |
| `createMember` | `apps/web/server/account-space.ts:27` | GET /api/settings/members；POST /api/settings/members |
| `changeMember` | `apps/web/server/account-space.ts:42` | 未发现直接路由调用；需追踪间接/内部用途 |
| `createInternalPlatformUser` | `apps/web/server/account-space.ts:58` | GET /api/admin/users；POST /api/admin/users |
| `transferWorkspaceOwner` | `apps/web/server/account-space.ts:72` | POST /api/settings/owner |
| `bootstrapSystemAdmin` | `apps/web/server/admin/bootstrap.ts:19` | 未发现直接路由调用；需追踪间接/内部用途 |
| `isStrongStagingAdminPassword` | `apps/web/server/admin/staging-bootstrap.ts:21` | 未发现直接路由调用；需追踪间接/内部用途 |
| `resolveStagingAdminBootstrapConfig` | `apps/web/server/admin/staging-bootstrap.ts:26` | 未发现直接路由调用；需追踪间接/内部用途 |
| `runStagingAdminBootstrap` | `apps/web/server/admin/staging-bootstrap.ts:44` | 未发现直接路由调用；需追踪间接/内部用途 |
| `getSystemDoubaoAdminView` | `apps/web/server/admin/system-providers.ts:15` | GET /api/admin/system/providers/[provider]；PUT /api/admin/system/providers/[provider] |
| `saveSystemDoubaoConfig` | `apps/web/server/admin/system-providers.ts:38` | GET /api/admin/system/providers/[provider]；PUT /api/admin/system/providers/[provider] |
| `getSystemServiceStatuses` | `apps/web/server/admin/system-services.ts:21` | GET /api/admin/system |
| `getAdminUsage` | `apps/web/server/admin/usage.ts:14` | GET /api/admin/usage |
| `setUserDisabled` | `apps/web/server/admin/user-lifecycle.ts:8` | PATCH /api/admin/users/[id] |
| `aiApiError` | `apps/web/server/ai/ai-api.ts:10` | POST /api/projects/[id]/ai/run；POST /api/projects/[id]/ai/runs/[runId]/apply；POST /api/projects/[id]/ai/runs/[runId]/discard |
| `runAIAction` | `apps/web/server/ai/ai-run-service.ts:137` | POST /api/projects/[id]/ai/run |
| `applyAIResult` | `apps/web/server/ai/ai-run-service.ts:199` | POST /api/projects/[id]/ai/runs/[runId]/apply |
| `discardAIResult` | `apps/web/server/ai/ai-run-service.ts:253` | POST /api/projects/[id]/ai/runs/[runId]/discard |
| `getRecentAIRuns` | `apps/web/server/ai/ai-run-service.ts:259` | 未发现直接路由调用；需追踪间接/内部用途 |
| `employeeAIErrorMessage` | `apps/web/server/ai/control/contracts.ts:142` | 未发现直接路由调用；需追踪间接/内部用途 |
| `nextSourceUnderstandingStep` | `apps/web/server/ai/control/video-orchestration.ts:13` | 未发现直接路由调用；需追踪间接/内部用途 |
| `splitContextStatements` | `apps/web/server/ai/creation-context.ts:10` | 未发现直接路由调用；需追踪间接/内部用途 |
| `extractExplicitOwnFacts` | `apps/web/server/ai/creation-context.ts:14` | 未发现直接路由调用；需追踪间接/内部用途 |
| `appendConfirmedCreatorFacts` | `apps/web/server/ai/creation-context.ts:23` | 未发现直接路由调用；需追踪间接/内部用途 |
| `classifyCreatorContext` | `apps/web/server/ai/creation-context.ts:48` | 未发现直接路由调用；需追踪间接/内部用途 |
| `uniqueConfirmedFacts` | `apps/web/server/ai/creation-context.ts:82` | 未发现直接路由调用；需追踪间接/内部用途 |
| `warningKey` | `apps/web/server/ai/draft-warnings.ts:9` | 未发现直接路由调用；需追踪间接/内部用途 |
| `warningsFromUnderstanding` | `apps/web/server/ai/draft-warnings.ts:13` | 未发现直接路由调用；需追踪间接/内部用途 |
| `buildDraftWarnings` | `apps/web/server/ai/draft-warnings.ts:28` | POST /api/projects/[id]/drafts/[draftId]/confirm；POST /api/projects/[id]/mother-content/confirm；POST /api/projects/[id]/mother-content/warnings |
| `isLlmConfigurationError` | `apps/web/server/ai/llm-api-status.ts:10` | 未发现直接路由调用；需追踪间接/内部用途 |
| `llmApiStatus` | `apps/web/server/ai/llm-api-status.ts:14` | 未发现直接路由调用；需追踪间接/内部用途 |
| `loadLLMRuntime` | `apps/web/server/ai/llm-runtime.ts:49` | 未发现直接路由调用；需追踪间接/内部用途 |
| `selectPromptTemplate` | `apps/web/server/ai/prompt-service.ts:5` | 未发现直接路由调用；需追踪间接/内部用途 |
| `renderPrompt` | `apps/web/server/ai/prompt-service.ts:11` | 未发现直接路由调用；需追踪间接/内部用途 |
| `referenceScopeFromContext` | `apps/web/server/ai/reference-safety.ts:18` | 未发现直接路由调用；需追踪间接/内部用途 |
| `recommendStudioQuickActions` | `apps/web/server/ai/schemas.ts:11` | 未发现直接路由调用；需追踪间接/内部用途 |
| `schemaForAction` | `apps/web/server/ai/schemas.ts:97` | 未发现直接路由调用；需追踪间接/内部用途 |
| `outputInstruction` | `apps/web/server/ai/schemas.ts:115` | 未发现直接路由调用；需追踪间接/内部用途 |
| `isRewriteAction` | `apps/web/server/ai/schemas.ts:116` | 未发现直接路由调用；需追踪间接/内部用途 |
| `resolveSkillPoolDryRun` | `apps/web/server/ai/skill-resolver.ts:98` | 未发现直接路由调用；需追踪间接/内部用途 |
| `guardSkillResolution` | `apps/web/server/ai/skill-resolver.ts:182` | 未发现直接路由调用；需追踪间接/内部用途 |
| `resolveSkillPoolWithModel` | `apps/web/server/ai/skill-resolver.ts:222` | 未发现直接路由调用；需追踪间接/内部用途 |
| `selectedMethodMetadata` | `apps/web/server/ai/skill-resolver.ts:233` | 未发现直接路由调用；需追踪间接/内部用途 |
| `defaultMethodMetadata` | `apps/web/server/ai/skill-resolver.ts:254` | 未发现直接路由调用；需追踪间接/内部用途 |
| `dedupeWritingMethodBlocks` | `apps/web/server/ai/writing-methods/ip-strategist.ts:89` | 未发现直接路由调用；需追踪间接/内部用途 |
| `loadMotherContentWritingMethodPack` | `apps/web/server/ai/writing-methods/ip-strategist.ts:99` | 未发现直接路由调用；需追踪间接/内部用途 |
| `findSourceOverlaps` | `apps/web/server/ai/writing-methods/source-overlap.ts:7` | 未发现直接路由调用；需追踪间接/内部用途 |
| `getApiWorkspaceContext` | `apps/web/server/api-access.ts:7` | POST /api/benchmark-topics/[runId]/select；POST /api/benchmark-topics；GET /api/collections；POST /api/collections；GET /api/content-hub；POST /api/content-hub；GET /api/creation/models；POST /api/creation/sources；GET /api/creator-profile；PUT /api/creator-profile；PATCH /api/creator-profile/suggestions/[suggestionId]；GET /api/creator-profile/suggestions；POST /api/creator-profile/suggestions；GET /api/discovery/benchmarks/[id]/collection-runs/[runId]；GET /api/discovery/benchmarks/[id]/collection-runs；POST /api/discovery/benchmarks/[id]/collection-runs；POST /api/discovery/benchmarks/[id]/comments/analyze；POST /api/discovery/benchmarks/[id]/comments/collect；GET /api/discovery/benchmarks/[id]/inputs；POST /api/discovery/benchmarks/[id]/inputs；PATCH /api/discovery/benchmarks/[id]/method-suggestions/[suggestionId]；GET /api/discovery/benchmarks/[id]/method-suggestions；POST /api/discovery/benchmarks/[id]/method-suggestions；PATCH /api/discovery/benchmarks/[id]/organization；GET /api/discovery/benchmarks/[id]/report；GET /api/discovery/benchmarks/[id]；DELETE /api/discovery/benchmarks/[id]；GET /api/discovery/benchmarks/[id]/studies；POST /api/discovery/benchmarks/[id]/studies；GET /api/discovery/benchmarks；POST /api/discovery/benchmarks；POST /api/discovery/collect；POST /api/discovery/ideas/[id]/references；GET /api/discovery/ideas/[id]；PATCH /api/discovery/ideas/[id]；POST /api/discovery/ideas/[id]/start；GET /api/discovery/ideas；POST /api/discovery/ideas；POST /api/discovery/projects；GET /api/discovery/recommendations/[id]；POST /api/discovery/recommendations/[id]；GET /api/discovery/recommendations；POST /api/discovery/recommendations；POST /api/discovery/search；POST /api/discovery/trends/[key]/ideas；POST /api/discovery/trends/[key]/related；POST /api/discovery/trends/[key]/topics；GET /api/discovery/trends；POST /api/discovery/trends；POST /api/feishu/browse；GET /api/feishu；POST /api/feishu；POST /api/ingest-jobs/[id]/cancel；POST /api/ingest-jobs/[id]/retry；GET /api/ingest-jobs/[id]；POST /api/integrations/[provider]/disable；POST /api/integrations/[provider]/enable；GET /api/integrations/[provider]；PUT /api/integrations/[provider]；DELETE /api/integrations/[provider]；POST /api/integrations/[provider]/test；GET /api/integrations/LLM/models；GET /api/integrations；POST /api/local-asr/models/initialize；GET /api/local-asr/status；GET /api/methods/[id]；PUT /api/methods/[id]；PATCH /api/methods/[id]；DELETE /api/methods/[id]；GET /api/methods/default；POST /api/methods/default；PUT /api/methods/default；PATCH /api/methods/default；POST /api/methods/import；GET /api/methods；POST /api/methods；POST /api/projects/[id]/ai/run；POST /api/projects/[id]/ai/runs/[runId]/apply；POST /api/projects/[id]/ai/runs/[runId]/discard；GET /api/projects/[id]/artifacts/[artifactId]/history；POST /api/projects/[id]/artifacts/[artifactId]/history；POST /api/projects/[id]/artifacts/[artifactId]/revisions；PATCH /api/projects/[id]/artifacts/[artifactId]；GET /api/projects/[id]/artifacts/[artifactId]；PUT /api/projects/[id]/artifacts/[artifactId]；GET /api/projects/[id]/artifacts；POST /api/projects/[id]/artifacts；POST /api/projects/[id]/assistant/messages/[messageId]/save；GET /api/projects/[id]/assistant/models；GET /api/projects/[id]/assistant/references；PATCH /api/projects/[id]/assistant；GET /api/projects/[id]/assistant；POST /api/projects/[id]/assistant；PUT /api/projects/[id]/brief；GET /api/projects/[id]/canvas/objects/[objectId]/assistant；POST /api/projects/[id]/canvas/objects/[objectId]/assistant；POST /api/projects/[id]/canvas/objects/[objectId]/restore；PATCH /api/projects/[id]/canvas/objects/[objectId]；DELETE /api/projects/[id]/canvas/objects/[objectId]；GET /api/projects/[id]/canvas/objects；POST /api/projects/[id]/canvas/objects；POST /api/projects/[id]/creative-basis；POST /api/projects/[id]/deep-content-package/apply；POST /api/projects/[id]/deep-content-package/generate；GET /api/projects/[id]/deep-content-package；PUT /api/projects/[id]/deep-content-package；POST /api/projects/[id]/drafts/[draftId]/checkpoint；POST /api/projects/[id]/drafts/[draftId]/confirm；GET /api/projects/[id]/drafts/[draftId]/history；POST /api/projects/[id]/drafts/[draftId]/primary；GET /api/projects/[id]/drafts/[draftId]；PUT /api/projects/[id]/drafts/[draftId]；PATCH /api/projects/[id]/drafts/[draftId]；DELETE /api/projects/[id]/drafts/[draftId]；GET /api/projects/[id]/drafts；POST /api/projects/[id]/drafts；PATCH /api/projects/[id]/evidence/[evidenceId]；DELETE /api/projects/[id]/evidence/[evidenceId]；POST /api/projects/[id]/evidence；GET /api/projects/[id]/feedback；PUT /api/projects/[id]/feedback；POST /api/projects/[id]/gpt-task-package/copied；GET /api/projects/[id]/gpt-task-package；POST /api/projects/[id]/import-gpt-draft；GET /api/projects/[id]/methods；PUT /api/projects/[id]/methods；POST /api/projects/[id]/mother-content/confirm；PUT /api/projects/[id]/mother-content/confirmation；GET /api/projects/[id]/mother-content；PUT /api/projects/[id]/mother-content；POST /api/projects/[id]/mother-content/warnings；POST /api/projects/[id]/platform-variants/[platform]/apply；POST /api/projects/[id]/platform-variants/[platform]/review/ai；POST /api/projects/[id]/platform-variants/[platform]/review/approve；POST /api/projects/[id]/platform-variants/[platform]/review/reject；POST /api/projects/[id]/platform-variants/[platform]/review/request-changes；POST /api/projects/[id]/platform-variants/[platform]/review/submit；GET /api/projects/[id]/platform-variants/[platform]/reviews；GET /api/projects/[id]/platform-variants/[platform]；PUT /api/projects/[id]/platform-variants/[platform]；POST /api/projects/[id]/platform-variants/generate；GET /api/projects/[id]/platform-variants；POST /api/projects/[id]/restore；GET /api/projects/[id]；PATCH /api/projects/[id]；DELETE /api/projects/[id]；DELETE /api/projects/[id]/sources/[sourceId]；POST /api/projects/[id]/sources；POST /api/projects/[id]/transition；GET /api/projects；POST /api/projects；POST /api/publish-tasks/[id]/cancel；POST /api/publish-tasks/[id]/failed；POST /api/publish-tasks/[id]/package/copied；GET /api/publish-tasks/[id]/package；POST /api/publish-tasks/[id]/published；GET /api/publish-tasks/[id]；PATCH /api/publish-tasks/[id]；POST /api/publish-tasks/[id]/schedule；GET /api/publish-tasks；POST /api/publish-tasks；POST /api/research/benchmarks/[id]/sync；POST /api/research/benchmarks/import；GET /api/search；GET /api/settings/diagnostics；GET /api/settings/invitations；POST /api/settings/invitations；DELETE /api/settings/invitations；GET /api/settings/members；POST /api/settings/members；POST /api/settings/owner；GET /api/settings/storage；POST /api/settings/storage；POST /api/settings/workspace；PATCH /api/settings/workspace；PATCH /api/sidebar/folders/[folderId]；DELETE /api/sidebar/folders/[folderId]；POST /api/sidebar/folders；POST /api/sidebar/projects/[projectId]/opened；PATCH /api/sidebar/projects/[projectId]/preference；POST /api/sidebar/projects；GET /api/sidebar；GET /api/source-items/[id]/assets/[assetId]/access；GET /api/source-items/[id]/assets/[assetId]/preview；GET /api/source-items/[id]/distillation；POST /api/source-items/[id]/distillation；PATCH /api/source-items/[id]/knowledge/candidates/[candidateId]；GET /api/source-items/[id]/knowledge；POST /api/source-items/[id]/knowledge；PUT /api/source-items/[id]/material-analysis/[analysisId]；POST /api/source-items/[id]/material-analysis/project；GET /api/source-items/[id]/material-analysis；POST /api/source-items/[id]/material-analysis；POST /api/source-items/[id]/metadata/refresh；GET /api/source-items/[id]/processing；GET /api/source-items/[id]；PATCH /api/source-items/[id]；DELETE /api/source-items/[id]；POST /api/source-items/[id]/transcribe；PUT /api/source-items/[id]/transcript；POST /api/source-items/[id]/understanding；GET /api/source-items；POST /api/source-items；POST /api/source-items/upload；GET /api/tags；POST /api/tags；GET /api/video-data；POST /api/video-data；GET /api/voice-input；POST /api/voice-input |
| `getSystemAdminApiContext` | `apps/web/server/api-access.ts:17` | GET /api/admin/system/providers/[provider]；PUT /api/admin/system/providers/[provider]；GET /api/admin/system；GET /api/admin/usage；PATCH /api/admin/users/[id]；GET /api/admin/users；POST /api/admin/users；GET /api/admin/workspaces；POST /api/admin/workspaces |
| `apiError` | `apps/web/server/api-access.ts:30` | POST /api/account/verification；PATCH /api/account/verification；GET /api/admin/system/providers/[provider]；PUT /api/admin/system/providers/[provider]；GET /api/admin/usage；PATCH /api/admin/users/[id]；GET /api/admin/users；POST /api/admin/users；POST /api/benchmark-topics/[runId]/select；POST /api/benchmark-topics；GET /api/collections；POST /api/collections；GET /api/content-hub；POST /api/content-hub；GET /api/creation/models；POST /api/creation/sources；GET /api/creator-profile；PUT /api/creator-profile；PATCH /api/creator-profile/suggestions/[suggestionId]；GET /api/creator-profile/suggestions；POST /api/creator-profile/suggestions；GET /api/discovery/benchmarks/[id]/collection-runs/[runId]；GET /api/discovery/benchmarks/[id]/collection-runs；POST /api/discovery/benchmarks/[id]/collection-runs；POST /api/discovery/benchmarks/[id]/comments/analyze；POST /api/discovery/benchmarks/[id]/comments/collect；GET /api/discovery/benchmarks/[id]/inputs；POST /api/discovery/benchmarks/[id]/inputs；PATCH /api/discovery/benchmarks/[id]/method-suggestions/[suggestionId]；GET /api/discovery/benchmarks/[id]/method-suggestions；POST /api/discovery/benchmarks/[id]/method-suggestions；PATCH /api/discovery/benchmarks/[id]/organization；GET /api/discovery/benchmarks/[id]/report；GET /api/discovery/benchmarks/[id]；DELETE /api/discovery/benchmarks/[id]；GET /api/discovery/benchmarks/[id]/studies；POST /api/discovery/benchmarks/[id]/studies；GET /api/discovery/benchmarks；POST /api/discovery/benchmarks；POST /api/discovery/collect；POST /api/discovery/ideas/[id]/references；GET /api/discovery/ideas/[id]；PATCH /api/discovery/ideas/[id]；POST /api/discovery/ideas/[id]/start；GET /api/discovery/ideas；POST /api/discovery/ideas；POST /api/discovery/projects；GET /api/discovery/recommendations/[id]；POST /api/discovery/recommendations/[id]；GET /api/discovery/recommendations；POST /api/discovery/recommendations；POST /api/discovery/search；POST /api/discovery/trends/[key]/ideas；POST /api/discovery/trends/[key]/related；POST /api/discovery/trends/[key]/topics；GET /api/discovery/trends；POST /api/discovery/trends；POST /api/feishu/browse；GET /api/feishu；POST /api/feishu；POST /api/ingest-jobs/[id]/cancel；POST /api/ingest-jobs/[id]/retry；GET /api/ingest-jobs/[id]；POST /api/integrations/[provider]/disable；POST /api/integrations/[provider]/enable；GET /api/integrations/[provider]；PUT /api/integrations/[provider]；DELETE /api/integrations/[provider]；POST /api/integrations/[provider]/test；GET /api/integrations/LLM/models；GET /api/integrations；POST /api/local-asr/models/initialize；GET /api/methods/[id]；PUT /api/methods/[id]；PATCH /api/methods/[id]；DELETE /api/methods/[id]；GET /api/methods/default；POST /api/methods/default；PUT /api/methods/default；PATCH /api/methods/default；POST /api/methods/import；GET /api/methods；POST /api/methods；POST /api/projects/[id]/ai/run；POST /api/projects/[id]/ai/runs/[runId]/apply；POST /api/projects/[id]/ai/runs/[runId]/discard；GET /api/projects/[id]/artifacts/[artifactId]/history；POST /api/projects/[id]/artifacts/[artifactId]/history；POST /api/projects/[id]/artifacts/[artifactId]/revisions；PATCH /api/projects/[id]/artifacts/[artifactId]；GET /api/projects/[id]/artifacts/[artifactId]；PUT /api/projects/[id]/artifacts/[artifactId]；GET /api/projects/[id]/artifacts；POST /api/projects/[id]/artifacts；POST /api/projects/[id]/assistant/messages/[messageId]/save；GET /api/projects/[id]/assistant/models；GET /api/projects/[id]/assistant/references；PATCH /api/projects/[id]/assistant；GET /api/projects/[id]/assistant；POST /api/projects/[id]/assistant；PUT /api/projects/[id]/brief；GET /api/projects/[id]/canvas/objects/[objectId]/assistant；POST /api/projects/[id]/canvas/objects/[objectId]/assistant；POST /api/projects/[id]/canvas/objects/[objectId]/restore；PATCH /api/projects/[id]/canvas/objects/[objectId]；DELETE /api/projects/[id]/canvas/objects/[objectId]；GET /api/projects/[id]/canvas/objects；POST /api/projects/[id]/canvas/objects；POST /api/projects/[id]/creative-basis；POST /api/projects/[id]/deep-content-package/apply；POST /api/projects/[id]/deep-content-package/generate；GET /api/projects/[id]/deep-content-package；PUT /api/projects/[id]/deep-content-package；POST /api/projects/[id]/drafts/[draftId]/checkpoint；POST /api/projects/[id]/drafts/[draftId]/confirm；GET /api/projects/[id]/drafts/[draftId]/history；POST /api/projects/[id]/drafts/[draftId]/primary；GET /api/projects/[id]/drafts/[draftId]；PUT /api/projects/[id]/drafts/[draftId]；PATCH /api/projects/[id]/drafts/[draftId]；DELETE /api/projects/[id]/drafts/[draftId]；GET /api/projects/[id]/drafts；POST /api/projects/[id]/drafts；PATCH /api/projects/[id]/evidence/[evidenceId]；DELETE /api/projects/[id]/evidence/[evidenceId]；POST /api/projects/[id]/evidence；GET /api/projects/[id]/feedback；PUT /api/projects/[id]/feedback；POST /api/projects/[id]/gpt-task-package/copied；GET /api/projects/[id]/gpt-task-package；POST /api/projects/[id]/import-gpt-draft；GET /api/projects/[id]/methods；PUT /api/projects/[id]/methods；POST /api/projects/[id]/mother-content/confirm；PUT /api/projects/[id]/mother-content/confirmation；GET /api/projects/[id]/mother-content；PUT /api/projects/[id]/mother-content；POST /api/projects/[id]/mother-content/warnings；POST /api/projects/[id]/platform-variants/[platform]/apply；POST /api/projects/[id]/platform-variants/[platform]/review/ai；POST /api/projects/[id]/platform-variants/[platform]/review/approve；POST /api/projects/[id]/platform-variants/[platform]/review/reject；POST /api/projects/[id]/platform-variants/[platform]/review/request-changes；POST /api/projects/[id]/platform-variants/[platform]/review/submit；GET /api/projects/[id]/platform-variants/[platform]/reviews；GET /api/projects/[id]/platform-variants/[platform]；PUT /api/projects/[id]/platform-variants/[platform]；POST /api/projects/[id]/platform-variants/generate；GET /api/projects/[id]/platform-variants；POST /api/projects/[id]/restore；GET /api/projects/[id]；PATCH /api/projects/[id]；DELETE /api/projects/[id]；DELETE /api/projects/[id]/sources/[sourceId]；POST /api/projects/[id]/sources；POST /api/projects/[id]/transition；GET /api/projects；POST /api/projects；POST /api/publish-tasks/[id]/cancel；POST /api/publish-tasks/[id]/failed；POST /api/publish-tasks/[id]/package/copied；GET /api/publish-tasks/[id]/package；POST /api/publish-tasks/[id]/published；GET /api/publish-tasks/[id]；PATCH /api/publish-tasks/[id]；POST /api/publish-tasks/[id]/schedule；GET /api/publish-tasks；POST /api/publish-tasks；POST /api/research/benchmarks/[id]/sync；GET /api/research/benchmarks/[id]/works/[workId]/media；POST /api/research/benchmarks/import；GET /api/search；GET /api/settings/diagnostics；GET /api/settings/invitations；POST /api/settings/invitations；DELETE /api/settings/invitations；GET /api/settings/members；POST /api/settings/members；POST /api/settings/owner；GET /api/settings/sessions；DELETE /api/settings/sessions；GET /api/settings/storage；POST /api/settings/storage；POST /api/settings/workspace；PATCH /api/settings/workspace；PATCH /api/sidebar/folders/[folderId]；DELETE /api/sidebar/folders/[folderId]；POST /api/sidebar/folders；POST /api/sidebar/projects/[projectId]/opened；PATCH /api/sidebar/projects/[projectId]/preference；POST /api/sidebar/projects；GET /api/sidebar；GET /api/source-items/[id]/assets/[assetId]/access；GET /api/source-items/[id]/assets/[assetId]/preview；GET /api/source-items/[id]/distillation；POST /api/source-items/[id]/distillation；PATCH /api/source-items/[id]/knowledge/candidates/[candidateId]；GET /api/source-items/[id]/knowledge；POST /api/source-items/[id]/knowledge；PUT /api/source-items/[id]/material-analysis/[analysisId]；POST /api/source-items/[id]/material-analysis/project；GET /api/source-items/[id]/material-analysis；POST /api/source-items/[id]/material-analysis；POST /api/source-items/[id]/metadata/refresh；GET /api/source-items/[id]/processing；GET /api/source-items/[id]；PATCH /api/source-items/[id]；DELETE /api/source-items/[id]；POST /api/source-items/[id]/transcribe；PUT /api/source-items/[id]/transcript；POST /api/source-items/[id]/understanding；GET /api/source-items；POST /api/source-items；POST /api/source-items/upload；GET /api/tags；POST /api/tags；GET /api/video-data；POST /api/video-data；GET /api/voice-input；POST /api/voice-input |
| `artifactApiError` | `apps/web/server/artifacts/api.ts:4` | GET /api/projects/[id]/artifacts/[artifactId]/history；POST /api/projects/[id]/artifacts/[artifactId]/history；POST /api/projects/[id]/artifacts/[artifactId]/revisions；PATCH /api/projects/[id]/artifacts/[artifactId]；GET /api/projects/[id]/artifacts/[artifactId]；PUT /api/projects/[id]/artifacts/[artifactId]；GET /api/projects/[id]/artifacts；POST /api/projects/[id]/artifacts |
| `listArtifacts` | `apps/web/server/artifacts/service.ts:66` | GET /api/projects/[id]/artifacts；POST /api/projects/[id]/artifacts |
| `getArtifactForUser` | `apps/web/server/artifacts/service.ts:72` | GET /api/research/creation；POST /api/research/creation |
| `getArtifactHistoryPage` | `apps/web/server/artifacts/service.ts:79` | GET /api/projects/[id]/artifacts/[artifactId]/history；POST /api/projects/[id]/artifacts/[artifactId]/history |
| `getArtifactHistory` | `apps/web/server/artifacts/service.ts:87` | 未发现直接路由调用；需追踪间接/内部用途 |
| `restoreArtifactRevision` | `apps/web/server/artifacts/service.ts:91` | GET /api/projects/[id]/artifacts/[artifactId]/history；POST /api/projects/[id]/artifacts/[artifactId]/history |
| `setArtifactLocked` | `apps/web/server/artifacts/service.ts:99` | PATCH /api/projects/[id]/artifacts/[artifactId]；GET /api/projects/[id]/artifacts/[artifactId]；PUT /api/projects/[id]/artifacts/[artifactId] |
| `createTextArtifact` | `apps/web/server/artifacts/service.ts:118` | GET /api/projects/[id]/artifacts；POST /api/projects/[id]/artifacts |
| `applyTextArtifactRevision` | `apps/web/server/artifacts/service.ts:143` | POST /api/projects/[id]/artifacts/[artifactId]/revisions |
| `saveTextArtifact` | `apps/web/server/artifacts/service.ts:185` | PATCH /api/projects/[id]/artifacts/[artifactId]；GET /api/projects/[id]/artifacts/[artifactId]；PUT /api/projects/[id]/artifacts/[artifactId] |
| `artifactSummaryView` | `apps/web/server/artifacts/view-model.ts:22` | 未发现直接路由调用；需追踪间接/内部用途 |
| `artifactView` | `apps/web/server/artifacts/view-model.ts:26` | 未发现直接路由调用；需追踪间接/内部用途 |
| `assistantApiError` | `apps/web/server/assistant/api.ts:5` | POST /api/projects/[id]/assistant/messages/[messageId]/save；GET /api/projects/[id]/assistant/models；GET /api/projects/[id]/assistant/references；PATCH /api/projects/[id]/assistant；GET /api/projects/[id]/assistant；POST /api/projects/[id]/assistant；GET /api/projects/[id]/canvas/objects/[objectId]/assistant；POST /api/projects/[id]/canvas/objects/[objectId]/assistant |
| `assistantCacheKey` | `apps/web/server/assistant/cache.ts:40` | 未发现直接路由调用；需追踪间接/内部用途 |
| `assistantLimit` | `apps/web/server/assistant/capacity.ts:6` | 未发现直接路由调用；需追踪间接/内部用途 |
| `consumeAssistantRequest` | `apps/web/server/assistant/capacity.ts:11` | 未发现直接路由调用；需追踪间接/内部用途 |
| `assertAssistantCapacity` | `apps/web/server/assistant/capacity.ts:17` | 未发现直接路由调用；需追踪间接/内部用途 |
| `fitContext` | `apps/web/server/assistant/context-budget.ts:4` | 未发现直接路由调用；需追踪间接/内部用途 |
| `resolveCreationPolicy` | `apps/web/server/assistant/creation-policy.ts:3` | 未发现直接路由调用；需追踪间接/内部用途 |
| `paragraphScope` | `apps/web/server/assistant/creation-policy.ts:25` | 未发现直接路由调用；需追踪间接/内部用途 |
| `mergeLocalEdit` | `apps/web/server/assistant/creation-policy.ts:34` | 未发现直接路由调用；需追踪间接/内部用途 |
| `mediaLinkFromMessage` | `apps/web/server/assistant/media-link.ts:11` | 未发现直接路由调用；需追踪间接/内部用途 |
| `prepareMediaLink` | `apps/web/server/assistant/media-link.ts:22` | 未发现直接路由调用；需追踪间接/内部用途 |
| `memoryTerms` | `apps/web/server/assistant/memory.ts:11` | 未发现直接路由调用；需追踪间接/内部用途 |
| `memoryItems` | `apps/web/server/assistant/memory.ts:13` | 未发现直接路由调用；需追踪间接/内部用途 |
| `recallAssistantMemory` | `apps/web/server/assistant/memory.ts:29` | 未发现直接路由调用；需追踪间接/内部用途 |
| `loadConfirmedProjectFacts` | `apps/web/server/assistant/references.ts:37` | 未发现直接路由调用；需追踪间接/内部用途 |
| `assertReferenceProject` | `apps/web/server/assistant/references.ts:65` | GET /api/projects/[id]/assistant/models |
| `searchContextReferences` | `apps/web/server/assistant/references.ts:71` | GET /api/projects/[id]/assistant/references |
| `resolveContextReferences` | `apps/web/server/assistant/references.ts:93` | 未发现直接路由调用；需追踪间接/内部用途 |
| `getProjectAssistantThread` | `apps/web/server/assistant/service.ts:213` | PATCH /api/projects/[id]/assistant；GET /api/projects/[id]/assistant；POST /api/projects/[id]/assistant |
| `runProjectAssistant` | `apps/web/server/assistant/service.ts:249` | PATCH /api/projects/[id]/assistant；GET /api/projects/[id]/assistant；POST /api/projects/[id]/assistant |
| `saveAssistantMessageResult` | `apps/web/server/assistant/service.ts:425` | POST /api/projects/[id]/assistant/messages/[messageId]/save |
| `getNodeAssistantThread` | `apps/web/server/assistant/service.ts:460` | GET /api/projects/[id]/canvas/objects/[objectId]/assistant；POST /api/projects/[id]/canvas/objects/[objectId]/assistant |
| `runNodeAssistant` | `apps/web/server/assistant/service.ts:476` | GET /api/projects/[id]/canvas/objects/[objectId]/assistant；POST /api/projects/[id]/canvas/objects/[objectId]/assistant |
| `readTaskState` | `apps/web/server/assistant/task-state.ts:6` | 未发现直接路由调用；需追踪间接/内部用途 |
| `advanceTaskState` | `apps/web/server/assistant/task-state.ts:11` | 未发现直接路由调用；需追踪间接/内部用途 |
| `taskNeedsKnowledge` | `apps/web/server/assistant/task-state.ts:29` | 未发现直接路由调用；需追踪间接/内部用途 |
| `resolveAssistantIntent` | `apps/web/server/assistant/task-state.ts:48` | 未发现直接路由调用；需追踪间接/内部用途 |
| `taskDialogue` | `apps/web/server/assistant/task-state.ts:57` | 未发现直接路由调用；需追踪间接/内部用途 |
| `searchQueryForMessage` | `apps/web/server/assistant/web-search.ts:8` | 未发现直接路由调用；需追踪间接/内部用途 |
| `parseSearchResponse` | `apps/web/server/assistant/web-search.ts:16` | 未发现直接路由调用；需追踪间接/内部用途 |
| `exaSearch` | `apps/web/server/assistant/web-search.ts:30` | 未发现直接路由调用；需追踪间接/内部用途 |
| `parseDeepSeekSearch` | `apps/web/server/assistant/web-search.ts:40` | 未发现直接路由调用；需追踪间接/内部用途 |
| `deepSeekNativeSearch` | `apps/web/server/assistant/web-search.ts:54` | 未发现直接路由调用；需追踪间接/内部用途 |
| `searchForAssistant` | `apps/web/server/assistant/web-search.ts:62` | 未发现直接路由调用；需追踪间接/内部用途 |
| `loginResponse` | `apps/web/server/auth-response.ts:3` | 未发现直接路由调用；需追踪间接/内部用途 |
| `generateBenchmarkTopics` | `apps/web/server/benchmark-topics/service.ts:110` | POST /api/benchmark-topics |
| `selectBenchmarkTopic` | `apps/web/server/benchmark-topics/service.ts:135` | POST /api/benchmark-topics/[runId]/select |
| `saveBrief` | `apps/web/server/brief-service.ts:30` | PUT /api/projects/[id]/brief |
| `canvasApiError` | `apps/web/server/canvas/api.ts:4` | POST /api/projects/[id]/canvas/objects/[objectId]/restore；PATCH /api/projects/[id]/canvas/objects/[objectId]；DELETE /api/projects/[id]/canvas/objects/[objectId]；GET /api/projects/[id]/canvas/objects；POST /api/projects/[id]/canvas/objects |
| `listCanvasObjects` | `apps/web/server/canvas/service.ts:119` | GET /api/projects/[id]/canvas/objects；POST /api/projects/[id]/canvas/objects |
| `createCanvasTextObject` | `apps/web/server/canvas/service.ts:129` | GET /api/projects/[id]/canvas/objects；POST /api/projects/[id]/canvas/objects |
| `createCanvasMaterialObject` | `apps/web/server/canvas/service.ts:146` | GET /api/projects/[id]/canvas/objects；POST /api/projects/[id]/canvas/objects |
| `updateCanvasText` | `apps/web/server/canvas/service.ts:181` | PATCH /api/projects/[id]/canvas/objects/[objectId]；DELETE /api/projects/[id]/canvas/objects/[objectId] |
| `updateCanvasLayout` | `apps/web/server/canvas/service.ts:195` | PATCH /api/projects/[id]/canvas/objects/[objectId]；DELETE /api/projects/[id]/canvas/objects/[objectId] |
| `softDeleteCanvasObject` | `apps/web/server/canvas/service.ts:208` | PATCH /api/projects/[id]/canvas/objects/[objectId]；DELETE /api/projects/[id]/canvas/objects/[objectId] |
| `restoreCanvasObject` | `apps/web/server/canvas/service.ts:222` | POST /api/projects/[id]/canvas/objects/[objectId]/restore |
| `scoreStatus` | `apps/web/server/content-governance/policy.ts:34` | 未发现直接路由调用；需追踪间接/内部用途 |
| `factState` | `apps/web/server/content-governance/policy.ts:50` | 未发现直接路由调用；需追踪间接/内部用途 |
| `readHub` | `apps/web/server/content-governance/service.ts:26` | GET /api/content-hub；POST /api/content-hub |
| `mutateHub` | `apps/web/server/content-governance/service.ts:37` | GET /api/content-hub；POST /api/content-hub |
| `getCreationModels` | `apps/web/server/creation/models.ts:9` | GET /api/creation/models |
| `validateCreationModel` | `apps/web/server/creation/models.ts:22` | 未发现直接路由调用；需追踪间接/内部用途 |
| `loadCreationSources` | `apps/web/server/creation/sources.ts:7` | POST /api/creation/sources |
| `creationImageContent` | `apps/web/server/creation/sources.ts:31` | 未发现直接路由调用；需追踪间接/内部用途 |
| `getCreationFeedbackContext` | `apps/web/server/creation-feedback/service.ts:114` | GET /api/projects/[id]/feedback；PUT /api/projects/[id]/feedback |
| `upsertCreationFeedback` | `apps/web/server/creation-feedback/service.ts:127` | GET /api/projects/[id]/feedback；PUT /api/projects/[id]/feedback |
| `getCreatorMethodsOverview` | `apps/web/server/creator-methods/service.ts:61` | 未发现直接路由调用；需追踪间接/内部用途 |
| `normalizeCreatorProfileInput` | `apps/web/server/creator-profile-service.ts:25` | 未发现直接路由调用；需追踪间接/内部用途 |
| `getCreatorProfile` | `apps/web/server/creator-profile-service.ts:36` | GET /api/creator-profile；PUT /api/creator-profile |
| `saveCreatorWritingPreference` | `apps/web/server/creator-profile-service.ts:41` | PATCH /api/projects/[id]/assistant；GET /api/projects/[id]/assistant；POST /api/projects/[id]/assistant |
| `saveCreatorProfile` | `apps/web/server/creator-profile-service.ts:52` | GET /api/creator-profile；PUT /api/creator-profile |
| `getDashboardCounts` | `apps/web/server/dashboard.ts:3` | 未发现直接路由调用；需追踪间接/内部用途 |
| `getDashboardWork` | `apps/web/server/dashboard.ts:13` | 未发现直接路由调用；需追踪间接/内部用途 |
| `deepContentApiError` | `apps/web/server/deep-content/api.ts:9` | POST /api/projects/[id]/deep-content-package/apply；POST /api/projects/[id]/deep-content-package/generate；GET /api/projects/[id]/deep-content-package；PUT /api/projects/[id]/deep-content-package；POST /api/projects/[id]/gpt-task-package/copied；GET /api/projects/[id]/gpt-task-package；POST /api/projects/[id]/import-gpt-draft |
| `importGPTWebDraft` | `apps/web/server/deep-content/gpt-draft-import.ts:7` | POST /api/projects/[id]/import-gpt-draft |
| `renderGPTTaskPackage` | `apps/web/server/deep-content/gpt-task-package.ts:16` | 未发现直接路由调用；需追踪间接/内部用途 |
| `getGPTTaskPackage` | `apps/web/server/deep-content/gpt-task-package.ts:80` | GET /api/projects/[id]/gpt-task-package |
| `recordGPTTaskPackageCopied` | `apps/web/server/deep-content/gpt-task-package.ts:86` | POST /api/projects/[id]/gpt-task-package/copied |
| `normalizeDeepPackageGrounding` | `apps/web/server/deep-content/service.ts:17` | 未发现直接路由调用；需追踪间接/内部用途 |
| `getDeepContentPackage` | `apps/web/server/deep-content/service.ts:48` | GET /api/projects/[id]/deep-content-package；PUT /api/projects/[id]/deep-content-package |
| `generateDeepContentPackagePreview` | `apps/web/server/deep-content/service.ts:54` | POST /api/projects/[id]/deep-content-package/generate |
| `applyDeepContentPackagePreview` | `apps/web/server/deep-content/service.ts:79` | POST /api/projects/[id]/deep-content-package/apply |
| `updateDeepContentPackage` | `apps/web/server/deep-content/service.ts:104` | GET /api/projects/[id]/deep-content-package；PUT /api/projects/[id]/deep-content-package |
| `buildDefaultContentMethodSourceIndex` | `apps/web/server/default-content-method/generation.ts:38` | 未发现直接路由调用；需追踪间接/内部用途 |
| `buildDefaultContentMethodPrompt` | `apps/web/server/default-content-method/generation.ts:97` | 未发现直接路由调用；需追踪间接/内部用途 |
| `sanitizeDefaultContentMethodGeneration` | `apps/web/server/default-content-method/generation.ts:114` | 未发现直接路由调用；需追踪间接/内部用途 |
| `generateDefaultContentMethodCandidate` | `apps/web/server/default-content-method/generation.ts:149` | GET /api/methods/default；POST /api/methods/default；PUT /api/methods/default；PATCH /api/methods/default |
| `getInternalKnowledgeV1DryRun` | `apps/web/server/default-content-method/internal-knowledge-v1.ts:68` | 未发现直接路由调用；需追踪间接/内部用途 |
| `getDefaultContentMethodReadiness` | `apps/web/server/default-content-method/schemas.ts:57` | 未发现直接路由调用；需追踪间接/内部用途 |
| `emptyDefaultContentMethodSections` | `apps/web/server/default-content-method/schemas.ts:65` | 未发现直接路由调用；需追踪间接/内部用途 |
| `parseDefaultContentMethodPayload` | `apps/web/server/default-content-method/schemas.ts:69` | 未发现直接路由调用；需追踪间接/内部用途 |
| `isDefaultContentMethodPayload` | `apps/web/server/default-content-method/schemas.ts:73` | 未发现直接路由调用；需追踪间接/内部用途 |
| `assertDefaultContentMethodEditor` | `apps/web/server/default-content-method/service.ts:116` | 未发现直接路由调用；需追踪间接/内部用途 |
| `getDefaultContentMethod` | `apps/web/server/default-content-method/service.ts:126` | GET /api/methods/default；POST /api/methods/default；PUT /api/methods/default；PATCH /api/methods/default |
| `getPublishedDefaultContentMethodForStudio` | `apps/web/server/default-content-method/service.ts:132` | 未发现直接路由调用；需追踪间接/内部用途 |
| `createDefaultContentMethodDraft` | `apps/web/server/default-content-method/service.ts:139` | GET /api/methods/default；POST /api/methods/default；PUT /api/methods/default；PATCH /api/methods/default |
| `saveDefaultContentMethodDraft` | `apps/web/server/default-content-method/service.ts:160` | GET /api/methods/default；POST /api/methods/default；PUT /api/methods/default；PATCH /api/methods/default |
| `publishDefaultContentMethod` | `apps/web/server/default-content-method/service.ts:178` | GET /api/methods/default；POST /api/methods/default；PUT /api/methods/default；PATCH /api/methods/default |
| `deleteDefaultContentMethod` | `apps/web/server/default-content-method/service.ts:197` | 未发现直接路由调用；需追踪间接/内部用途 |
| `validateAccountReportOutput` | `apps/web/server/discovery/account-report-contract.ts:10` | 未发现直接路由调用；需追踪间接/内部用途 |
| `buildAccountReportContract` | `apps/web/server/discovery/account-report-contract.ts:15` | GET /api/discovery/benchmarks/[id]/report |
| `median` | `apps/web/server/discovery/account-report-tables.ts:3` | 未发现直接路由调用；需追踪间接/内部用途 |
| `buildAccountReportTables` | `apps/web/server/discovery/account-report-tables.ts:11` | 未发现直接路由调用；需追踪间接/内部用途 |
| `discoveryApiError` | `apps/web/server/discovery/api.ts:9` | PATCH /api/discovery/benchmarks/[id]/organization；GET /api/discovery/benchmarks/[id]；DELETE /api/discovery/benchmarks/[id]；GET /api/discovery/benchmarks；POST /api/discovery/benchmarks；POST /api/discovery/collect；POST /api/discovery/ideas/[id]/references；GET /api/discovery/ideas/[id]；PATCH /api/discovery/ideas/[id]；POST /api/discovery/ideas/[id]/start；GET /api/discovery/ideas；POST /api/discovery/ideas；POST /api/discovery/projects；POST /api/discovery/search；POST /api/research/benchmarks/[id]/sync；POST /api/research/benchmarks/[id]/works/[workId]/collect；POST /api/research/trends/[stableKey]/related |
| `buildBenchmarkCohortRadar` | `apps/web/server/discovery/benchmark-cohort.ts:15` | 未发现直接路由调用；需追踪间接/内部用途 |
| `resolveBenchmarkCollectionRange` | `apps/web/server/discovery/benchmark-collection-contract.ts:14` | 未发现直接路由调用；需追踪间接/内部用途 |
| `isPublishedInBenchmarkRange` | `apps/web/server/discovery/benchmark-collection-contract.ts:40` | 未发现直接路由调用；需追踪间接/内部用途 |
| `createBenchmarkCollectionRun` | `apps/web/server/discovery/benchmark-collection-service.ts:37` | GET /api/discovery/benchmarks/[id]/collection-runs；POST /api/discovery/benchmarks/[id]/collection-runs |
| `listBenchmarkCollectionRuns` | `apps/web/server/discovery/benchmark-collection-service.ts:80` | GET /api/discovery/benchmarks/[id]/collection-runs；POST /api/discovery/benchmarks/[id]/collection-runs |
| `getBenchmarkCollectionRun` | `apps/web/server/discovery/benchmark-collection-service.ts:85` | GET /api/discovery/benchmarks/[id]/collection-runs/[runId] |
| `getBenchmarkCreatorDetail` | `apps/web/server/discovery/benchmark-creator-read-model.ts:31` | GET /api/discovery/benchmarks/[id]/report |
| `importBenchmarkComments` | `apps/web/server/discovery/benchmark-inputs.ts:26` | GET /api/discovery/benchmarks/[id]/inputs；POST /api/discovery/benchmarks/[id]/inputs |
| `getBenchmarkInputs` | `apps/web/server/discovery/benchmark-inputs.ts:49` | GET /api/discovery/benchmarks/[id]/inputs；POST /api/discovery/benchmarks/[id]/inputs |
| `buildBenchmarkPerformance` | `apps/web/server/discovery/benchmark-performance.ts:7` | 未发现直接路由调用；需追踪间接/内部用途 |
| `buildBenchmarkReport` | `apps/web/server/discovery/benchmark-report.ts:10` | 未发现直接路由调用；需追踪间接/内部用途 |
| `listBenchmarkCandidates` | `apps/web/server/discovery/benchmark-study-service.ts:174` | 未发现直接路由调用；需追踪间接/内部用途 |
| `listBenchmarkStudies` | `apps/web/server/discovery/benchmark-study-service.ts:266` | GET /api/discovery/benchmarks/[id]/studies；POST /api/discovery/benchmarks/[id]/studies |
| `getBenchmarkStudy` | `apps/web/server/discovery/benchmark-study-service.ts:270` | 未发现直接路由调用；需追踪间接/内部用途 |
| `createBenchmarkStudy` | `apps/web/server/discovery/benchmark-study-service.ts:279` | GET /api/discovery/benchmarks/[id]/studies；POST /api/discovery/benchmarks/[id]/studies |
| `createBenchmarkPlaybookStudy` | `apps/web/server/discovery/benchmark-study-service.ts:324` | GET /api/discovery/benchmarks/[id]/studies；POST /api/discovery/benchmarks/[id]/studies |
| `createBenchmarkCreatorProfileStudy` | `apps/web/server/discovery/benchmark-study-service.ts:387` | GET /api/discovery/benchmarks/[id]/studies；POST /api/discovery/benchmarks/[id]/studies |
| `validateCommentReferences` | `apps/web/server/discovery/comment-analysis-schema.ts:11` | 未发现直接路由调用；需追踪间接/内部用途 |
| `analyzeBenchmarkComments` | `apps/web/server/discovery/comment-analysis.ts:10` | POST /api/discovery/benchmarks/[id]/comments/analyze |
| `collectF2Comments` | `apps/web/server/discovery/f2-collector.ts:27` | POST /api/discovery/benchmarks/[id]/comments/collect |
| `recommendationApiError` | `apps/web/server/discovery/recommendations/api.ts:6` | GET /api/discovery/recommendations/[id]；POST /api/discovery/recommendations/[id]；GET /api/discovery/recommendations；POST /api/discovery/recommendations |
| `buildRecommendationContext` | `apps/web/server/discovery/recommendations/context-builder.ts:17` | 未发现直接路由调用；需追踪间接/内部用途 |
| `getCurrentRecommendationBatch` | `apps/web/server/discovery/recommendations/service.ts:43` | GET /api/discovery/recommendations；POST /api/discovery/recommendations |
| `generateRecommendationBatch` | `apps/web/server/discovery/recommendations/service.ts:65` | GET /api/discovery/recommendations；POST /api/discovery/recommendations |
| `getRecommendationItem` | `apps/web/server/discovery/recommendations/service.ts:111` | GET /api/discovery/recommendations/[id]；POST /api/discovery/recommendations/[id] |
| `actOnRecommendation` | `apps/web/server/discovery/recommendations/service.ts:148` | GET /api/discovery/recommendations/[id]；POST /api/discovery/recommendations/[id] |
| `getResearchLibrary` | `apps/web/server/discovery/research-library.ts:21` | 未发现直接路由调用；需追踪间接/内部用途 |
| `updateResearchOrganization` | `apps/web/server/discovery/research-library.ts:39` | PATCH /api/discovery/benchmarks/[id]/organization |
| `searchDiscoveryContent` | `apps/web/server/discovery/service.ts:135` | POST /api/discovery/search；POST /api/discovery/trends/[key]/related；POST /api/research/trends/[stableKey]/related |
| `searchDiscoveryAccounts` | `apps/web/server/discovery/service.ts:168` | POST /api/discovery/search |
| `getDiscoveryContentDetail` | `apps/web/server/discovery/service.ts:190` | POST /api/discovery/search |
| `getDiscoveryAccountDetail` | `apps/web/server/discovery/service.ts:216` | POST /api/discovery/search |
| `getBenchmarkWorks` | `apps/web/server/discovery/service.ts:232` | GET /api/discovery/benchmarks/[id]；DELETE /api/discovery/benchmarks/[id]；POST /api/research/benchmarks/[id]/sync |
| `listBenchmarks` | `apps/web/server/discovery/service.ts:292` | GET /api/discovery/benchmarks；POST /api/discovery/benchmarks |
| `addBenchmark` | `apps/web/server/discovery/service.ts:301` | GET /api/discovery/benchmarks；POST /api/discovery/benchmarks |
| `disableBenchmark` | `apps/web/server/discovery/service.ts:328` | GET /api/discovery/benchmarks/[id]；DELETE /api/discovery/benchmarks/[id] |
| `listIdeas` | `apps/web/server/discovery/service.ts:337` | GET /api/discovery/ideas；POST /api/discovery/ideas |
| `getIdea` | `apps/web/server/discovery/service.ts:346` | GET /api/discovery/ideas/[id]；PATCH /api/discovery/ideas/[id] |
| `createIdea` | `apps/web/server/discovery/service.ts:350` | GET /api/discovery/ideas；POST /api/discovery/ideas；POST /api/research/sources/[id]/topic |
| `addIdeaReference` | `apps/web/server/discovery/service.ts:381` | POST /api/discovery/ideas/[id]/references |
| `updateIdea` | `apps/web/server/discovery/service.ts:392` | GET /api/discovery/ideas/[id]；PATCH /api/discovery/ideas/[id] |
| `collectExternalContent` | `apps/web/server/discovery/service.ts:400` | POST /api/discovery/collect |
| `createProjectFromExternalContent` | `apps/web/server/discovery/service.ts:441` | POST /api/discovery/projects |
| `startIdeaProject` | `apps/web/server/discovery/service.ts:448` | POST /api/discovery/ideas/[id]/start |
| `clearDiscoveryCacheForTests` | `apps/web/server/discovery/service.ts:494` | 未发现直接路由调用；需追踪间接/内部用途 |
| `trendApiError` | `apps/web/server/discovery/trends/api.ts:6` | POST /api/discovery/trends/[key]/ideas；POST /api/discovery/trends/[key]/related；POST /api/discovery/trends/[key]/topics；GET /api/discovery/trends；POST /api/discovery/trends |
| `publicTrendOpportunity` | `apps/web/server/discovery/trends/read-model.ts:47` | 未发现直接路由调用；需追踪间接/内部用途 |
| `trendWindowRange` | `apps/web/server/discovery/trends/read-model.ts:56` | 未发现直接路由调用；需追踪间接/内部用途 |
| `listTrendOpportunities` | `apps/web/server/discovery/trends/read-model.ts:162` | GET /api/discovery/trends；POST /api/discovery/trends |
| `getTrendOpportunity` | `apps/web/server/discovery/trends/read-model.ts:189` | POST /api/discovery/trends/[key]/related |
| `normalizeOpportunityKey` | `apps/web/server/discovery/trends/read-model.ts:200` | 未发现直接路由调用；需追踪间接/内部用途 |
| `decodeTrendOpportunityKey` | `apps/web/server/discovery/trends/read-model.ts:204` | POST /api/discovery/trends/[key]/ideas；POST /api/discovery/trends/[key]/related；POST /api/discovery/trends/[key]/topics |
| `refreshTrends` | `apps/web/server/discovery/trends/service.ts:90` | GET /api/discovery/trends；POST /api/discovery/trends |
| `clearTrendCacheForTests` | `apps/web/server/discovery/trends/service.ts:136` | 未发现直接路由调用；需追踪间接/内部用途 |
| `generateTopicCandidates` | `apps/web/server/discovery/trends/topic-service.ts:31` | POST /api/discovery/trends/[key]/topics |
| `saveManualTrendIdea` | `apps/web/server/discovery/trends/topic-service.ts:169` | POST /api/discovery/trends/[key]/ideas |
| `saveCandidateTrendIdea` | `apps/web/server/discovery/trends/topic-service.ts:173` | POST /api/discovery/trends/[key]/ideas |
| `draftApiError` | `apps/web/server/drafts/api.ts:4` | POST /api/projects/[id]/drafts/[draftId]/checkpoint；POST /api/projects/[id]/drafts/[draftId]/confirm；GET /api/projects/[id]/drafts/[draftId]/history；POST /api/projects/[id]/drafts/[draftId]/primary；GET /api/projects/[id]/drafts/[draftId]；PUT /api/projects/[id]/drafts/[draftId]；PATCH /api/projects/[id]/drafts/[draftId]；DELETE /api/projects/[id]/drafts/[draftId]；GET /api/projects/[id]/drafts；POST /api/projects/[id]/drafts |
| `writeDraftRevisionInTransaction` | `apps/web/server/drafts/service.ts:193` | 未发现直接路由调用；需追踪间接/内部用途 |
| `listDraftBranches` | `apps/web/server/drafts/service.ts:221` | GET /api/projects/[id]/drafts；POST /api/projects/[id]/drafts |
| `getDraftBranch` | `apps/web/server/drafts/service.ts:227` | POST /api/projects/[id]/drafts/[draftId]/confirm；GET /api/projects/[id]/drafts/[draftId]；PUT /api/projects/[id]/drafts/[draftId]；PATCH /api/projects/[id]/drafts/[draftId]；DELETE /api/projects/[id]/drafts/[draftId] |
| `getPrimaryDraft` | `apps/web/server/drafts/service.ts:234` | 未发现直接路由调用；需追踪间接/内部用途 |
| `getDraftHistory` | `apps/web/server/drafts/service.ts:240` | GET /api/projects/[id]/drafts/[draftId]/history |
| `createDraftBranch` | `apps/web/server/drafts/service.ts:246` | GET /api/projects/[id]/drafts；POST /api/projects/[id]/drafts |
| `createDraftRevision` | `apps/web/server/drafts/service.ts:265` | 未发现直接路由调用；需追踪间接/内部用途 |
| `saveDraftWorkingState` | `apps/web/server/drafts/service.ts:272` | GET /api/projects/[id]/drafts/[draftId]；PUT /api/projects/[id]/drafts/[draftId]；PATCH /api/projects/[id]/drafts/[draftId]；DELETE /api/projects/[id]/drafts/[draftId] |
| `checkpointDraftBranch` | `apps/web/server/drafts/service.ts:301` | POST /api/projects/[id]/drafts/[draftId]/checkpoint |
| `renameDraftBranch` | `apps/web/server/drafts/service.ts:311` | GET /api/projects/[id]/drafts/[draftId]；PUT /api/projects/[id]/drafts/[draftId]；PATCH /api/projects/[id]/drafts/[draftId]；DELETE /api/projects/[id]/drafts/[draftId] |
| `setPrimaryDraftBranch` | `apps/web/server/drafts/service.ts:325` | POST /api/projects/[id]/drafts/[draftId]/primary |
| `softDeleteDraftBranch` | `apps/web/server/drafts/service.ts:348` | GET /api/projects/[id]/drafts/[draftId]；PUT /api/projects/[id]/drafts/[draftId]；PATCH /api/projects/[id]/drafts/[draftId]；DELETE /api/projects/[id]/drafts/[draftId] |
| `confirmDraftRevision` | `apps/web/server/drafts/service.ts:361` | POST /api/projects/[id]/drafts/[draftId]/confirm |
| `savePrimaryDraftFromLegacy` | `apps/web/server/drafts/service.ts:385` | 未发现直接路由调用；需追踪间接/内部用途 |
| `startEmbeddedWorker` | `apps/web/server/embedded-worker.ts:9` | 未发现直接路由调用；需追踪间接/内部用途 |
| `createEvidence` | `apps/web/server/evidence-service.ts:31` | POST /api/projects/[id]/evidence |
| `updateEvidence` | `apps/web/server/evidence-service.ts:69` | PATCH /api/projects/[id]/evidence/[evidenceId]；DELETE /api/projects/[id]/evidence/[evidenceId] |
| `moveEvidence` | `apps/web/server/evidence-service.ts:109` | PATCH /api/projects/[id]/evidence/[evidenceId]；DELETE /api/projects/[id]/evidence/[evidenceId] |
| `deleteEvidence` | `apps/web/server/evidence-service.ts:144` | PATCH /api/projects/[id]/evidence/[evidenceId]；DELETE /api/projects/[id]/evidence/[evidenceId] |
| `isExperienceAccount` | `apps/web/server/experience-account.ts:1` | GET /api/creator-profile；PUT /api/creator-profile；PATCH /api/creator-profile/suggestions/[suggestionId]；GET /api/creator-profile/suggestions；POST /api/creator-profile/suggestions；POST /api/settings/workspace；PATCH /api/settings/workspace |
| `canAddResearchAccount` | `apps/web/server/experience-account.ts:4` | GET /api/discovery/benchmarks；POST /api/discovery/benchmarks；POST /api/research/benchmarks/[id]/sync；POST /api/research/benchmarks/import |
| `startFeishuScheduler` | `apps/web/server/feishu/runtime.ts:8` | 未发现直接路由调用；需追踪间接/内部用途 |
| `configurableProviderOrResponse` | `apps/web/server/integration-api.ts:12` | POST /api/integrations/[provider]/disable；POST /api/integrations/[provider]/enable；GET /api/integrations/[provider]；PUT /api/integrations/[provider]；DELETE /api/integrations/[provider]；POST /api/integrations/[provider]/test |
| `integrationApiError` | `apps/web/server/integration-api.ts:20` | GET /api/admin/system/providers/[provider]；PUT /api/admin/system/providers/[provider]；POST /api/integrations/[provider]/disable；POST /api/integrations/[provider]/enable；GET /api/integrations/[provider]；PUT /api/integrations/[provider]；DELETE /api/integrations/[provider]；POST /api/integrations/[provider]/test；GET /api/integrations/LLM/models |
| `noContent` | `apps/web/server/integration-api.ts:34` | GET /api/integrations/[provider]；PUT /api/integrations/[provider]；DELETE /api/integrations/[provider] |
| `testIntegration` | `apps/web/server/integration-test.ts:6` | POST /api/integrations/[provider]/test |
| `getIntegrationStatuses` | `apps/web/server/integrations.ts:64` | GET /api/integrations |
| `getIntegrationDisplay` | `apps/web/server/integrations.ts:99` | GET /api/integrations/[provider]；PUT /api/integrations/[provider]；DELETE /api/integrations/[provider] |
| `integrationVisibleToRole` | `apps/web/server/integrations.ts:103` | GET /api/integrations/[provider]；PUT /api/integrations/[provider]；DELETE /api/integrations/[provider]；GET /api/integrations |
| `isDirectSignupRequest` | `apps/web/server/internal-signup.ts:14` | 未发现直接路由调用；需追踪间接/内部用途 |
| `inviteCodeMatches` | `apps/web/server/internal-signup.ts:18` | 未发现直接路由调用；需追踪间接/内部用途 |
| `registerInternalUser` | `apps/web/server/internal-signup.ts:25` | POST /api/internal-signup |
| `browseFeishuWiki` | `apps/web/server/knowledge/feishu-browse.ts:10` | POST /api/feishu/browse |
| `feishuContextItems` | `apps/web/server/knowledge/feishu-context.ts:13` | 未发现直接路由调用；需追踪间接/内部用途 |
| `feishuLinks` | `apps/web/server/knowledge/feishu-context.ts:33` | 未发现直接路由调用；需追踪间接/内部用途 |
| `learningSuggestionApiError` | `apps/web/server/learning-suggestions/api.ts:4` | PATCH /api/creator-profile/suggestions/[suggestionId]；GET /api/creator-profile/suggestions；POST /api/creator-profile/suggestions；PATCH /api/discovery/benchmarks/[id]/method-suggestions/[suggestionId]；GET /api/discovery/benchmarks/[id]/method-suggestions；POST /api/discovery/benchmarks/[id]/method-suggestions |
| `listMethodSuggestions` | `apps/web/server/learning-suggestions/service.ts:47` | GET /api/discovery/benchmarks/[id]/method-suggestions；POST /api/discovery/benchmarks/[id]/method-suggestions |
| `generateMethodSuggestions` | `apps/web/server/learning-suggestions/service.ts:53` | GET /api/discovery/benchmarks/[id]/method-suggestions；POST /api/discovery/benchmarks/[id]/method-suggestions |
| `decideMethodSuggestion` | `apps/web/server/learning-suggestions/service.ts:74` | PATCH /api/discovery/benchmarks/[id]/method-suggestions/[suggestionId] |
| `listCreatorProfileSuggestions` | `apps/web/server/learning-suggestions/service.ts:89` | GET /api/creator-profile/suggestions；POST /api/creator-profile/suggestions |
| `generateCreatorProfileSuggestions` | `apps/web/server/learning-suggestions/service.ts:94` | GET /api/creator-profile/suggestions；POST /api/creator-profile/suggestions |
| `decideCreatorProfileSuggestion` | `apps/web/server/learning-suggestions/service.ts:116` | PATCH /api/creator-profile/suggestions/[suggestionId] |
| `listLibrarySources` | `apps/web/server/library.ts:22` | GET /api/source-items；POST /api/source-items |
| `getLocalAsrDisplay` | `apps/web/server/local-asr.ts:57` | GET /api/local-asr/status |
| `initializeLocalAsrModel` | `apps/web/server/local-asr.ts:82` | POST /api/local-asr/models/initialize |
| `nativeDirectoryPickerAvailable` | `apps/web/server/local-directory-picker.ts:7` | GET /api/settings/storage；POST /api/settings/storage |
| `signDirectorySelection` | `apps/web/server/local-directory-picker.ts:15` | 未发现直接路由调用；需追踪间接/内部用途 |
| `verifyDirectorySelection` | `apps/web/server/local-directory-picker.ts:19` | GET /api/settings/storage；POST /api/settings/storage |
| `pickLocalDirectory` | `apps/web/server/local-directory-picker.ts:30` | GET /api/settings/storage；POST /api/settings/storage |
| `localStorageEnabled` | `apps/web/server/local-storage.ts:11` | GET /api/settings/storage；POST /api/settings/storage |
| `localStorageBase` | `apps/web/server/local-storage.ts:12` | 未发现直接路由调用；需追踪间接/内部用途 |
| `checkedStoragePath` | `apps/web/server/local-storage.ts:25` | 未发现直接路由调用；需追踪间接/内部用途 |
| `localWorkspaceRoot` | `apps/web/server/local-storage.ts:51` | 未发现直接路由调用；需追踪间接/内部用途 |
| `mediaFilePath` | `apps/web/server/local-storage.ts:62` | GET /api/internal/media-storage/[assetId]；PUT /api/internal/media-storage/[assetId]；DELETE /api/internal/media-storage/[assetId]；GET /api/media/[token] |
| `inspectLocalStorage` | `apps/web/server/local-storage.ts:96` | GET /api/settings/storage；POST /api/settings/storage |
| `probeLocalStorage` | `apps/web/server/local-storage.ts:104` | GET /api/settings/storage；POST /api/settings/storage |
| `relocateLocalStorage` | `apps/web/server/local-storage.ts:114` | GET /api/settings/storage；POST /api/settings/storage |
| `validateLocalFolder` | `apps/web/server/local-storage.ts:152` | 未发现直接路由调用；需追踪间接/内部用途 |
| `materialAnalysisApiError` | `apps/web/server/material-analysis/api.ts:6` | PUT /api/source-items/[id]/material-analysis/[analysisId]；POST /api/source-items/[id]/material-analysis/project；GET /api/source-items/[id]/material-analysis；POST /api/source-items/[id]/material-analysis |
| `readMaterialAnalysisBriefMetadata` | `apps/web/server/material-analysis/brief-mapper.ts:83` | 未发现直接路由调用；需追踪间接/内部用途 |
| `buildMaterialAnalysisContext` | `apps/web/server/material-analysis/context-builder.ts:16` | 未发现直接路由调用；需追踪间接/内部用途 |
| `toMaterialAnalysisDTO` | `apps/web/server/material-analysis/service.ts:59` | 未发现直接路由调用；需追踪间接/内部用途 |
| `getMaterialAnalysis` | `apps/web/server/material-analysis/service.ts:101` | GET /api/source-items/[id]/material-analysis；POST /api/source-items/[id]/material-analysis |
| `requestMaterialAnalysis` | `apps/web/server/material-analysis/service.ts:126` | GET /api/source-items/[id]/material-analysis；POST /api/source-items/[id]/material-analysis |
| `updateMaterialAnalysis` | `apps/web/server/material-analysis/service.ts:145` | PUT /api/source-items/[id]/material-analysis/[analysisId] |
| `createProjectFromMaterial` | `apps/web/server/material-analysis/service.ts:176` | POST /api/source-items/[id]/material-analysis/project |
| `getSourceWorkspaceModel` | `apps/web/server/material-detail/read-model.ts:118` | 未发现直接路由调用；需追踪间接/内部用途 |
| `getMaterialReadableContent` | `apps/web/server/material-detail/readable-content.ts:8` | 未发现直接路由调用；需追踪间接/内部用途 |
| `getMaterialDetailView` | `apps/web/server/material-detail/service.ts:192` | 未发现直接路由调用；需追踪间接/内部用途 |
| `getVisionRoute` | `apps/web/server/material-detail/understanding.ts:31` | 未发现直接路由调用；需追踪间接/内部用途 |
| `understandingExpired` | `apps/web/server/material-detail/understanding.ts:37` | GET /api/source-items/[id]/processing |
| `readUnderstandingAsset` | `apps/web/server/material-detail/understanding.ts:42` | 未发现直接路由调用；需追踪间接/内部用途 |
| `understandSource` | `apps/web/server/material-detail/understanding.ts:64` | POST /api/source-items/[id]/understanding |
| `toMaterialDistillationDTO` | `apps/web/server/material-distillation/service.ts:56` | 未发现直接路由调用；需追踪间接/内部用途 |
| `getMaterialDistillation` | `apps/web/server/material-distillation/service.ts:70` | GET /api/source-items/[id]/distillation；POST /api/source-items/[id]/distillation |
| `requestMaterialDistillation` | `apps/web/server/material-distillation/service.ts:100` | GET /api/source-items/[id]/distillation；POST /api/source-items/[id]/distillation |
| `materialKnowledgeApiError` | `apps/web/server/material-knowledge/api.ts:5` | PATCH /api/source-items/[id]/knowledge/candidates/[candidateId]；GET /api/source-items/[id]/knowledge；POST /api/source-items/[id]/knowledge |
| `resolveMaterialOwnership` | `apps/web/server/material-knowledge/service.ts:29` | 未发现直接路由调用；需追踪间接/内部用途 |
| `getMaterialKnowledge` | `apps/web/server/material-knowledge/service.ts:42` | GET /api/source-items/[id]/knowledge；POST /api/source-items/[id]/knowledge |
| `extractMaterialKnowledge` | `apps/web/server/material-knowledge/service.ts:53` | GET /api/source-items/[id]/knowledge；POST /api/source-items/[id]/knowledge |
| `decideMaterialCandidate` | `apps/web/server/material-knowledge/service.ts:78` | PATCH /api/source-items/[id]/knowledge/candidates/[candidateId] |
| `listMethods` | `apps/web/server/methods/service.ts:208` | GET /api/methods；POST /api/methods |
| `previewWorkflowSkill` | `apps/web/server/methods/service.ts:217` | POST /api/methods/import |
| `importWorkflowSkill` | `apps/web/server/methods/service.ts:221` | POST /api/methods/import |
| `getMethod` | `apps/web/server/methods/service.ts:247` | GET /api/methods/[id]；PUT /api/methods/[id]；PATCH /api/methods/[id]；DELETE /api/methods/[id] |
| `createMethodFromAnalysis` | `apps/web/server/methods/service.ts:258` | GET /api/methods；POST /api/methods |
| `createMethodFromBenchmarkStudy` | `apps/web/server/methods/service.ts:320` | GET /api/methods；POST /api/methods |
| `createMethodFromDistillation` | `apps/web/server/methods/service.ts:378` | GET /api/methods；POST /api/methods |
| `updateMethodContent` | `apps/web/server/methods/service.ts:418` | GET /api/methods/[id]；PUT /api/methods/[id]；PATCH /api/methods/[id]；DELETE /api/methods/[id] |
| `updateMethodStatus` | `apps/web/server/methods/service.ts:453` | GET /api/methods/[id]；PUT /api/methods/[id]；PATCH /api/methods/[id]；DELETE /api/methods/[id] |
| `deleteMethod` | `apps/web/server/methods/service.ts:469` | GET /api/methods/[id]；PUT /api/methods/[id]；PATCH /api/methods/[id]；DELETE /api/methods/[id] |
| `saveMotherContent` | `apps/web/server/mother-content-service.ts:36` | GET /api/projects/[id]/mother-content；PUT /api/projects/[id]/mother-content |
| `saveMotherWarningConfirmations` | `apps/web/server/mother-content-service.ts:61` | PUT /api/projects/[id]/mother-content/confirmation |
| `confirmMotherContent` | `apps/web/server/mother-content-service.ts:68` | POST /api/projects/[id]/mother-content/confirm |
| `listMotherContentVersions` | `apps/web/server/mother-content-service.ts:87` | GET /api/projects/[id]/mother-content；PUT /api/projects/[id]/mother-content |
| `getPlatformAdapter` | `apps/web/server/platforms/adapters.ts:96` | 未发现直接路由调用；需追踪间接/内部用途 |
| `platformApiError` | `apps/web/server/platforms/platform-api.ts:8` | POST /api/projects/[id]/platform-variants/[platform]/apply；GET /api/projects/[id]/platform-variants/[platform]；PUT /api/projects/[id]/platform-variants/[platform]；POST /api/projects/[id]/platform-variants/generate；GET /api/projects/[id]/platform-variants |
| `buildPlatformContext` | `apps/web/server/platforms/platform-context.ts:10` | 未发现直接路由调用；需追踪间接/内部用途 |
| `selectPlatformTemplate` | `apps/web/server/platforms/platform-template-service.ts:6` | 未发现直接路由调用；需追踪间接/内部用途 |
| `listPlatformVariants` | `apps/web/server/platforms/platform-variant-service.ts:41` | GET /api/projects/[id]/platform-variants |
| `getPlatformVariant` | `apps/web/server/platforms/platform-variant-service.ts:48` | GET /api/projects/[id]/platform-variants/[platform]；PUT /api/projects/[id]/platform-variants/[platform] |
| `generatePlatformPreviews` | `apps/web/server/platforms/platform-variant-service.ts:54` | POST /api/projects/[id]/platform-variants/generate |
| `applyPlatformPreview` | `apps/web/server/platforms/platform-variant-service.ts:77` | POST /api/projects/[id]/platform-variants/[platform]/apply |
| `updatePlatformVariant` | `apps/web/server/platforms/platform-variant-service.ts:102` | GET /api/projects/[id]/platform-variants/[platform]；PUT /api/projects/[id]/platform-variants/[platform] |
| `projectApiError` | `apps/web/server/project-api.ts:7` | PUT /api/projects/[id]/brief；PATCH /api/projects/[id]/evidence/[evidenceId]；DELETE /api/projects/[id]/evidence/[evidenceId]；POST /api/projects/[id]/evidence；GET /api/projects/[id]/mother-content；PUT /api/projects/[id]/mother-content；POST /api/projects/[id]/restore；GET /api/projects/[id]；PATCH /api/projects/[id]；DELETE /api/projects/[id]；DELETE /api/projects/[id]/sources/[sourceId]；POST /api/projects/[id]/sources；POST /api/projects/[id]/transition；GET /api/projects；POST /api/projects |
| `getProjectMethodState` | `apps/web/server/project-methods/service.ts:98` | GET /api/projects/[id]/methods；PUT /api/projects/[id]/methods |
| `setProjectMethodSelections` | `apps/web/server/project-methods/service.ts:114` | GET /api/projects/[id]/methods；PUT /api/projects/[id]/methods |
| `getSelectedGenerationMethods` | `apps/web/server/project-methods/service.ts:131` | 未发现直接路由调用；需追踪间接/内部用途 |
| `recordSelectedMethodUsages` | `apps/web/server/project-methods/service.ts:142` | 未发现直接路由调用；需追踪间接/内部用途 |
| `recordGenerationMethodUsages` | `apps/web/server/project-methods/service.ts:146` | 未发现直接路由调用；需追踪间接/内部用途 |
| `listProjects` | `apps/web/server/project-service.ts:50` | GET /api/projects；POST /api/projects |
| `getProjectForUser` | `apps/web/server/project-service.ts:108` | GET /api/projects/[id]；PATCH /api/projects/[id]；DELETE /api/projects/[id] |
| `createProject` | `apps/web/server/project-service.ts:112` | GET /api/projects；POST /api/projects |
| `updateProject` | `apps/web/server/project-service.ts:251` | GET /api/projects/[id]；PATCH /api/projects/[id]；DELETE /api/projects/[id] |
| `deleteProject` | `apps/web/server/project-service.ts:282` | GET /api/projects/[id]；PATCH /api/projects/[id]；DELETE /api/projects/[id] |
| `addProjectSource` | `apps/web/server/project-service.ts:301` | POST /api/projects/[id]/sources |
| `removeProjectSource` | `apps/web/server/project-service.ts:333` | DELETE /api/projects/[id]/sources/[sourceId] |
| `transitionProjectStatus` | `apps/web/server/project-service.ts:353` | POST /api/projects/[id]/transition |
| `restoreProject` | `apps/web/server/project-service.ts:396` | POST /api/projects/[id]/restore |
| `publishApiError` | `apps/web/server/publishing/publish-api.ts:4` | POST /api/publish-tasks/[id]/cancel；POST /api/publish-tasks/[id]/failed；POST /api/publish-tasks/[id]/package/copied；GET /api/publish-tasks/[id]/package；POST /api/publish-tasks/[id]/published；GET /api/publish-tasks/[id]；PATCH /api/publish-tasks/[id]；POST /api/publish-tasks/[id]/schedule；GET /api/publish-tasks；POST /api/publish-tasks |
| `buildPublishPackage` | `apps/web/server/publishing/publish-package.ts:29` | 未发现直接路由调用；需追踪间接/内部用途 |
| `createPublishTask` | `apps/web/server/publishing/publish-task-service.ts:76` | GET /api/publish-tasks；POST /api/publish-tasks |
| `listPublishTasks` | `apps/web/server/publishing/publish-task-service.ts:107` | GET /api/publish-tasks；POST /api/publish-tasks |
| `listPublishCreators` | `apps/web/server/publishing/publish-task-service.ts:122` | 未发现直接路由调用；需追踪间接/内部用途 |
| `getPublishTask` | `apps/web/server/publishing/publish-task-service.ts:127` | GET /api/publish-tasks/[id]/package；GET /api/publish-tasks/[id]；PATCH /api/publish-tasks/[id] |
| `updatePublishTask` | `apps/web/server/publishing/publish-task-service.ts:152` | GET /api/publish-tasks/[id]；PATCH /api/publish-tasks/[id] |
| `schedulePublishTask` | `apps/web/server/publishing/publish-task-service.ts:158` | POST /api/publish-tasks/[id]/schedule |
| `cancelPublishTask` | `apps/web/server/publishing/publish-task-service.ts:164` | POST /api/publish-tasks/[id]/cancel |
| `failPublishTask` | `apps/web/server/publishing/publish-task-service.ts:170` | POST /api/publish-tasks/[id]/failed |
| `markPublishTaskPublished` | `apps/web/server/publishing/publish-task-service.ts:176` | POST /api/publish-tasks/[id]/published |
| `recordPublishPackageCopied` | `apps/web/server/publishing/publish-task-service.ts:182` | POST /api/publish-tasks/[id]/package/copied |
| `researchMember` | `apps/web/server/research/access.ts:7` | GET /api/research/benchmarks/[id]/works/[workId]/media；POST /api/research/sources/[id]/topic；POST /api/research/trends/[stableKey]/related |
| `personalSessionWhere` | `apps/web/server/research/access.ts:12` | 未发现直接路由调用；需追踪间接/内部用途 |
| `researchSessionForUser` | `apps/web/server/research/access.ts:13` | 未发现直接路由调用；需追踪间接/内部用途 |
| `workMetadataText` | `apps/web/server/research/account-research-analysis.ts:5` | 未发现直接路由调用；需追踪间接/内部用途 |
| `accountResearchFacts` | `apps/web/server/research/account-research-analysis.ts:9` | 未发现直接路由调用；需追踪间接/内部用途 |
| `validateAccountResearchAnswer` | `apps/web/server/research/account-research-analysis.ts:43` | 未发现直接路由调用；需追踪间接/内部用途 |
| `accountResearchPrompt` | `apps/web/server/research/account-research-analysis.ts:147` | 未发现直接路由调用；需追踪间接/内部用途 |
| `parseAccountResearchState` | `apps/web/server/research/account-research-contract.ts:89` | 未发现直接路由调用；需追踪间接/内部用途 |
| `collectAccountResearchEvidence` | `apps/web/server/research/account-research-evidence.ts:13` | 未发现直接路由调用；需追踪间接/内部用途 |
| `planAccountResearch` | `apps/web/server/research/account-research-evidence.ts:54` | 未发现直接路由调用；需追踪间接/内部用途 |
| `accountEvidenceSources` | `apps/web/server/research/account-research-run.ts:18` | 未发现直接路由调用；需追踪间接/内部用途 |
| `accountResearchCoverage` | `apps/web/server/research/account-research-run.ts:29` | 未发现直接路由调用；需追踪间接/内部用途 |
| `renderAccountResearchBlocks` | `apps/web/server/research/account-research-run.ts:37` | 未发现直接路由调用；需追踪间接/内部用途 |
| `executeAccountResearchRun` | `apps/web/server/research/account-research-run.ts:59` | 未发现直接路由调用；需追踪间接/内部用途 |
| `accountResearchSessionKey` | `apps/web/server/research/account-research-service.ts:15` | 未发现直接路由调用；需追踪间接/内部用途 |
| `startAccountResearch` | `apps/web/server/research/account-research-service.ts:22` | POST /api/research/benchmarks/[id]/research |
| `accountResearchOverview` | `apps/web/server/research/account-research-service.ts:36` | 未发现直接路由调用；需追踪间接/内部用途 |
| `accountResearchView` | `apps/web/server/research/account-research-service.ts:60` | 未发现直接路由调用；需追踪间接/内部用途 |
| `accountV2Prompt` | `apps/web/server/research/account-v2-analysis.ts:6` | 未发现直接路由调用；需追踪间接/内部用途 |
| `validateAccountV2Answer` | `apps/web/server/research/account-v2-analysis.ts:18` | 未发现直接路由调用；需追踪间接/内部用途 |
| `parseAccountV2State` | `apps/web/server/research/account-v2-contract.ts:45` | 未发现直接路由调用；需追踪间接/内部用途 |
| `digestWorkDecision` | `apps/web/server/research/account-v2-evidence.ts:10` | 未发现直接路由调用；需追踪间接/内部用途 |
| `collectAccountV2State` | `apps/web/server/research/account-v2-evidence.ts:26` | 未发现直接路由调用；需追踪间接/内部用途 |
| `accountV2Sources` | `apps/web/server/research/account-v2-run.ts:16` | 未发现直接路由调用；需追踪间接/内部用途 |
| `accountV2Coverage` | `apps/web/server/research/account-v2-run.ts:24` | 未发现直接路由调用；需追踪间接/内部用途 |
| `renderAccountV2Blocks` | `apps/web/server/research/account-v2-run.ts:33` | 未发现直接路由调用；需追踪间接/内部用途 |
| `executeAccountV2Run` | `apps/web/server/research/account-v2-run.ts:61` | 未发现直接路由调用；需追踪间接/内部用途 |
| `startAccountV2Research` | `apps/web/server/research/account-v2-service.ts:14` | POST /api/research/benchmarks/[id]/research-v2 |
| `accountV2Overview` | `apps/web/server/research/account-v2-service.ts:32` | 未发现直接路由调用；需追踪间接/内部用途 |
| `researchApiActor` | `apps/web/server/research/api.ts:4` | POST /api/research/benchmarks/[id]/research；POST /api/research/benchmarks/[id]/research-v2；GET /api/research/benchmarks/[id]/works/[workId]/analysis/[runId]/export；POST /api/research/benchmarks/[id]/works/[workId]/analysis/[runId]/prepare-creation；POST /api/research/benchmarks/[id]/works/[workId]/analysis；POST /api/research/benchmarks/[id]/works/[workId]/collect；GET /api/research/benchmarks/[id]/works/[workId]/media；GET /api/research/benchmarks/[id]/works/[workId]；GET /api/research/creation；POST /api/research/creation；POST /api/research/focus-v2；GET /api/research/materials；GET /api/research/news；POST /api/research/news；POST /api/research/preferences；GET /api/research/results/[runId]/share；POST /api/research/results/[runId]/share；POST /api/research/results/study/[studyId]/share；GET /api/research/sessions/[id]；GET /api/research/sessions/[id]/runs/[runId]；POST /api/research/sessions/[id]/runs/[runId]；POST /api/research/sessions/[id]/runs；GET /api/research/sessions；POST /api/research/sessions；POST /api/research/sources/[id]/clippings；POST /api/research/sources/[id]/topic；GET /api/research/teardown/[runId]/export；DELETE /api/research/teardown/[runId]/history；GET /api/research/teardown/[runId]；DELETE /api/research/teardown/[runId]；POST /api/research/teardown/[runId]；GET /api/research/teardown；POST /api/research/teardown；POST /api/research/trends/[stableKey]/opportunity-v2；POST /api/research/trends/[stableKey]/related |
| `researchApiError` | `apps/web/server/research/api.ts:9` | POST /api/research/benchmarks/[id]/research；POST /api/research/benchmarks/[id]/research-v2；GET /api/research/benchmarks/[id]/works/[workId]/analysis/[runId]/export；POST /api/research/benchmarks/[id]/works/[workId]/analysis/[runId]/prepare-creation；POST /api/research/benchmarks/[id]/works/[workId]/analysis；POST /api/research/benchmarks/[id]/works/[workId]/collect；GET /api/research/benchmarks/[id]/works/[workId]/media；GET /api/research/benchmarks/[id]/works/[workId]；POST /api/research/benchmarks/import；GET /api/research/creation；POST /api/research/creation；POST /api/research/focus-v2；GET /api/research/materials；GET /api/research/news；POST /api/research/news；POST /api/research/preferences；GET /api/research/results/[runId]/share；POST /api/research/results/[runId]/share；POST /api/research/results/study/[studyId]/share；GET /api/research/sessions/[id]；GET /api/research/sessions/[id]/runs/[runId]；POST /api/research/sessions/[id]/runs/[runId]；POST /api/research/sessions/[id]/runs；GET /api/research/sessions；POST /api/research/sessions；POST /api/research/sources/[id]/clippings；POST /api/research/sources/[id]/topic；GET /api/research/teardown/[runId]/export；DELETE /api/research/teardown/[runId]/history；GET /api/research/teardown/[runId]；DELETE /api/research/teardown/[runId]；POST /api/research/teardown/[runId]；GET /api/research/teardown；POST /api/research/teardown；POST /api/research/trends/[stableKey]/opportunity-v2；POST /api/research/trends/[stableKey]/related |
| `median` | `apps/web/server/research/benchmark-dossier-math.ts:16` | 未发现直接路由调用；需追踪间接/内部用途 |
| `dossierStatistics` | `apps/web/server/research/benchmark-dossier-math.ts:21` | 未发现直接路由调用；需追踪间接/内部用途 |
| `dossierCsv` | `apps/web/server/research/benchmark-dossier-math.ts:44` | 未发现直接路由调用；需追踪间接/内部用途 |
| `researchBenchmarkDossier` | `apps/web/server/research/benchmark-dossier.ts:19` | 未发现直接路由调用；需追踪间接/内部用途 |
| `researchBenchmarkWork` | `apps/web/server/research/benchmark-dossier.ts:88` | GET /api/research/benchmarks/[id]/works/[workId] |
| `importBenchmarkHomepage` | `apps/web/server/research/benchmark-import.ts:10` | POST /api/research/benchmarks/import |
| `parseBenchmarkHomepage` | `apps/web/server/research/benchmark-workbench-math.ts:2` | 未发现直接路由调用；需追踪间接/内部用途 |
| `metric` | `apps/web/server/research/benchmark-workbench-math.ts:12` | 未发现直接路由调用；需追踪间接/内部用途 |
| `benchmarkBaseline` | `apps/web/server/research/benchmark-workbench-math.ts:13` | 未发现直接路由调用；需追踪间接/内部用途 |
| `safeResearchReturn` | `apps/web/server/research/benchmark-workbench-math.ts:18` | 未发现直接路由调用；需追踪间接/内部用途 |
| `benchmarkWorkbench` | `apps/web/server/research/benchmark-workbench.ts:6` | 未发现直接路由调用；需追踪间接/内部用途 |
| `researchBenchmarkList` | `apps/web/server/research/benchmarks.ts:8` | 未发现直接路由调用；需追踪间接/内部用途 |
| `researchBenchmarkDetail` | `apps/web/server/research/benchmarks.ts:35` | 未发现直接路由调用；需追踪间接/内部用途 |
| `validateResearchAnswer` | `apps/web/server/research/contracts.ts:40` | 未发现直接路由调用；需追踪间接/内部用途 |
| `validateResearchBlocks` | `apps/web/server/research/contracts.ts:57` | 未发现直接路由调用；需追踪间接/内部用途 |
| `focusV2Prompt` | `apps/web/server/research/focus-v2-analysis.ts:5` | 未发现直接路由调用；需追踪间接/内部用途 |
| `validateFocusV2Answer` | `apps/web/server/research/focus-v2-analysis.ts:14` | 未发现直接路由调用；需追踪间接/内部用途 |
| `parseFocusV2State` | `apps/web/server/research/focus-v2-contract.ts:38` | 未发现直接路由调用；需追踪间接/内部用途 |
| `collectFocusV2State` | `apps/web/server/research/focus-v2-evidence.ts:13` | 未发现直接路由调用；需追踪间接/内部用途 |
| `focusV2Sources` | `apps/web/server/research/focus-v2-run.ts:14` | 未发现直接路由调用；需追踪间接/内部用途 |
| `focusV2Coverage` | `apps/web/server/research/focus-v2-run.ts:27` | 未发现直接路由调用；需追踪间接/内部用途 |
| `renderFocusV2Blocks` | `apps/web/server/research/focus-v2-run.ts:36` | 未发现直接路由调用；需追踪间接/内部用途 |
| `executeFocusV2Run` | `apps/web/server/research/focus-v2-run.ts:59` | 未发现直接路由调用；需追踪间接/内部用途 |
| `startFocusV2Research` | `apps/web/server/research/focus-v2-service.ts:17` | POST /api/research/focus-v2 |
| `focusV2Library` | `apps/web/server/research/focus-v2-service.ts:34` | 未发现直接路由调用；需追踪间接/内部用途 |
| `focusV2RunView` | `apps/web/server/research/focus-v2-service.ts:64` | 未发现直接路由调用；需追踪间接/内部用途 |
| `resolveResearchInputs` | `apps/web/server/research/inputs.ts:10` | 未发现直接路由调用；需追踪间接/内部用途 |
| `getLegacyResearchResult` | `apps/web/server/research/legacy.ts:8` | GET /api/research/creation；POST /api/research/creation |
| `researchModeSchema` | `apps/web/server/research/mode-output.ts:12` | 未发现直接路由调用；需追踪间接/内部用途 |
| `researchModeInstruction` | `apps/web/server/research/mode-output.ts:13` | 未发现直接路由调用；需追踪间接/内部用途 |
| `validateAndRenderModeAnswer` | `apps/web/server/research/mode-output.ts:20` | 未发现直接路由调用；需追踪间接/内部用途 |
| `requireNewsActor` | `apps/web/server/research/news/access.ts:4` | 未发现直接路由调用；需追踪间接/内部用途 |
| `singaporeDay` | `apps/web/server/research/news/contracts.ts:34` | 未发现直接路由调用；需追踪间接/内部用途 |
| `safePublicLink` | `apps/web/server/research/news/contracts.ts:37` | 未发现直接路由调用；需追踪间接/内部用途 |
| `newsRuntime` | `apps/web/server/research/news/runtime.ts:8` | 未发现直接路由调用；需追踪间接/内部用途 |
| `startNewsScheduler` | `apps/web/server/research/news/runtime.ts:18` | 未发现直接路由调用；需追踪间接/内部用途 |
| `newsReadModel` | `apps/web/server/research/news/service.ts:8` | GET /api/research/news；POST /api/research/news |
| `newsAction` | `apps/web/server/research/news/service.ts:17` | GET /api/research/news；POST /api/research/news |
| `publicNewsUrl` | `apps/web/server/research/news/transport.ts:9` | 未发现直接路由调用；需追踪间接/内部用途 |
| `createPublicNewsTransport` | `apps/web/server/research/news/transport.ts:23` | 未发现直接路由调用；需追踪间接/内部用途 |
| `researchObjectAction` | `apps/web/server/research/preferences.ts:10` | POST /api/research/preferences |
| `researchObjectPreference` | `apps/web/server/research/preferences.ts:47` | 未发现直接路由调用；需追踪间接/内部用途 |
| `recentResearchObjects` | `apps/web/server/research/preferences.ts:52` | 未发现直接路由调用；需追踪间接/内部用途 |
| `researchSessionView` | `apps/web/server/research/read-model.ts:16` | 未发现直接路由调用；需追踪间接/内部用途 |
| `listResearchResults` | `apps/web/server/research/read-model.ts:20` | 未发现直接路由调用；需追踪间接/内部用途 |
| `getResearchResult` | `apps/web/server/research/read-model.ts:24` | GET /api/research/creation；POST /api/research/creation；GET /api/research/results/[runId]/share；POST /api/research/results/[runId]/share |
| `researchResultLibrary` | `apps/web/server/research/read-model.ts:31` | 未发现直接路由调用；需追踪间接/内部用途 |
| `researchProjectOptions` | `apps/web/server/research/read-model.ts:55` | GET /api/research/creation；POST /api/research/creation |
| `getResearchReadableContent` | `apps/web/server/research/read-model.ts:61` | 未发现直接路由调用；需追踪间接/内部用途 |
| `researchHomeInputs` | `apps/web/server/research/read-model.ts:97` | 未发现直接路由调用；需追踪间接/内部用途 |
| `getSelectedResearch` | `apps/web/server/research/read-model.ts:116` | GET /api/research/creation；POST /api/research/creation |
| `researchCreationTarget` | `apps/web/server/research/read-model.ts:132` | GET /api/research/creation；POST /api/research/creation |
| `researchSourceInbox` | `apps/web/server/research/read-model.ts:142` | 未发现直接路由调用；需追踪间接/内部用途 |
| `researchSourceDetail` | `apps/web/server/research/read-model.ts:172` | POST /api/research/sources/[id]/topic |
| `researchWorkInbox` | `apps/web/server/research/read-model.ts:189` | 未发现直接路由调用；需追踪间接/内部用途 |
| `createResearchSession` | `apps/web/server/research/service.ts:32` | GET /api/research/sessions；POST /api/research/sessions |
| `listResearchSessions` | `apps/web/server/research/service.ts:47` | GET /api/research/sessions；POST /api/research/sessions |
| `researchRunExpired` | `apps/web/server/research/service.ts:51` | 未发现直接路由调用；需追踪间接/内部用途 |
| `reserveResearchRun` | `apps/web/server/research/service.ts:63` | POST /api/research/sessions/[id]/runs |
| `executeResearchRun` | `apps/web/server/research/service.ts:129` | POST /api/research/benchmarks/[id]/research；POST /api/research/benchmarks/[id]/research-v2；POST /api/research/benchmarks/[id]/works/[workId]/analysis；POST /api/research/focus-v2；POST /api/research/sessions/[id]/runs；POST /api/research/trends/[stableKey]/opportunity-v2 |
| `getResearchSession` | `apps/web/server/research/service.ts:168` | GET /api/research/sessions/[id] |
| `getResearchRunStatus` | `apps/web/server/research/service.ts:174` | GET /api/research/sessions/[id]/runs/[runId]；POST /api/research/sessions/[id]/runs/[runId] |
| `saveResearchResult` | `apps/web/server/research/service.ts:181` | GET /api/research/sessions/[id]/runs/[runId]；POST /api/research/sessions/[id]/runs/[runId] |
| `listResearchMaterials` | `apps/web/server/research/service.ts:188` | GET /api/research/materials |
| `saveResearchClipping` | `apps/web/server/research/service.ts:195` | POST /api/research/sources/[id]/clippings |
| `buildResearchSharePreview` | `apps/web/server/research/sharing.ts:25` | GET /api/research/creation；POST /api/research/creation；GET /api/research/results/[runId]/share；POST /api/research/results/[runId]/share |
| `shareResearchRunToProject` | `apps/web/server/research/sharing.ts:50` | GET /api/research/results/[runId]/share；POST /api/research/results/[runId]/share |
| `shareLegacyStudyToProject` | `apps/web/server/research/sharing.ts:82` | POST /api/research/results/study/[studyId]/share |
| `prepareTeardownMaterial` | `apps/web/server/research/teardown/material-capability.ts:9` | 未发现直接路由调用；需追踪间接/内部用途 |
| `startTeardown` | `apps/web/server/research/teardown/service.ts:28` | GET /api/research/teardown；POST /api/research/teardown |
| `retryTeardown` | `apps/web/server/research/teardown/service.ts:68` | GET /api/research/teardown/[runId]；DELETE /api/research/teardown/[runId]；POST /api/research/teardown/[runId] |
| `getTeardown` | `apps/web/server/research/teardown/service.ts:107` | GET /api/research/teardown/[runId]；DELETE /api/research/teardown/[runId]；POST /api/research/teardown/[runId] |
| `listTeardowns` | `apps/web/server/research/teardown/service.ts:125` | GET /api/research/teardown；POST /api/research/teardown |
| `deleteTeardownHistory` | `apps/web/server/research/teardown/service.ts:140` | DELETE /api/research/teardown/[runId]/history |
| `teardownSessionRun` | `apps/web/server/research/teardown/service.ts:154` | 未发现直接路由调用；需追踪间接/内部用途 |
| `cancelTeardown` | `apps/web/server/research/teardown/service.ts:158` | GET /api/research/teardown/[runId]；DELETE /api/research/teardown/[runId]；POST /api/research/teardown/[runId] |
| `exportTeardown` | `apps/web/server/research/teardown/service.ts:168` | GET /api/research/teardown/[runId]/export |
| `topicOpportunityV2Prompt` | `apps/web/server/research/topic-opportunity-v2-analysis.ts:4` | 未发现直接路由调用；需追踪间接/内部用途 |
| `validateTopicOpportunityV2Answer` | `apps/web/server/research/topic-opportunity-v2-analysis.ts:13` | 未发现直接路由调用；需追踪间接/内部用途 |
| `parseTopicOpportunityV2State` | `apps/web/server/research/topic-opportunity-v2-contract.ts:34` | 未发现直接路由调用；需追踪间接/内部用途 |
| `collectTopicOpportunityV2` | `apps/web/server/research/topic-opportunity-v2-evidence.ts:12` | 未发现直接路由调用；需追踪间接/内部用途 |
| `topicOpportunityV2Sources` | `apps/web/server/research/topic-opportunity-v2-run.ts:16` | 未发现直接路由调用；需追踪间接/内部用途 |
| `topicOpportunityV2Coverage` | `apps/web/server/research/topic-opportunity-v2-run.ts:39` | 未发现直接路由调用；需追踪间接/内部用途 |
| `renderTopicOpportunityV2Blocks` | `apps/web/server/research/topic-opportunity-v2-run.ts:48` | 未发现直接路由调用；需追踪间接/内部用途 |
| `executeTopicOpportunityV2Run` | `apps/web/server/research/topic-opportunity-v2-run.ts:66` | 未发现直接路由调用；需追踪间接/内部用途 |
| `startTopicOpportunityV2` | `apps/web/server/research/topic-opportunity-v2-service.ts:18` | POST /api/research/trends/[stableKey]/opportunity-v2 |
| `topicOpportunityV2View` | `apps/web/server/research/topic-opportunity-v2-service.ts:35` | 未发现直接路由调用；需追踪间接/内部用途 |
| `trendStableKey` | `apps/web/server/research/trends.ts:6` | 未发现直接路由调用；需追踪间接/内部用途 |
| `parseTrendStableKey` | `apps/web/server/research/trends.ts:7` | 未发现直接路由调用；需追踪间接/内部用途 |
| `safeTrendMetrics` | `apps/web/server/research/trends.ts:18` | 未发现直接路由调用；需追踪间接/内部用途 |
| `researchTrendList` | `apps/web/server/research/trends.ts:19` | 未发现直接路由调用；需追踪间接/内部用途 |
| `researchTrendDetail` | `apps/web/server/research/trends.ts:67` | POST /api/research/trends/[stableKey]/related |
| `validateWorkDeepAnswer` | `apps/web/server/research/work-research-analysis.ts:42` | 未发现直接路由调用；需追踪间接/内部用途 |
| `validateWorkDeepAnswerV2` | `apps/web/server/research/work-research-analysis.ts:46` | 未发现直接路由调用；需追踪间接/内部用途 |
| `legacyWorkAnswer` | `apps/web/server/research/work-research-analysis.ts:87` | 未发现直接路由调用；需追踪间接/内部用途 |
| `validateWorkDecisionPass` | `apps/web/server/research/work-research-analysis.ts:97` | 未发现直接路由调用；需追踪间接/内部用途 |
| `workDeepPrompt` | `apps/web/server/research/work-research-analysis.ts:120` | 未发现直接路由调用；需追踪间接/内部用途 |
| `workDeepPromptV2` | `apps/web/server/research/work-research-analysis.ts:128` | 未发现直接路由调用；需追踪间接/内部用途 |
| `workDecisionPrompt` | `apps/web/server/research/work-research-analysis.ts:132` | 未发现直接路由调用；需追踪间接/内部用途 |
| `listAccountWorkDecisions` | `apps/web/server/research/work-research-assets.ts:9` | 未发现直接路由调用；需追踪间接/内部用途 |
| `parseWorkResearchState` | `apps/web/server/research/work-research-contract.ts:70` | 未发现直接路由调用；需追踪间接/内部用途 |
| `collectWorkResearchEvidence` | `apps/web/server/research/work-research-evidence.ts:11` | 未发现直接路由调用；需追踪间接/内部用途 |
| `workResearchSessionKey` | `apps/web/server/research/work-research-identity.ts:4` | 未发现直接路由调用；需追踪间接/内部用途 |
| `recommendWorkResearch` | `apps/web/server/research/work-research-recommendations.ts:7` | 未发现直接路由调用；需追踪间接/内部用途 |
| `workResearchSources` | `apps/web/server/research/work-research-run.ts:16` | 未发现直接路由调用；需追踪间接/内部用途 |
| `workResearchCoverage` | `apps/web/server/research/work-research-run.ts:28` | 未发现直接路由调用；需追踪间接/内部用途 |
| `renderWorkResearchBlocks` | `apps/web/server/research/work-research-run.ts:36` | 未发现直接路由调用；需追踪间接/内部用途 |
| `executeWorkResearchRun` | `apps/web/server/research/work-research-run.ts:99` | 未发现直接路由调用；需追踪间接/内部用途 |
| `collectWorkSourceForResearch` | `apps/web/server/research/work-research-service.ts:18` | POST /api/research/benchmarks/[id]/works/[workId]/collect |
| `startWorkDeepResearch` | `apps/web/server/research/work-research-service.ts:48` | POST /api/research/benchmarks/[id]/works/[workId]/analysis |
| `workResearchOverview` | `apps/web/server/research/work-research-service.ts:62` | 未发现直接路由调用；需追踪间接/内部用途 |
| `workCreationChoices` | `apps/web/server/research/work-research-service.ts:86` | 未发现直接路由调用；需追踪间接/内部用途 |
| `prepareWorkCreation` | `apps/web/server/research/work-research-service.ts:100` | POST /api/research/benchmarks/[id]/works/[workId]/analysis/[runId]/prepare-creation |
| `getWorkResearchForExport` | `apps/web/server/research/work-research-service.ts:117` | GET /api/research/benchmarks/[id]/works/[workId]/analysis/[runId]/export |
| `deepResearchedWorkIds` | `apps/web/server/research/work-research-service.ts:130` | 未发现直接路由调用；需追踪间接/内部用途 |
| `isPlatformVariantReadyToPublish` | `apps/web/server/reviews/quality-gate.ts:91` | 未发现直接路由调用；需追踪间接/内部用途 |
| `reviewApiError` | `apps/web/server/reviews/review-api.ts:6` | POST /api/projects/[id]/platform-variants/[platform]/review/ai；POST /api/projects/[id]/platform-variants/[platform]/review/approve；POST /api/projects/[id]/platform-variants/[platform]/review/reject；POST /api/projects/[id]/platform-variants/[platform]/review/request-changes；POST /api/projects/[id]/platform-variants/[platform]/review/submit；GET /api/projects/[id]/platform-variants/[platform]/reviews |
| `submitPlatformReview` | `apps/web/server/reviews/review-service.ts:82` | POST /api/projects/[id]/platform-variants/[platform]/review/submit |
| `runPlatformAIReview` | `apps/web/server/reviews/review-service.ts:99` | POST /api/projects/[id]/platform-variants/[platform]/review/ai |
| `approvePlatformVariant` | `apps/web/server/reviews/review-service.ts:164` | POST /api/projects/[id]/platform-variants/[platform]/review/approve |
| `requestPlatformChanges` | `apps/web/server/reviews/review-service.ts:168` | POST /api/projects/[id]/platform-variants/[platform]/review/request-changes |
| `rejectPlatformVariant` | `apps/web/server/reviews/review-service.ts:172` | POST /api/projects/[id]/platform-variants/[platform]/review/reject |
| `getPlatformReview` | `apps/web/server/reviews/review-service.ts:176` | GET /api/projects/[id]/platform-variants/[platform]/reviews |
| `getRuntimeHealth` | `apps/web/server/runtime/health.ts:107` | GET /api/dev/runtime-health |
| `releaseReadiness` | `apps/web/server/runtime/readiness.ts:18` | GET /api/health/ready；HEAD /api/health/ready |
| `settingsDiagnostics` | `apps/web/server/settings-diagnostics.ts:6` | GET /api/settings/diagnostics |
| `sidebarApiError` | `apps/web/server/sidebar/api.ts:4` | PATCH /api/sidebar/folders/[folderId]；DELETE /api/sidebar/folders/[folderId]；POST /api/sidebar/folders；POST /api/sidebar/projects/[projectId]/opened；PATCH /api/sidebar/projects/[projectId]/preference |
| `createBasicProject` | `apps/web/server/sidebar/basic-project.ts:13` | POST /api/sidebar/projects |
| `getProjectListView` | `apps/web/server/sidebar/service.ts:153` | GET /api/sidebar |
| `createProjectFolder` | `apps/web/server/sidebar/service.ts:174` | POST /api/sidebar/folders |
| `updateProjectFolder` | `apps/web/server/sidebar/service.ts:196` | PATCH /api/sidebar/folders/[folderId]；DELETE /api/sidebar/folders/[folderId] |
| `deleteProjectFolder` | `apps/web/server/sidebar/service.ts:222` | PATCH /api/sidebar/folders/[folderId]；DELETE /api/sidebar/folders/[folderId] |
| `updateProjectPreference` | `apps/web/server/sidebar/service.ts:255` | PATCH /api/sidebar/projects/[projectId]/preference |
| `recordProjectOpened` | `apps/web/server/sidebar/service.ts:309` | POST /api/sidebar/projects/[projectId]/opened |
| `projectListView` | `apps/web/server/sidebar/view-model.ts:57` | 未发现直接路由调用；需追踪间接/内部用途 |
| `canRefreshSourceMetadata` | `apps/web/server/source-metadata-service.ts:34` | POST /api/source-items/[id]/metadata/refresh |
| `refreshSourceExternalMetadata` | `apps/web/server/source-metadata-service.ts:56` | POST /api/source-items/[id]/metadata/refresh |
| `createSourceAndJob` | `apps/web/server/source-service.ts:44` | GET /api/source-items；POST /api/source-items |
| `validateUploadedFile` | `apps/web/server/source-upload.ts:74` | POST /api/source-items/upload |
| `uploadErrorMessage` | `apps/web/server/source-upload.ts:129` | POST /api/source-items/upload |
| `readUploadFormData` | `apps/web/server/source-upload.ts:144` | POST /api/source-items/upload；GET /api/voice-input；POST /api/voice-input |
| `buildCreativeBasisSummary` | `apps/web/server/studio/creative-basis.ts:64` | 未发现直接路由调用；需追踪间接/内部用途 |
| `extractHumanizerFactTokens` | `apps/web/server/studio/fact-safety.ts:23` | 未发现直接路由调用；需追踪间接/内部用途 |
| `preserveHumanizerFacts` | `apps/web/server/studio/fact-safety.ts:26` | 未发现直接路由调用；需追踪间接/内部用途 |
| `downgradeStudioFactText` | `apps/web/server/studio/fact-safety.ts:51` | 未发现直接路由调用；需追踪间接/内部用途 |
| `inspectStudioFactText` | `apps/web/server/studio/fact-safety.ts:59` | 未发现直接路由调用；需追踪间接/内部用途 |
| `inspectCreationFactText` | `apps/web/server/studio/fact-safety.ts:88` | 未发现直接路由调用；需追踪间接/内部用途 |
| `deterministicFactRisks` | `apps/web/server/studio/fact-safety.ts:128` | 未发现直接路由调用；需追踪间接/内部用途 |
| `sanitizeStudioQuickActionOutput` | `apps/web/server/studio/fact-safety.ts:136` | 未发现直接路由调用；需追踪间接/内部用途 |
| `runStudioQuickAction` | `apps/web/server/studio/quick-actions.ts:92` | POST /api/projects/[id]/ai/run |
| `applyStudioQuickAction` | `apps/web/server/studio/quick-actions.ts:142` | POST /api/projects/[id]/ai/runs/[runId]/apply |
| `unifiedAnalysisFingerprint` | `apps/web/server/unified-analysis/context-builder.ts:80` | 未发现直接路由调用；需追踪间接/内部用途 |
| `normalizeUnifiedCreativeAnalysisAdvisory` | `apps/web/server/unified-analysis/schemas.ts:31` | 未发现直接路由调用；需追踪间接/内部用途 |
| `runUnifiedCreativeAnalysis` | `apps/web/server/unified-analysis/service.ts:75` | POST /api/projects/[id]/ai/run |
| `getUnifiedCreativeAnalysisState` | `apps/web/server/unified-analysis/service.ts:92` | 未发现直接路由调用；需追踪间接/内部用途 |
| `businessDay` | `apps/web/server/video-operations/policy.ts:8` | 未发现直接路由调用；需追踪间接/内部用途 |
| `dayOffset` | `apps/web/server/video-operations/policy.ts:9` | 未发现直接路由调用；需追踪间接/内部用途 |
| `videoRange` | `apps/web/server/video-operations/policy.ts:11` | GET /api/video-data；POST /api/video-data |
| `validateObservation` | `apps/web/server/video-operations/policy.ts:34` | 未发现直接路由调用；需追踪间接/内部用途 |
| `taskState` | `apps/web/server/video-operations/policy.ts:43` | 未发现直接路由调用；需追踪间接/内部用途 |
| `comparison` | `apps/web/server/video-operations/policy.ts:47` | 未发现直接路由调用；需追踪间接/内部用途 |
| `interactions` | `apps/web/server/video-operations/policy.ts:48` | 未发现直接路由调用；需追踪间接/内部用途 |
| `parseCsv` | `apps/web/server/video-operations/policy.ts:50` | 未发现直接路由调用；需追踪间接/内部用途 |
| `csvNumber` | `apps/web/server/video-operations/policy.ts:104` | 未发现直接路由调用；需追踪间接/内部用途 |
| `csvBoolean` | `apps/web/server/video-operations/policy.ts:108` | 未发现直接路由调用；需追踪间接/内部用途 |
| `csvCell` | `apps/web/server/video-operations/policy.ts:111` | 未发现直接路由调用；需追踪间接/内部用途 |
| `readVideo` | `apps/web/server/video-operations/service.ts:19` | GET /api/video-data；POST /api/video-data |
| `mutateVideo` | `apps/web/server/video-operations/service.ts:72` | GET /api/video-data；POST /api/video-data |
| `loadWorkbenchPageData` | `apps/web/server/workbench-page-data.ts:29` | 未发现直接路由调用；需追踪间接/内部用途 |
| `parseWorkflowSkill` | `apps/web/server/workflow-skill/contract.ts:110` | 未发现直接路由调用；需追踪间接/内部用途 |
| `workflowSkillPreview` | `apps/web/server/workflow-skill/contract.ts:169` | 未发现直接路由调用；需追踪间接/内部用途 |
| `parseImportedSkill` | `apps/web/server/workflow-skill/contract.ts:189` | 未发现直接路由调用；需追踪间接/内部用途 |
| `resolveWorkspaceMembership` | `apps/web/server/workspace-context.ts:4` | 未发现直接路由调用；需追踪间接/内部用途 |