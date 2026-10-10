# 飞书只读 API 集成

日期：2026-10-09。当前实现为连接器与管理员预览，真实租户读取尚未执行；测试全部使用注入的模拟 HTTP 响应。

## 上游接口

| 能力 | 方法与路径 | 实现 |
| --- | --- | --- |
| 应用 token | POST `/auth/v3/tenant_access_token/internal` | 仅此请求发送 App ID/Secret；按 expire 提前刷新、合并同 Client 并发取 token |
| 空间列表 | GET `/wiki/v2/spaces` | `page_size=50`，显式 cursor，保留 has_more |
| 子节点列表 | GET `/wiki/v2/spaces/{space_id}/nodes` | `page_size=50`、parent_node_token、page_token；Wiki 遍历逐层分页 |
| 单节点解析 | GET `/wiki/v2/spaces/get_node` | node_token 解析 obj_token/obj_type，二者不混用 |
| Docx 元数据 | GET `/docx/v1/documents/{document_id}` | 校验 title/revision_id，正文读取前后复查 |
| Docx 结构 | GET `/docx/v1/documents/{document_id}/blocks` | `page_size=500`、`document_revision_id=-1`、page_token；不请求需要编辑权限的历史版本 |
| 旧订阅纯文本 | GET `/docx/v1/documents/{document_id}/raw_content` | 保持既有 read() 协议，不自动转换既有索引 |

API origin 固定 `https://open.feishu.cn/open-apis`，不接受用户指定 base URL，不跟随重定向、不缓存 HTTP 正文。超时 12 秒/请求；管理预览额外有 30 秒总预算和用户取消信号。

## 请求安全与恢复

- Client 内串行预留请求时隙，至少间隔 150ms。该节流不是跨进程/全租户的全局配额；整库 Worker 阶段仍需添加跨任务配额控制。
- 网络、HTTP 5xx、429/99991400 有界重试，最多 3 次，指数退避与抖动。Retry-After 最多等待 10 秒，超过预算向任务调用方返回限流错误。
- token 过期错误 99991663/99991664 最多主动刷新一次。无有效 expire 不长期缓存 token。
- 权限失败不重试，不在 Connector 中声称已经清理数据库；业务服务负责退出索引。
- 拒绝访问响应保留安全的接口 operation、HTTP status、API 错误码与格式受限 requestId；不回显上游 msg。目录错误区分空间根目录与节点子目录。get_node 成功只证明该节点能够被定位，不能据此宣称空间根目录已授权。0 页失败不等于知识库为空，也不能单凭 UNAVAILABLE 推断文档已删除。
- 日志仅 operation、attempt、HTTP status、API code、elapsedMs 与格式受限 requestId，不含 Secret/token、请求正文、上游 msg、完整 URL 或文档正文。测试证明失败/成功消息不回显凭证。
- 未知对象类型标 UNSUPPORTED；未知/缺失块标 PARTIAL。分页协议异常标 PROTOCOL，预算超限标 LIMIT，离线环境标 OFFLINE。

## 工作台预览接口

`POST /api/feishu/browse`，JSON 请求，严格同源检查，登录有效 Workspace，OWNER/ADMIN 角色；读取后再校验成员与连接启用/revision。响应 `Cache-Control: no-store`。此接口不写 SourceItem、不创建订阅或索引。

```json
{"action":"spaces"}
```

```json
{"action":"nodes","spaceId":"7001","parentToken":"wikiroottoken123","pageToken":"上次返回的标记"}
```

```json
{"action":"document","nodeToken":"wikiroottoken123"}
```

```json
{"action":"resolve","url":"https://example.feishu.cn/wiki/wikiroottoken123"}
```

`resolve` 为无法列举空间时的只读接入路径。复用既有飞书链接白名单解析，仅允许 HTTPS 飞书 `/wiki/` 链接；提取 token 后仍向固定 API origin 请求 get_node，不访问用户填写的 URL。返回 `type: scope / spaceId / node / originalUrl`，空间 ID 必须来自实际节点响应，缺失时返回 INCOMPLETE_RESPONSE。原始链接移除 query/hash 后供 UI 展示。

单次 `resolve` 不读取空间根目录、创建订阅或写入索引。UI 在用户提交定位后自动使用 `nodes` API 逐页读取该节点全部可访问后代；管理员可另行点击“读取整个知识空间目录”省略 parentToken 从空间根目录开始遍历。空间名称未知时明确展示空间 ID，不用节点标题冒充空间名称。已有未移除 Wiki 订阅可预填链接，打开页面时不会自动联网。空列表且 hasMore=true 时继续分页，不能推断为无权限；最终空列表同样不能证明个人账号没有知识空间。

所有浏览响应新增 `connectionVersion`，值为本地连接 ID 与 revision 的组合，不含 App Secret/token。整目录读取必须核对各页与定位结果的连接版本；变化即丢弃目录。沿用同一 `nodes` 请求协议与服务端权限检查，没有新增写入接口。节点多页/多层会发起多个串行请求，每页保持 30 秒请求预算，支持取消当前请求。

列表响应：`type/items/hasMore/pageToken`。文档响应：`type/node/status/document`；支持类型返回 READ，document 中有 text/sections/headingPath/coverage/warnings/unsupportedBlockIds 与 remoteRevision。READ 仅表示读取完成，完整性由 coverage 判断，不代表索引或同步成功。

不允许直接传 docx URL 绕过节点解析，也不接受凭证、任意上游 URL 或多余字段。目录列表只展示应用可见对象，不能保证管理员个人飞书身份权限，也不授予 Workspace 全员权限。

## 持久知识库 API（启用开关后）

沿用 `POST /api/feishu` 同源/登录/Workspace/OWNER-ADMIN 校验，不使用预览接口写入业务数据。

```json
{"action":"subscribeWiki","urls":["https://example.feishu.cn/wiki/wikiroottoken123","https://example.feishu.cn/wiki/wikisecondtoken123"],"scope":"SPACE","category":"OTHER","teamShared":true}
```

scope 也可为 SUBTREE。每次最多 20 条链接，同空间/同节点入口幂等去重；重复的停止入口不会自动恢复。空间名称无法可靠获知时使用真实空间 ID，管理员可编辑名称。普通 Docx 链接继续使用原单篇 add 协议。

```json
{"action":"updateWiki","id":"本地订阅ID","revision":1,"name":"员工工作台","category":"BRAND"}
```

```json
{"action":"pauseWiki","id":"本地订阅ID","revision":2}
```

```json
{"action":"resumeWiki","id":"本地订阅ID","revision":3}
```

`sync` 在有有效 Wiki 入口时保存同步请求并返回 QUEUED，不表示任务完成。后台服务继续使用应用身份读取、分页遍历及正文接口。

`GET /api/feishu` 增加 wikiSyncEnabled/subscriptions 和数据库计数。`GET /api/feishu?subscriptionId=...` 获取持久目录及正文状态，要求有效成员和当前 Workspace 共享订阅；读取后复查入口和连接版本。未启用时订阅 API 返回 SETUP_REQUIRED 提示，无新表查询/写入。停用 feature flag、暂停入口、扫描/正文核验失败或撤权时，相关旧片段不得继续供给 AI。

## 官方契约依据（延续）

除官方 API 页面外，本次核对了飞书官方 SDK 的 Node/分页与 Docx TextElement/Table 定义。未安装 SDK、未复制 SDK 实现。权限 scopes 与真实空间可见性需在发布应用后用授权样本验证，不能仅凭 token 成功宣称所有文档可读。

- [知识空间列表](https://open.feishu.cn/document/server-docs/docs/wiki-v2/space/list)
- [子节点列表](https://open.feishu.cn/document/server-docs/docs/wiki-v2/space-node/list)
- [文档全部块](https://open.feishu.cn/document/server-docs/docs/docs/docx-v1/document/list)
- [官方 Wiki SDK 数据定义](https://github.com/larksuite/oapi-sdk-go/blob/v3_main/service/wiki/v2/model.go)
- [官方 Docx SDK 数据定义](https://github.com/larksuite/oapi-sdk-go/blob/v3_main/service/docx/v1/model.go)
