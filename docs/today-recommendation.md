# Today Recommendation / 今天值得做

## 产品逻辑

Today Recommendation 是创作决策层，不是新的搜索入口，也不是“爆款预测器”。它把已经存在于当前 Workspace 的真实线索压缩为 3 条默认、最多 5 条可执行方向。用户先看依据，再决定加入选题、开始研究或开始创作；系统不会自动创建选题、项目或下载外部素材。

有真实 LLM 配置时标题为“今天值得做”，模式为 `AI_ASSISTED`。没有配置、服务禁用或本地处于 MOCK MODE 时标题为“今日内容线索”，模式为 `DETERMINISTIC`。确定性模式只陈述来源与规则判断，不使用“AI 推荐”“最适合你”等措辞。

## 数据来源与预算

Context Builder 只读取：

- 当天数据库内的 TrendSnapshot / TrendOpportunity；
- 用户此前显式打开过的 BenchmarkContentSnapshot；
- 有限数量的近期 ContentIdea 和 ContentProject 标题/状态；
- 最近 READY SourceItem 的标题与短摘要；
- 当前用户的 CreatorProfile 精简字段。

候选最多 15 个，近期 Ideas / Projects 各最多 8 个进入 LLM 上下文。不读取完整素材正文、Transcript、MotherContent、项目正文或 RedFox raw response。没有任何真实候选时显示引导空状态，不伪造推荐。

## 为什么不会静默调用 RedFox

推荐模块没有导入 RedFox Provider，也没有网络刷新路径。对标作品只有在用户进入对标页并明确加载时，原有 Discovery Service 才调用 RedFox，同时把最多 30 条公开安全字段 upsert 为 BenchmarkContentSnapshot。推荐生成只查询本地数据库。因此打开首页、查看批次、生成确定性批次和运行 AI 推荐时，RedFox 调用数均为 0。

## 两种生成模式

`DETERMINISTIC` 使用集中式 Candidate Builder 与 Ranker。它先做规范化精确排重，排除与 READY / IN_PROGRESS 选题完全同名的方向，再按真实来源、跨平台信号、CreatorProfile 核心主题文字匹配和近期项目轻量相似提示稳定排序。内部排序不写成用户可见分数。

`AI_ASSISTED` 在同一候选集之上执行一次 `GENERATE_TODAY_RECOMMENDATIONS`。一个 batch 最多产生一个 AIRun 和一条 LLM ApiUsage。模型负责发现逻辑、表达和切口层的问题，不负责证明事实，也不能创建业务对象。

## Evidence validation

模型必须返回服务器提供的 `candidateId` 和 `evidenceRefs`。服务器拒绝未知候选，并将 evidenceRefs 与候选允许的真实引用集合求交；没有任何有效依据的推荐会被丢弃。最终入库快照取自服务器 Context Builder，而不是模型返回内容，因此模型不能伪造 TrendSnapshot、SourceItem 或 CreatorProfile 依据。

## 缓存、权限与成本

RecommendationBatch 有本地时区的当日失效时间。页面渲染只读取当前 Workspace 当天最新有效批次；“更新一批”是明确的新生成动作。VIEWER 可读取共享批次，EDITOR / ADMIN / OWNER 可生成、保存、研究和开始创作。所有查询都约束 workspaceId，批次仍记录实际创建人和所用 CreatorProfile。

Kimi 未配置时功能仍可用，因为确定性模式不依赖 LLM，也不会创建假的 AIRun / ApiUsage。AI 模式不知道真实单价时 cost 保持 null。推荐不触发付费 RedFox 请求。

## 为什么不做爆款评分

当前数据只能说明已有观察与编辑线索，不能可靠证明未来传播结果。V1 不显示 score、confidence、viral probability 或“保证成功”，避免把内部排序伪装成可验证预测。

## 未来 CreatorMemory 接入边界

未来 CreatorMemory 可以作为新的、显式授权的候选特征与 Evidence 类型进入 Context Builder，但不应改变 FAST 的产品语义，也不能绕过人工选择、Workspace 隔离、依据校验或外部素材收录确认。D4 当前没有点击学习、长期偏好记录、反馈训练、向量库、自动每日任务或 Cron。
