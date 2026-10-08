# Content Discovery V1

## 产品定位

内容发现回答“我下一条内容值得做什么”。它是发现和取舍层，不是 RedFox API 查询后台，也不是第二个素材库。

- **内容发现**：搜索外部内容、查看对标账号、暂存选题，决定是否收录或创作。
- **素材库**：保存用户已明确收录的 SourceItem、媒体和转写结果。
- **内容项目**：承载正在进行的研究、Evidence、简报、母稿和多平台创作。

V1 的主链路是：

```text
搜索方向 → 发现外部内容 → 预览
                           ├→ 收录素材
                           ├→ 加入选题
                           └→ 开始创作
```

## RedFox 数据层

RedFox 凭证继续通过 `IntegrationConfig` 在服务端加密存储。浏览器不接触 API Key，页面和 Route Handler 不知道第三方 endpoint 或 payload。

```text
ContentDiscoveryService
  → RedFoxDiscoveryProvider
      ├→ ContentSearchAdapter
      ├→ AccountSearchAdapter
      ├→ AccountDetailAdapter
      ├→ AccountWorksAdapter
      └→ WorkDetailAdapter
          → RedFoxClient
```

单条作品的媒体下载不另建管线，仍复用现有 `RedFoxSourceProvider → IngestJob → BullMQ Worker → StorageProvider`。

## 统一外部 DTO

`ExternalContent` 统一抖音作品和小红书笔记，包含稳定外部 ID、平台、内容形式、标题/摘要、作者、封面、原链接、时间和可选互动指标。缺失指标保持 `null`，不伪造为 `0`。

`ExternalAccount` 统一外部账号 ID、平台、名称、头像、简介、粉丝数、获赞数和原始链接。

Adapter 可在服务端保留 `rawProviderMetadata` 供调试，对前端输出时会删除该字段。

## 数据模型

### BenchmarkAccount

保存 Workspace 共享对标账号。`workspaceId + platform + externalAccountId` 唯一，包含可选 CreatorProfile 归属、账号快照、`enabled`、`lastSyncedAt` 和创建人。V1 不后台自动同步；账号作品只在用户点击加载/刷新时请求。

### ContentIdea

发现与项目之间的最小选题缓冲层。状态为 `INBOX / READY / IN_PROGRESS / DONE / ARCHIVED`，可关联一个后续 ContentProject。

### ContentIdeaReference

保存 ExternalContent 快照，不要求先创建 SourceItem。当用户后续收录同一 `platform + externalId` 时，`sourceItemId` 会回填。因此“加入选题”不会触发下载。

## 搜索与输入判定

`DiscoveryQueryResolver` 把用户输入分为 `KEYWORD / ACCOUNT_QUERY / ACCOUNT_URL / CONTENT_URL`。无法可靠判定时按关键词处理。V1 一级平台筛选为全部、抖音、小红书，排序为推荐、最新、热门。

搜索结果只是 metadata，不创建 SourceItem、不下载媒体、不自动调用 LLM。

## 收录与开始创作

- **收录素材**：先按 `workspace + platform + externalId`、再按 canonical URL 去重；新内容创建 SourceItem/IngestJob 并进入既有 Worker。
- **开始创作**：如尚未收录，先显式收录；然后创建 ContentProject，并以 `REFERENCE` 建立 ProjectSource，进入 `/projects/[id]/studio`。
- **从选题开始**：已收录的 references 直接关联。存在未收录 reference 时必须先向用户明确确认，不暗中批量下载。

## 成本、缓存与安全

- 所有真实 RedFox 调用都由明确的搜索、加载作品或刷新动作触发。打开首页、预览卡片和加入选题都不产生付费请求。
- 相同 Workspace、operation、query/platform/filter 在 5 分钟内复用进程内缓存。缓存命中不重复记账。
- 缓存未命中的真实调用写入 ApiUsage，记录 operation、success/failure、duration 和 provider request ID；不知道单价时 `cost` 保持 `null`。
- 所有路由使用既有 Workspace RBAC；数据查询必须带 `workspaceId`。VIEWER 只读，EDITOR 可搜索/收录/选题/建项目，OWNER/ADMIN 管理共享对标。
- RedFox 返回的媒体 URL 仍经过原有 SSRF、redirect、MIME 和大小限制，不因数据来源而绕过安全检查。

## D3 Trends

D3 增加“趋势机会”，只回答当前哪些内容值得进一步研究，以及这些趋势可以转成哪些候选选题。它不提供“今日最推荐你做”、爆款概率或自动决策。

```text
RedFoxTrendProvider
  → normalize
  → TrendSnapshot
  → TrendOpportunity read model
  → Supporting ExternalContent（用户显式加载）
  → CandidateTopic preview（用户显式调用 AI）
  → ContentIdea（用户显式保存）
  → ContentProject（用户显式开始创作）
```

### TrendSnapshot 与 TrendOpportunity

`TrendSnapshot` 是 Workspace 隔离的轻量历史记录，保存来源、平台、趋势类型、外部键、标题/关键词、真实排名、可用指标和观察时间。它不保存完整 Provider raw response。

`TrendOpportunity` 是按“今天 / 近 7 天”即时计算的 read model，不是长期业务对象。它比较当前与较早快照，显式表达新出现、正在上升、持续热门或黑马。`rankDelta = previousRank - currentRank`；没有历史基线时保持 `null`，不显示假上涨。只有经过确定性规范化后完全相同、且确实来自多个平台的关键词才形成跨平台趋势。

### CandidateTopic 与 AI provenance

`GENERATE_TOPIC_CANDIDATES` 复用 Workspace LLM、PromptTemplate、AIRun 和 ApiUsage。输入只包含当前趋势、最多 5 条用户选择的相关内容、当前 CreatorProfile，以及有限数量的近期选题/项目标题。Prompt 明确把榜单和外部内容视为不可信输入，模型只生成角度、冲突、差异化方向与待核实风险，不负责证明趋势或直接写最终文案。

候选结果是 3–5 条结构化 Preview，不自动创建任何业务数据。用户点击“加入我的选题”后才创建 `ContentIdea`，并通过 `ContentIdeaReference` 分别记录真实 `TrendSnapshot` 依据、用户实际选中的 ExternalContent 快照和 AIRun 建议来源。选题详情把“真实依据”和“AI 建议”分开展示。

### 成本与权限

- 趋势数据只由“加载趋势 / 刷新”触发，进程内缓存 20 分钟；读取页面和切换到已有快照不调用 Provider。
- 相关内容继续使用既有 5 分钟 Discovery 缓存，只有点击“查看相关内容”才查询。
- RedFox 趋势调用分别记录 `TREND_DOUYIN_HOT`、`TREND_DOUYIN_SURGE`、`TREND_XHS_HOT`、`TREND_XHS_DARK_HORSE`、`TREND_GLOBAL`；无可靠价格时 `cost = null`。
- VIEWER 可读取已有快照，但不能刷新、查询相关外部内容、调用 AI 或保存选题；EDITOR、ADMIN、OWNER 可执行这些显式动作。
- Kimi 未配置时，趋势读取、相关内容和人工加入选题仍然可用，UI 明确提示未配置。

## D4 Today Recommendation

D4 在内容发现首页加入“今天值得做”决策层。它聚合数据库中已经存在的趋势快照、用户显式加载过的对标作品安全快照、近期 Ideas、近期 Projects、已收录素材和当前用户 CreatorProfile。首页渲染只读取当天有效的 `RecommendationBatch`，不会生成新批次，也不会调用 RedFox 或 LLM；只有 EDITOR 及以上成员点击“生成今日线索 / 更新一批”才运行一次。

推荐上下文最多包含 15 个候选和有限的近期标题，不包含完整素材正文、Transcript、项目正文或 RedFox raw response。`RecommendationCandidate` 是即时的内部候选，不入库；确定性 Ranker 只用于稳定排序，不向用户展示分数、置信度或爆款概率。READY / IN_PROGRESS 选题的规范化精确同名候选会被排除，近期项目的轻量相似只提示、不阻断。

### 批次与依据

- `RecommendationBatch`：当天缓存，记录 `DETERMINISTIC / AI_ASSISTED`、CreatorProfile、可选 AIRun、生成与失效时间、创建人。
- `RecommendationItem`：保存 3 条为默认、最多 5 条方向及 `NEW / SAVED / STARTED / DISMISSED` 状态。
- `RecommendationEvidence`：保存真实引用 ID 与生成时快照；来源限于趋势、对标内容、选题、素材、项目和创作者档案。
- `BenchmarkContentSnapshot`：只在用户显式加载对标作品时保存公开、安全字段，供后续推荐离线读取；不保存 Provider raw metadata。

AI 模式复用 Workspace LLM、PromptTemplate、AIRun 与 ApiUsage，一个 batch 最多一次结构化调用。服务器验证模型返回的 candidateId，并把 evidenceRefs 与该候选的允许集合求交；伪造或跨候选依据不会入库。页面把“真实依据”和“AI 判断”分开展示。LLM 未配置、被禁用或处于 MOCK MODE 时使用确定性线索，不创建 AIRun，也不出现“AI 推荐”或个性化断言。

“加入选题”和“开始研究”会显式创建 ContentIdea 并保留推荐 provenance。“开始创作”先创建 / 复用 Idea，再调用既有项目流程；如包含未收录的外部对标引用，必须由用户确认后才能收录。推荐生成本身的 RedFox 调用数始终为 0。

D4 仍不包含 CreatorMemory、长期偏好学习、点击训练、自动每日生成、Cron、后台刷新、通知、爆款预测、AI 评分、向量推荐、GPT API 或自动发布。
