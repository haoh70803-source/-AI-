# 飞书 Wiki 知识库集成技术审查

本文件保留阶段一的审查快照。随后第一批代码的当前状态见 [FEISHU_ARCHITECTURE.md](FEISHU_ARCHITECTURE.md)，当次验证见 [FEISHU_TEST_REPORT.md](FEISHU_TEST_REPORT.md)；不要把审查快照当作后续实现状态。

审查日期：2026-10-09（Asia/Singapore）。验证等级：V0。范围：阶段一，只读代码审查与后续方案；本文件是本次唯一新增交付物。未读取实际密钥文件，未访问业务数据库、调用真实飞书租户 API、运行迁移、修改配置、安装依赖或执行代码测试。

## 1. 结论与设计评价

**现有实现适合“小规模、明确共享的文档订阅”，不足以承担多级企业 Wiki 知识库。建议保留并扩展已有飞书模块，将接入单位由单篇链接提升为授权空间/子树，将 AI 使用方式由同步全部文档后关键词取样提升为权限过滤后的索引检索。**

用户提出的方向合理，但需要区分三种覆盖：

1. **目录覆盖**：发现指定授权空间/子树下的所有可见节点，处理各层分页；当前没有。
2. **文档解析覆盖**：完整读取支持类型的正文与结构，标记无法解析的对象/块；当前仅调用 Docx 纯文本接口，没有结构化块解析。
3. **任务证据覆盖**：从已索引内容中检索与问题有关的片段；不等于把整个知识库或全文一次塞进模型。涉及“总结整篇文档/整个空间”时，应采用按章节读取、分层摘要与遗漏说明，而非普通 top-k 检索。

当前并非只保存链接：已经下载单篇 Docx 的纯文本，存入 `SourceItem.rawText` 并分块。读取 `/wiki/` 时只把该节点解析为 `obj_token` 后读一篇 Docx；没有递归读取它的子节点。把一个 Wiki 首页链接添加进来，不能覆盖首页下的整个文档树。

### 已有优点（CURRENT IMPLEMENTATION）

- 服务端 AES-256-GCM 加密 App Secret，状态接口不回显密钥；可复用凭证管理基础。
- 有 Workspace 成员校验、OWNER/ADMIN 管理限制、复合外键和来源 URL 白名单。
- 读取前后校验远端 revision，索引替换使用 Serializable 事务；有配置/文档 revision 与同步租约。
- 撤权/删除/停订阅/断开连接后清理正文及检索片段；缓存仅存片段 ID，命中后再查数据库有效状态。
- 已接入 Project Assistant、AI Context 和资料分析，有原文链接与 AIRun ContextManifest 留存基础。

### 必须补足的设计（CURRENT IMPLEMENTATION GAP）

| 缺口 | 当前证据与影响 | 后续适配 |
| --- | --- | --- |
| 空间和多级目录缺失 | Client 仅 `get_node`；无 spaces/nodes 分页；每连接最多 20 份 | 空间/授权子树选择、逐层分页、可恢复遍历 |
| 正文结构和类型覆盖不足 | 仅 `raw_content`；Wiki 对象非 Docx 直接报错 | Docx 块树解析，保留章节/列表/表格/链接；其他类型明确 UNSUPPORTED/PARTIAL |
| 没有语义检索 | 中文二字组合与英文词，GIN 数组匹配及命中数排序；没有 embedding/vector | 保留关键词能力，增量增加 Embedding 与混合排序 |
| AI 取样范围小 | 候选最多 400，结果最多 6、每文档最多 2；Assistant 自动资料预算另有 4000 字节限制 | 任务级预算、章节多样性、邻块扩展；全文任务单独读取路径 |
| 检索与同步耦合 | `searchFeishu()` 和 `ensureFeishuSource()` 强制同步整个连接 | 后台同步，查询阶段只检查候选的有效权限与版本 |
| 应用权限不等于用户权限 | 所有有效 Workspace 成员可读已确认共享文档，无节点/用户 ACL | Workspace 范围与显式知识访问授权取交集；限制空间默认拒绝 |
| 网络错误销毁索引 | 单文档/连接失败清正文、Transcript、Chunk；恢复后重新索引 | 暂停检索资格、保留内部快照；明确撤权即时失效，恢复须重新核验 |
| 无持久任务与完整日志 | Web `setInterval`，连接最后错误、文档最后错误、AuditLog；无同步任务明细 | 持久任务、分页检查点、退避重试、逐项结果、脱敏请求日志 |
| 没有知识范围选择 | 通用 Context 会自动检索飞书；KNOWLEDGE adapter 仍返回 unsupported | 接入既有 adapter，增加上传资料/飞书/混合选择并持久化 |
| 引用追溯不完整 | AIRun 有片段文本/版本，回复附相关链接；Artifact 初始保存未显式传 generateRunId | 成果修订绑定 AIRun 与不可变引用快照、位置、内容哈希 |

因此，不建议仅提高 20 份上限或增加链接输入框。核心是**授权范围发现、结构化读取、可恢复同步、权限索引和受控上下文**。

## 2. 真实项目架构

下列版本来自当前仓库 package.json，不代表现场服务或安装依赖已经验证。

| 项目项 | 代码事实 | 证据 |
| --- | --- | --- |
| 仓库 | pnpm 11.19.0 + Turborepo；Node >=24；TypeScript 6.0.3 | 根 `package.json` |
| Web/后端 | Next.js 16.3.4 App Router + React 19.2.8；Route Handlers + server Service；不是另起 Express 后端 | `apps/web/package.json`、`apps/web/app/api/` |
| UI | Tailwind 4.3.3、普通 CSS、lucide-react；已有飞书页面和组件样式 | `apps/web/components/library/feishu-library.*` |
| 数据库/ORM | PostgreSQL + Prisma 6.19.3；开发 Compose 指定 PostgreSQL 17 alpine | `packages/db/prisma/schema.prisma`、`packages/db/package.json`、`docker-compose.dev.yml` |
| 登录 | Better Auth 1.7.2 + Prisma adapter，邮箱密码、会话、禁用用户、持久登录限流 | `apps/web/lib/auth.ts` |
| 权限 | SystemRole 与 WorkspaceRole 分离；OWNER/ADMIN/EDITOR/VIEWER；会话 activeWorkspaceId | schema、`apps/web/server/workspace-context.ts` |
| AI | IntegrationService 解密配置，OpenAICompatibleLLMProvider；支持模型目录/选择及显式 Mock/Fixture | `apps/web/server/ai/llm-runtime.ts`、`packages/providers/src/` |
| Prompt/执行 | ProjectContextBuilder、ContextBuilderV2、ScopeGate、FactGate、ActionPermission、AIControlService；Project Assistant 流式生成 | `apps/web/server/ai/control/`、`apps/web/server/assistant/` |
| 成果与旧脚本 | Artifact(TEXT) → DraftBranch/DraftRevision；保存、人工修改、AI 应用修订、乐观版本；旧 MotherContent 仍兼容 | `apps/web/server/artifacts/service.ts`、`apps/web/server/drafts/service.ts`、`apps/web/server/mother-content-service.ts` |
| 后台任务 | BullMQ 6.3.3 + ioredis 6.0.0；独立/嵌入/禁用 Worker 模式；队列有指数退避基础 | `apps/worker/src/queue.ts`、`queue-producer.ts`、`worker-mode.ts` |
| 飞书调度 | Next Node runtime instrumentation 启动 30 秒 tick；连接 5 分钟到期检查，最多选 100 个连接 | `apps/web/instrumentation.ts`、`apps/web/server/feishu/runtime.ts` |
| 存储 | 本地与 S3-compatible/MinIO 能力；不是向量数据库 | `packages/providers/src/*storage*`、Compose |
| 验证 | Vitest 4.1.11、Playwright 1.62.1、数据库环境守卫；LOCAL_TEST 隔离 | `vitest.config.ts`、`apps/web/playwright.config.ts`、`scripts/test-database-setup.ts` |
| 部署/运行 | 本地 daily/review/live、release 脚本与 Docker Compose/Worker Dockerfile | `scripts/local-web.mjs`、`local-profile.mjs`、`local-release.mjs`、`docker-compose.*.yml` |

未发现 `.github` 目录；不能据此宣称存在 GitHub Actions CI。没有读取现场部署配置或数据库迁移记录，因此不能宣称 schema/migration 已在现场生效。现有 `20261008060000_feishu_library` 是仓库中的迁移文件，不是本轮已执行迁移。

注意：根 `dev`/`db:migrate` 仍引用 LOCAL_REAL 旧入口，而 `scripts/local-profile.mjs` 会拒绝该 legacy 入口。后续部署文档应使用核对后的 daily/live/release 流程，不复制旧 README 命令；本轮不修改运行脚本。

## 3. 现有接入链路与关键限制

```text
管理员添加单篇 docx/wiki URL
  → FeishuConnection / FeishuDocument / SourceItem
  → tenant_access_token → Wiki get_node（仅当前节点）
  → Docx metadata → raw_content → metadata（revision 一致性）
  → 事务替换 rawText 与 FeishuChunk
  → 关键词检索 → ContextItem → AIRun ContextManifest
  → Project Assistant / 资料分析 → 相关飞书链接
```

### 文档正文与覆盖

- `chunks()` 对获取的正文按 850 字符切块、步长 700、重叠 150，包含尾部；不是只抓文档开头。
- 单文档纯文本超过 300000 字符会拒绝；单次 API 响应超过 4000000 字节会拒绝。超限应展示明确失败，不能声称全文覆盖。
- 固定字符切块可能切断句子、表格和列表，缺少章标题路径与块定位。
- `raw_content` 是纯文本读取；当前没有读取富文本结构，不能保证内嵌链接、表格结构、附件或图片文字完整。
- 检索最多读取 400 个候选且无指定候选排序，大量文档下可能在应用层排序前遗漏最相关片段。
- 文档级 top-2 适合短证据引用，但不适合作为全文阅读完成的证明；无匹配需明确报告，不可用生成常识替代知识库证据。

### 同步、性能与错误

- Client token 仅在实例内缓存，无 `expire` 时效管理、提前刷新或 token 错误重取；当前每次同步创建新 Client，需长期 Worker 使用时补足。
- 已有 12 秒请求超时、禁止重定向、响应大小限制与上游错误脱敏；缺少请求速率控制、429 Retry-After、指数退避/抖动、请求 ID/耗时日志。
- 当前 Docx 每轮读取 metadata/body/metadata，Wiki 再加 get_node，另有 token 请求；20 篇全部 Wiki 正常一轮约 81 次请求，未计重试。
- `searchFeishu()` 强制串行重读所有订阅内容，生成前 `ensureFeishuSource()` 也可能重复触发整批同步。扩展到数百篇时不能照搬。
- 90 秒租约有逐文档续租和 revision 校验，可复用；但缺少任务检查点与分页续跑，且 BUSY 不等于已经完成新鲜核验。
- `contentHash(text,title,remoteRevision)` 将远端 revision 纳入内容哈希。未来正文未变而 revision 变时会误触发重建；正文/解析哈希、远端版本、Embedding 缓存键应分开。
- `synced` 在事务因 revision/lease 不匹配而提前返回时仍可能递增；`lastSyncedAt` 在 PARTIAL 后也写入。后续统计应区分发现、读取、未变、激活、失败、跳过，不能把计数当完整索引证明。
- 当前飞书 Scheduler 启动条件未检查 `LOCAL_REVIEW_OFFLINE` / `EXTERNAL_CALLS_DISABLED`；这是本模块与既有离线运行边界的缺口。后续需统一在 Connector 出口和调度入口尊重运行模式。本轮不启动服务验证。

### 权限与历史内容

- `feishuMember()` 真实校验有效成员；凭证/订阅管理限 OWNER/ADMIN。现有团队共享模式有明确 UI 确认，但没有模拟每个用户的飞书身份。
- 60 秒 freshness 与 30 秒 cache TTL 只能限制旧数据时间，不能提供即时远端撤权保证；远端变更发生于核验之后仍存在时间窗口。
- 单次 API 的 403/404/错误码分类需要按端点核对。token scope 不足、对象删除、节点授权不足应分别诊断，均暂停使用，但不能都断言文档已删除。
- purge 清理原文、Transcript、Chunk，并未清理所有 AI 派生快照；知识条目 `KnowledgeEntry.sourceSnapshot`、Fact/Evidence、历史 AIRun/消息/成果可能含原片段。
- `KnowledgeEntry`/`FactRecord` 已有知识版本和事实确认治理，不应另建一套“已确认事实”体系。飞书同步成功也不等于品牌声明/案例已经核实。
- `ProjectContextBuilder` 吞掉 `ensureFeishuSource()` 错误后继续读取非 ARCHIVED 来源；后台 sync 若 BUSY/失去租约，旧来源可能仍存在，需针对路径验证。不能仅凭主检索排除规则宣称所有入口都不会复用旧片段。
- 后续应在 Material、自动检索、缓存命中、Evidence/Knowledge 派生来源、对话记忆重用等实际入口核对来源授权；历史成稿可保留，但旧片段不能被重新供给 AI。历史引用摘录展示也必须再次校验访问权限。

## 4. 适配原则与目标链路

本方案属于当前模块的 **TARGET ARCHITECTURE 提案**，不是已实现能力，不修改权威规则。遵循 PRODUCT/ARCHITECTURE：飞书是 Material/Knowledge 的外部数据能力，服务 Project → Conversation → Artifact；脚本是现有兼容创作场景，不新增以脚本工厂为中心的产品结构。

```text
管理员选择应用可见空间/授权子树 + 工作台访问范围
  → 持久 SyncRun → 逐层分页发现节点（检查点/去重/有界并发）
  → 按 obj_type 分发 → Docx 结构化块树 → 规范化快照
  → 中文语义分块 → 内容哈希 → Embedding/关键词索引
  → 原子激活文档版本 + 独立权限有效状态
用户选择上传资料 / 飞书 / 混合
  → Workspace + 用户/项目范围 + 文档有效权限过滤
  → 关键词/向量混合 → 去重/邻块/可选重排 → 受控 ContextManifest
  → 既有模型链 → 引用快照绑定 AIRun 和成果修订
```

### Connector 与结构化解析

- 扩展 `packages/integrations/src/feishu/client.ts`，复用现有加密、错误与 URL 策略；不建立 FeishuV2 平行实现。
- 空间列表与每个父节点的列表都遍历分页；存 `space_id/node_token/parent_node_token/obj_token/obj_type/has_child`，visited 去重、防循环、深度/节点预算与可恢复检查点。达预算必须标明未完成。
- 空间或子树授权须人工确认；只发现应用可见范围，不承诺跨越飞书权限，也不能根据一个页面 URL 推断它授权整库。
- Docx 分页读取 blocks，按 children 与块类型重建结构，保存块 ID、标题路径、列表层级、表格行列与超链接。旧 doc、sheet、bitable、file 等先显式标记未支持，后续按类型逐项授权实现。
- 无法读取的嵌入块标为 PARTIAL；空文件、目录节点和未支持对象不能显示“全文已索引”。保留 `raw_content` 用于兼容与诊断，不冒充结构化读取。
- token 按过期信息缓存，提前刷新和并发 single-flight；按应用/租户限流，429/5xx/网络重试有总次数、总时长和抖动；权限错误不无限重试。

### 同步与索引发布

- 全量发现/周期检查/手动同步共用一个持久任务入口；全量扫描完成后才能判断“未发现节点”。部分分页失败绝不能把剩余节点误判删除。
- 暂时网络/限流失败：保留内部版本但标记不可用于 AI，重试成功才恢复。明确撤权/删除：立即禁用查询、清缓存、停止派生资料复用，随后按数据保留策略清理正文。
- 索引按文档构建 staging 版本，在完整解析、分块与 embedding 完成后事务切换 `activeVersionId`。权限状态独立于内容版本，撤权可以先失效；不允许“旧权限仍有效”作为新版本发布失败的兜底。
- 改为规范化正文/结构的内容哈希；Embedding 复用键包含片段哈希、模型/维度与分块/解析版本。只变标题/远端 revision 不一定重算正文 embedding，但应更新检索元数据和引用版本。
- 恢复失败任务从检查点续跑；防同连接/同文档重复并发，发布时再核对配置 revision/ACL epoch。

### 权限模型

- 检索必须同时满足有效 Workspace 成员、知识范围授权、节点/文档 ACL、连接启用、文档有效版本；不可依赖 Prompt 或隐藏 UI。
- 保留“明确 Workspace 全员共享”的现有来源，不把新增空间自动继承为全员共享。限制空间使用显式用户/现有角色授权；目录继承与例外由后端计算，deny 优先、未知拒绝。
- 应用身份能读 ≠ 工作台用户能读。第一步采用管理员管理的工作台知识授权；若要求严格等同每个用户飞书权限，需另行实现用户身份绑定、用户凭证与端点支持核验。不能只加一张映射表就宣称权限镜像完成。
- 权限缓存含 ACL epoch，与变更一起失效；检索、引用展示和模型调用前再次核验。严格即时撤权需要可用事件/远端核验支持；否则必须记录并批准最大授权检查窗口，不能承诺零延迟。

### 最低侵入性的 RAG 方案

- 继续使用 PostgreSQL/Prisma 和现有 GIN 关键词索引，不替换数据库、不引入独立向量服务或 RAG 大框架。
- **EXPERIMENT**：评估现有 PostgreSQL 是否允许 pgvector，先在隔离测试库核验扩展、维度、Prisma 映射/参数化 SQL和过滤正确性。当前 Compose 是普通 PostgreSQL 镜像，不能假定已装扩展。
- 若扩展不可用，小样本可用同库数组/JSON 保存 embedding 后在严格权限过滤的有界候选集上精确相似度计算；仅作为试点，不能宣称整库向量召回已经满足规模要求。根据规模/延迟测试再批准扩展部署方案。
- 已搜索 `packages/providers`、AI Server 与 Worker，未发现现成 embedding/vector 实现；现有 LLM Runtime 不等于 Embedding。扩展 providers 中独立 embedding 能力及凭证配置，复用现有加密系统，不修改已有聊天模型密钥或 base URL。
- 中文按章节、段落、句子语义边界分块，表格附表头，长块有重叠和位置；采用关键词/向量双路、排名融合和文档/章节多样性。可选 reranker 必须另有配置和预算，默认不依赖。
- 权限过滤发生在候选查询前，融合后及送模型前再校验，防跨 Workspace/撤权泄漏；无授权命中要返回明确状态。
- 全文任务按指定文档/章节逐段读取；整空间概览采用分层摘要并保留覆盖统计。全文入库与按需供给各自验收，不用增大 Prompt 代替检索设计。

### AI 与引用

- 复用 `KnowledgeContextAdapter`（当前占位）与 `ContextBuilderV2`，在现有输入/API 合同增加知识模式和选定范围，消息/项目偏好记录实际选择。上传资料模式应跳过自动飞书读取，混合模式分配两类上下文预算。
- 外部内容一律 EXTERNAL 数据，不成为 System Prompt/Skill，不授予执行工具的权利。已有 Assistant 系统 Prompt 有该边界；继续加入注入样例、来源标签和结构化输出引用校验，不能把一句 Prompt 当完整防护。
- 引用只接受服务端查询得到的文档/块 ID；后端校验原始 HTTPS 飞书域名 URL。模型输出链接不得直接成为可信引用。
- `feishuLinks()` 当前只是“已供给相关资料”列表，不证明每条回答使用了该来源。后续编号/主张级引用必须验证属于本轮供给集合，并区分供给来源与实际引用。
- 保存实际供给片段、版本、块/章节位置、内容哈希、检索策略与授权核验时间；避免只记录随时变化的 chunk ID。
- AIRun 已存 ContextManifest，可复用。Artifact 初始创建的 DraftRevision 当前没有显式传 generateRunId，AI 修改则有；后续需补齐首次保存与每个修订的引用绑定。人工编辑继承来源时要标明继承，不能伪造一次新检索。
- 飞书故障时，上传资料与原有无知识库的对话/保存继续可用；纯飞书模式明确提示资料暂不可用，禁止静默按常识生成“有知识库依据”的回答。给外部服务总体超时和熔断预算。

## 5. 数据库变更提案（本轮未实施）

先复用：FeishuConnection、FeishuDocument、FeishuChunk、SourceItem、AuditLog、AIRun.metadata、DraftRevision.generateRunId。KnowledgeEntry 是人工沉淀/事实治理的版本对象，不用于无条件装载所有同步块，保持其确认边界。

| 变更对象 | 必要字段/约束与用途 |
| --- | --- |
| FeishuConnection 扩展 | lastSuccessfulSyncAt、权限/配置 epoch、授权策略、调度状态；保留已有单 Workspace 连接与加密 Secret，不无端新增多应用功能 |
| 新增 FeishuSpace | workspaceId/connectionId/spaceId、标题、选定根范围、授权与扫描状态；connection+space 唯一，Workspace 复合约束 |
| 新增 FeishuNode | spaceId/nodeToken/parentNodeToken/objToken/objType、标题、路径、远端元数据、扫描代次/状态；空间+nodeToken 唯一；支持节点与文档分离及快捷引用 |
| FeishuDocument 扩展 | activeVersionId、权限状态/检查时间/epoch、解析覆盖、来源对象去重；同 obj_type/obj_token 复用正文，不同节点路径保留各自访问规则 |
| 新增 FeishuDocumentVersion | remoteRevision、contentHash、parserVersion、状态、规范化内容/覆盖摘要；不可变已发布版本，未完成 staging 不参与检索 |
| FeishuChunk 扩展 | versionId、position、blockIds、headingPath、chunkHash、向量模型/维度及向量存储；唯一键改为 version+position，不能继续 document+position 阻挡多版本 |
| 新增 FeishuSyncRun / 明细 | mode/status/requestedBy、阶段/真实计数、检查点、attempt、起止时间、错误码/requestId；队列引用任务 ID；可复用 AuditLog 存事件，避免重复日志系统 |
| 新增知识访问映射 | Workspace、Space/Node/Document 范围，现有 user/role principal、allow/deny/继承和 epoch；服务端过滤并覆盖派生来源 |
| 引用快照 | 先扩展 AIRun ContextManifest 的结构化引用，再把 DraftRevision 绑定 AIRun；若现有 JSON 无法满足查询/保留约束，再增加修订引用表，不默认另建整套引用系统 |

现有只按 kind/token 去重，会将同正文的 Wiki 链接与 Docx 链接视作不同文档。后续对象去重不能丢掉节点 ACL/路径差异；同文档命中只能通过用户获准的路径提供引用。

迁移采用 expand → 隔离验证 → 经授权回填 → 切换 → 稳定后 contract。新字段先可空/禁用，不覆盖旧记录或更换 SourceItem 身份。现有链接订阅继续工作，新空间迁移与模块代码属同一交付单元。具体 SQL 与可逆 DDL 在实施阶段交付并审阅。

## 6. 拟修改文件与调用影响半径

以下是后续实施清单；本轮没有修改这些文件。先按小步骤验证，不把清单当全仓重构授权。

| 文件/目录 | 拟改原因 |
| --- | --- |
| `packages/integrations/src/feishu/client.ts` | token 生命周期、spaces/nodes/blocks 分页、只读读取、限流/重试/脱敏日志 |
| `packages/integrations/src/feishu/policy.ts` | 支持类型状态、语义分块、独立哈希、检索排序与 URL 安全；保留链接兼容 |
| `packages/integrations/src/feishu/service.ts` | 发现/同步/ACL/原子发布；解除查询全量同步；复用管理授权 |
| `packages/integrations/src/index.ts` | 仅导出实际需要的新接口 |
| `packages/db/prisma/schema.prisma`、新增 migration | 上述增量数据模型；授权后实施 |
| `packages/providers/src/`、`packages/integrations/src/schemas.ts` / `service.ts` | 必要 embedding 能力与独立配置；实施前再核对直接调用方 |
| `apps/worker/src/queue-producer.ts` / `queue.ts` / `index.ts` | 复用 Worker 添加隔离飞书同步任务，避免拖慢采集/转写队列 |
| `apps/web/server/feishu/runtime.ts`、`apps/web/instrumentation.ts` | 调度向持久任务派发，遵守离线/外部调用开关；disabled Worker 配置不得假装已入队 |
| `apps/web/server/feishu/service.ts` | 缓存/权限再核验、引用 DTO 和受控上下文 |
| `apps/web/app/api/feishu/route.ts`、必要子路由 | 空间/目录/同步任务/检索/权限读取与管理；GET 检索避免外部同步写操作 |
| `apps/web/server/assistant/references.ts` | 实现既有 KnowledgeContextAdapter |
| `apps/web/server/ai/control/context-builder-v2.ts` | 范围选择、检索状态、预算与实际引用 Manifest |
| `apps/web/server/assistant/api.ts` / `service.ts`、`apps/web/lib/contracts/assistant.ts` | 输入合同、模式持久化、故障提示、引用校验与追溯 |
| `apps/web/server/artifacts/service.ts`、必要 drafts 接口 | 首次保存绑定 AIRun，修订引用追溯；保持原有乐观锁/分支/重开行为 |
| `apps/web/components/projects/ai-creation-panel.tsx` 与实际引用选择控件 | 沿用当前界面增加知识范围，按现有入口落地 |
| `apps/web/components/library/feishu-library.tsx` / `.css`、已有 `/library/feishu` 页面 | 复用现有入口与深空设计组件，空间树、任务进度、真实统计/历史/日志/权限 |
| Material read/API、`apps/web/server/ai/project-context.ts`、`apps/worker/src/material-analysis.ts` | 直接调用方的授权、派生来源有效性与故障隔离；只做本模块所需修改 |
| `.env.example`、匹配环境示例 | 新增非秘密开关与预算样例，保留已有凭证；真实配置变更需授权 |
| 相关测试与最终文档 | 扩展飞书测试；最终架构/API/部署/测试报告分阶段填写真实结果 |

共享服务 `searchFeishu/ensureFeishuSource` 的直接调用方已检查：AI Context、Assistant cache、ProjectContext、Material readable/detail、SourceItem/Transcript API、Worker 资料分析。未来改变 freshness/ACL 规则时必须覆盖这些路径，不能只测新知识库页面。

## 7. 后续阶段与验收门槛

| 步骤 | 具体交付 | 验收/授权门槛 |
| --- | --- | --- |
| 1（本轮） | 本审查、真实缺口、文件与模型计划 | V0；不执行业务读写/迁移 |
| 2A Connector | 扩展现有 Client，分页、递归、Docx 块树与错误分类的模拟单测 | 不安装大框架；不需要真实业务数据写入 |
| 2B 小样本远端读取 | 已授权空间/子树与少量 Docx，验证应用 scopes、节点/正文可见性 | 明确授权真实连接验证；密钥仅通过现有安全配置入口；不在聊天/日志传 Secret |
| 3 同步与索引 | schema/迁移脚本、同步任务、全量/增量、撤权/原子发布 | 数据迁移、环境配置、业务回填在明确授权后执行；先隔离测试库 |
| 4 RAG | embedding 配置、中文分块、混合检索、权限过滤与覆盖评测 | 向量扩展/镜像/配置需先能力验证及授权；不沿用聊天模型密钥假设 |
| 5 项目创作接入 | 三种模式、Prompt 数据边界、引用快照与成果版本绑定 | 保持对话修改/保存/重开；旧 MotherContent 仅相关兼容回归 |
| 6 管理 UI | 已有飞书页面增量升级，真实目录/计数/进度/日志/权限 | 区分 READY/PARTIAL/UNSUPPORTED/UNAVAILABLE；不能以发现数冒充索引数 |
| 7 模块收口/交付 | 指定测试矩阵与其余 4 份文档、环境示例、迁移/回滚 | V2 模块验证；正式交付按 AGENTS 执行 V3 全局关键验收；记录当次结果 |

当前不提前生成 `FEISHU_TEST_REPORT.md` 声称通过，也不伪装其余实施文档已经代表可部署功能。阶段二以上未启动。

## 8. 测试审查与后续矩阵

已有 `apps/web/tests/feishu.test.ts`：URL 安全、纯文本块尾部与重叠、关键词、Mock API、Wiki 单节点解析、revision 一致性、凭证加密、角色/Workspace 隔离、更新幂等、撤权/网络失败/停订阅/断开，以及 Mock LLM 生成和链接/Manifest。`assistant-feishu-cache.test.ts`：片段 ID 缓存、状态再校验、失效回退、禁用成员。

这些文件包含数据库写入夹具；本轮只阅读，没有运行。测试存在不等于通过，更不证明真实租户 API/真实模型成功。

| 后续测试 | 必须验证的行为 |
| --- | --- |
| Connector 单测 | token 到期/并发刷新；429/5xx/超时/非 JSON；请求日志脱敏、离线阻止外部调用 |
| 分页/递归 | 多页空间、每层多页、三层以上、空节点、快捷引用/重复、防循环、预算不足与续跑 |
| 解析 | 标题/列表/表格/链接/嵌套块保留，正文尾部，超限/未知类型/PARTIAL 明确 |
| 同步幂等 | 无变化不重复 embedding；仅 revision 变化不重算正文；检查点恢复/租约失效/配置变更 |
| 原子发布 | embedding 部分失败/进程中断不暴露半索引；查询只读一个有效版本 |
| ACL 隔离 | 不同 Workspace、同 Workspace 限制空间、用户禁用/角色变化/路径例外、缓存再校验 |
| 撤权/删除 | 已缓存片段、选中 Material、派生 Knowledge/Evidence、旧对话记忆均不能重新进入 AI；分页失败不误删 |
| 检索质量 | 中文同义表达、尾部/表格答案、关键词/向量/混合排名、无结果、文档多样性与全文任务覆盖 |
| AI 集成 | 三模式实际供给不同；恶意文档指令不被执行；伪造引用被拒；保存/修订/重开可追溯 |
| 故障回归 | 飞书 429/网络故障/Redis 不可用时，本地资料、无飞书对话、保存/编辑/恢复继续工作；飞书模式显式报告失败 |
| UI/E2E | 真实进度/统计、权限管理、目录树、引用打开；不模拟业务结果 |

相关回归文件：`project-assistant.test.ts`、`project-agent-core.test.ts`、`artifacts.test.ts`、`drafts.test.ts`、`studio-creation-context.test.ts` 与对应 `project-assistant` / `project-agent-core` / `generic-artifact` / `drafts` / `multi-user-security` E2E。V1 定向、V2 模块、V3 正式交付分级执行，不能每一步机械全仓跑。

建议在授权样本上建立“目录节点/支持文档/可读块”的期望清单，逐项验证覆盖；另建人工标注中文问答集测 Recall@k、权限泄漏、引用有效率和端到端耗时。门槛由真实样本与规模确定，本轮不编造性能数字或通过率。

## 9. 风险与回滚策略

| 风险 | 控制与回滚 |
| --- | --- |
| 过量扫描/限流拖慢工作台 | 先少量文档，后台隔离队列、有界并发/预算；禁用新 Wiki 任务即可恢复链接模式；查询不等待全库同步 |
| ACL 错误扩大共享 | 新空间默认拒绝、明确共享策略、服务端过滤；撤销 ACL/禁用连接须即时阻止查询，回滚不可恢复旧授权 |
| 索引半更新/重复向量 | staging+事务激活、模型/维度隔离、内容哈希幂等；只有权限仍有效才可切回上一个完整内容版本 |
| 文档删除误判 | 仅完整目录扫描做缺失判定，显式权限失败单独处理；部分扫描保留发现记录但不放宽查询资格 |
| 网络失败触发重新向量化成本 | 内部保留不可检索快照、恢复先核验再复用哈希；保留策略与可见性分开 |
| 引用/派生资料越权重用 | 来源依赖与授权 epoch 校验；缓存/Prompt/成果引用服务同时关闭新路径，保留原有成稿，不自动删除用户作品 |
| 数据迁移与旧订阅兼容 | expand-only schema 先行，链接身份保留；新路径关闭后旧链接模式需使用兼容代码，不能直接运行任意旧版本 |
| 本地离线/无 Redis 运行 | 尊重环境开关；声明手动/调度可用性；无需飞书能力的工作继续可用，不能擅自启用 Worker/外部服务 |
| 其他任务同时修改共享文件 | 本轮已有 Research/teardown、Worker/Core/Provider 未提交改动；不覆盖、不暂存、不混入提交 |

回滚次序：禁用 Wiki/RAG 新入口与任务派发 → 停止/排空新任务 → 失效相关缓存与新版本供给 → 恢复兼容应用路径 → 核验本地资料/对话/成果保存。保留新表和版本便于排查，不以删除数据库完成应用回滚。

数据库回滚需独立授权：变更前备份/恢复演练；优先逻辑回滚和补偿 SQL。向量索引/新增字段是否删除、扩展是否卸载要确认无共享使用；不可盲目卸载 pgvector。实际 DROP/down SQL 必须随实施迁移具体审查。本轮未备份数据库、执行 DDL 或生成未经验证的生产回滚脚本。

## 10. 官方 API 参考与验证局限

已通过浏览器打开以下飞书官方参考入口；站点正文动态加载，本轮未取得完整参数正文。因此这些链接用于后续接口契约核对，不宣称已经核验所有 scopes、页大小、错误码或事件支持。

- [获取知识空间列表](https://open.feishu.cn/document/server-docs/docs/wiki-v2/space/list)
- [获取知识空间子节点列表](https://open.feishu.cn/document/server-docs/docs/wiki-v2/space-node/list)
- [获取企业自建应用 tenant_access_token](https://open.feishu.cn/document/server-docs/authentication-management/access-token/tenant_access_token_internal)
- [获取文档纯文本内容](https://open.feishu.cn/document/server-docs/docs/docs/docx-v1/document/raw_content)
- [新版文档开发指南](https://open.larkoffice.com/document/server-docs/docs/docs/docx-v1/guide)

阶段二需在官方 API Explorer/官方契约中确认 blocks 列表、节点分页、只读 scopes 与应用/用户可见性，再对授权样本验证。未取得真实知识空间 ID/期望文档清单和授权验证结果；不能评估用户实际 Wiki 的内容组织质量、现场授权完整性或实际解析成功率。本报告评价的是仓库接入设计。

## 11. 本轮交付状态

- STATUS：阶段一审查完成；现有能力与缺口、增量架构、文件/模型计划、风险/回滚和验收矩阵已记录。
- CHANGED：仅新增 `FEISHU_INTEGRATION_AUDIT.md`。
- BOUNDARY：未修改权威规则、功能代码、环境凭证、数据库或业务数据；未启动后续阶段。
- VERIFICATION：V0 静态检查和官方参考入口查阅；未运行测试/typecheck/build/E2E，未验证线上或本地运行服务。
- RISKS：整库递归、结构化解析、语义检索与用户级权限均为待实施能力；不能把现有单篇订阅宣传为整库接入。
- GIT：未执行 add/commit/push 或其他改变分支/工作区的 Git 操作；既有未提交修改保留。本报告待人工审阅，后续数据迁移、生产配置和业务写入须明确授权。
# 后续施工状态补充：多入口持久同步

2026-10-09 按用户新增要求完成多空间/子树订阅及周期增删改同步代码、管理 UI、两表迁移 SQL 与 115 项定向模拟验证；迁移、运行 profile 启用和首次真实回填尚未执行。完整设计/启用步骤以 FEISHU_ARCHITECTURE.md 和 FEISHU_DEPLOYMENT.md 最新章节为准。下面审查正文保留为原始架构快照，不据此宣称现场已启用整库同步。上传 Word/File 的正文支持与真实授权核对仍是明确缺口。
