# 接口缺口补充设计

状态：EXPERIMENT / 未实现；2026-10-10。这里只定义评审契约，不新增或修改正式 API。完整内容经营、多媒体成果等 FUTURE 能力不因设计出现而获得施工授权。

## 1. 跨项目通用成果列表

现状：`GET /api/projects/[id]/artifacts` 存在；`content-hub` 返回知识、事实、选题与背景，不返回通用 Artifact 集合。

优先策略：有限项目范围内复用已有列表。确需全空间分页时再提供只读聚合契约：

```text
GET /api/artifacts?projectId=<optional>&type=TEXT&cursor=<opaque>&limit=20
→ { items: [{ id, projectId, title, type, version, updatedAt }], nextCursor }
```

Workspace 从认证上下文确定，不接收任意 workspaceId。只聚合调用者可访问项目；排序稳定，游标不可绕过范围。复用 ArtifactSummaryView 和原 Service；400 无效筛选、401 未登录、404 项目不可见。页面：内容中心成果标签，加载/空态/分页/读取失败；媒体封面不作为成果类型。

## 2. 本地视频或已有资料拆解

现状：资料上传存在；专用拆解创建只有 `shareText` 与 `requestKey`，校验抖音链接。

优先复用资料上传和转写，不新建第二套文件、ASR 或 Worker。待单独任务确认后，考虑在现有拆解 Service 增加输入适配：

```text
POST /api/research/teardown
已有兼容输入：{ shareText, requestKey }
待设计输入：{ sourceItemId, requestKey }
→ 保持 TeardownView；sourceType/可分析证据说明需显式返回
```

新增输入必须校验资料归属、媒体类型、有效时间戳和写权限。没有作者公开记录时 baseline 不可用，不伪造比较结果。requestKey 的幂等哈希应区分资料与版本；依赖未就绪返回明确错误。本轮专属页面只接受抖音来源，已有文件仍进入资料页。

## 3. 自选分析维度

现状：分析输出已定义主线、段落、优点、风险、传播假设和热点关系；当前请求未接受用户选维度。

优先维持固定报告结构。若另行确认需要可配置模式，扩展既有请求中的 `analysisOptions`，仅允许有限枚举并记录版本；不能让自由 Prompt 跳过来源、时间戳和权限校验。历史报告应显示缺少模块并允许更新分析。未获授权前，不在原型提供伪装可用的维度开关。

## 4. 小时热度、留存与设备数据

现状：video-data 是账号日度快照，不能推导用户 cohort、小时行为或设备来源。

状态：FUTURE。先确定数据来源、采集粒度、观察对象、去重、时区与范围权限，再定义统计查询。推荐所有统计输出包含 `metricDefinition`、`window`、`observedAt`、`coverage`、`availability`，缺失值为 null。本轮保留图形类型及空态，不创建假接口或假事件表。

## 5. 通用多媒体成果

现状：通用 Artifact 只有 TEXT；原始视频资料与历史平台内容不是多媒体 Artifact。

状态：CURRENT IMPLEMENTATION GAP。后续明确模块任务再定义类型、资产所有权、编辑与版本、下载授权和持久化能力。当前项目编辑器明确为文本，不显示已可生成视频或图片的按钮。

## 6. 运行验证与权限

静态路由存在不是运行验收。正式接入需按模块验证未登录/只读/非所属项目/失效凭据/版本冲突/服务未配置/任务超时；预览地址需可续签，不暴露存储路径。接口权限由服务器强制，原型权限切换仅演示按钮状态。内部工具和 Service 不要求都有公开 API。

## 视频拆解已有契约的页面处理

- `POST /api/research/teardown`：输入抖音分享文字，带 requestKey；重复提交由服务端幂等处理。
- `GET /api/research/teardown?page=`：个人历史分页；点击加载 runId 详情。
- `GET /api/research/teardown/[runId]`：逐阶段显示 MATERIAL / TRANSCRIPTION / BASELINE / ANALYSIS / COMPLETED 与转写进度。
- `DELETE` 同路径：停止，真实状态是 FAILED 且 stage=CANCELLED；展示为“已停止”，资料保留。
- `POST` 同路径：`{ version, mode: retry | refresh }`；正在执行或版本已变化时采用返回的最新状态。
- `GET .../export`：仅完成报告提供下载。
- `DELETE .../history`：确认只删除个人历史，保留原资料和共享成果。
- 资产 access：获得受控 URL 后按 ASR 时间 seek；当前原型只有封面及原文定位，未加载真实视频。
- `GET/POST /api/research/results/[runId]/share`：先审阅内容和来源，再指定已有或新项目，提交 expectedVersion；完成后进入目标项目引用文本成果。

保存报告不新造专用持久化接口：已有 ResearchRun 保留报告；研究保存与加入项目使用现有研究/共享契约，不能对未完成任务执行分享。
