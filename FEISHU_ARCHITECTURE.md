# 飞书知识库模块架构

日期：2026-10-09。本文记录连接器、目录预览及多入口持久同步代码。持久同步等待数据库迁移与现场启用；不表示向量 RAG 已交付。产品权威规则沿用 PRODUCT.md、ARCHITECTURE.md、LEGACY.md，未修改。

## 当前实现（CURRENT IMPLEMENTATION）

知识业务已从 API 连接器目录中移出，在现有 monorepo 内按职责组织，不新增服务、数据库、部署单元或 npm 依赖。

| 边界 | 代码 | 职责 |
| --- | --- | --- |
| 飞书连接器 | `packages/integrations/src/feishu/client.ts`、`contracts.ts`、`docx.ts` | 只读 API、token 生命周期、请求节流/退避、分页/递归、Docx 解析；不操作数据库 |
| 知识业务 | `packages/integrations/src/knowledge/feishu-service.ts` | 现有订阅、Workspace 管理权限、同步、事务索引、检索、撤权处理 |
| Wiki 持久订阅 | `packages/integrations/src/knowledge/feishu-wiki.ts`、`feishu-access.ts` | 多空间/子树入口、完整发现差异、重叠覆盖、增删改同步、权限与共享索引清理 |
| AI 上下文适配 | `apps/web/server/knowledge/feishu-context.ts` | 权限再校验、片段 ID 缓存、ContextItem 与引用来源供给 |
| 管理员发现 | `apps/web/server/knowledge/feishu-browse.ts`、`app/api/feishu/browse/route.ts` | 已配置连接的授权空间/目录/正文只读预览，不订阅、不索引、不写业务数据 |
| 管理界面 | `apps/web/components/library/feishu-wiki-browser.tsx` | 空间选择、Wiki 链接定位、整空间/子树自动分页递归、进度/取消、缓存目录展开、正文覆盖与失败状态 |
| 兼容入口 | 原 `feishu/service.ts` 文件 | 仅转发导出，既有调用方不必同时重写 |

这是逻辑模块边界；知识业务仍位于现有 integrations package 的独立目录内。若未来其他知识源需要复用，再按实际依赖抽出 package，当前不为了目录名称新增工程。

```text
现有管理员 → /library/feishu → POST /api/feishu/browse
  → Workspace/OWNER/ADMIN 与连接校验
  → Connector → 飞书只读 API → 解析结果
  → 再次校验成员与连接 revision → 管理员预览

旧链接订阅 → Knowledge Service → SourceItem / FeishuDocument / FeishuChunk
  → Knowledge Context → 现有 AIControl / Project Assistant
```

## 安全与兼容

- 管理员能发现应用可见文档，不等于全部成员获准阅读；预览服务固定要求 OWNER/ADMIN，没有通过隐藏 UI 代替后端权限。
- 凭证继续使用原 FeishuConnection 的 encryptedSecret 与现有 AES-256-GCM 解密能力，不回显，不创建新凭证源。
- 目录读取结束后重新校验成员和连接 revision。连接被禁用/更换、管理员资格失效时丢弃本次结果。
- 外部调用出口及调度入口遵守 `EXTERNAL_CALLS_DISABLED` / `LOCAL_REVIEW_OFFLINE`。离线同步返回 OFFLINE，不清空索引；AI 不复用飞书缓存正文。非飞书上传资料不依赖该连接。
- 内嵌链接仅保留为数据，不发起 HTTP、不执行。预览正文由 React 文本/pre 渲染，禁止 HTML 注入。
- 链接订阅继续调用原 `read()` 纯文本协议，保留现有 SourceItem、保存/修订/恢复链路；新结构化 `readStructured()` 暂用于预览。没有放大 20 篇订阅上限。
- 本批没有修改 schema、migration、业务凭证或实际运行环境，没有重新部署/重启用户服务。

## 读取完整性

空间与子节点方法保留下一页 cursor；UI 对每层显示“加载更多”。`walkWiki()` 按每个父节点分页递归，遇到重复节点、循环、错误归属、重复 cursor 或预算超限直接失败。它提供的是可见后代节点流，不包括传入父节点本身，不把部分结果当完整扫描。

2026-10-09 目录功能补齐：UI 定位 Wiki 链接后自动读取目标节点子树，并允许管理员明确点击“读取整个知识空间目录”从该空间根目录遍历。UI 复用现有 `nodes` API，以串行分页队列调度，每个父节点先完成分页再读后代，遵循连接器相同的循环/归属/分页/预算校验。客户端调度适配逐页 API，而非把整棵树塞进一条 30 秒请求；未增加平行 Service 或后台任务。每页仍执行服务端 Workspace/角色/连接校验。

响应附带不含凭证的 `connectionVersion`（本地连接 ID 和 revision）。跨页或定位后发生版本变化时丢弃目录，禁止把不同连接的目录混在一次读取中。界面展示实际节点/页数；错误、取消和超限均标记结果不完整，支持重新扫描。已完成读取的目录展开使用本次页面内缓存，不重复联网。10,000 节点上限包含链接定位的根节点；目录遍历不受旧正文订阅 20 篇上限限制。

“完整”仅指本轮 API 成功遍历的应用可见目录，飞书未提供整棵树的原子快照；读取期间移动/新增节点可能需重读。刷新或关闭页面不会保留只读遍历队列，取消后重试从头读取；本次没有持久检查点。目录节点不等于正文已入库，未支持对象仍明确标识。

`readStructured()` 分页读取全部 blocks，查询最新可读版本 `-1`，读取前后比较 metadata revision，变化时拒绝返回混合正文。树解析保留标题路径、段落、列表、表格行列文字和安全原始链接。图片/OCR、附件、某些富文本元素、高亮块样式、合并表格布局与未知块明确 PARTIAL；独立 Sheet/Bitable/File 等返回 UNSUPPORTED。未连接/缺失块也不标为完整。

单次响应 4MB、文档累计块数据 12MB、20,000 块、100 块分页、30 万正文字符、文档树深度 100；默认 Wiki 遍历限制 10,000 节点、2,000 页、64 层。超限均显式报错，不静默截断。

## 待实施（CURRENT IMPLEMENTATION GAP）

多入口空间/子树持久订阅与正文周期同步代码已实现，因现场迁移未授权而保持关闭。仍未实施独立 SyncRun/分页检查点、个别用户节点 ACL、版本化结构索引、Embedding/向量混合检索、三种知识模式与成果修订引用快照。原 20 篇上限仅适用于历史单篇订阅；新知识库支持 50 个入口、每次每入口最多 10,000 节点、托管文档总计 10,000 份，超限明确失败。

下一批在现有模型上增量扩展 Space/Node/SyncRun、文档版本与访问映射，再把 Connector 节点流接入后台任务。同步必须区分完整发现与部分失败；只有完整扫描才能判断节点缺失。权限状态独立于内容版本，撤权先失效，再清理。

数据库变更按审查报告的 expand → 隔离验证 → 授权回填 → 切换执行。任何真实迁移、生产配置和业务写入需要用户明确授权；本批没有用预览绕过这项边界。

## 多入口持续同步代码（待激活）

新增 `FeishuSubscription` 和 `FeishuSubscriptionNode` 两表，通过复合外键绑定现有 connection/workspace/document。复用原 FeishuDocument/SourceItem/FeishuChunk，托管文档使用内部 kind=`wiki-tree`。多个新入口覆盖同一 node_token 时共享文档和 SourceItem；历史单篇身份不做自动合并，避免覆盖已有资料及成果引用。

管理员添加一个或多个 Wiki 链接，并明确确认共享给当前工作空间成员。SPACE 保存链接所属空间；SUBTREE 保存节点及后代。目录扫描完整结束后，在串行化事务中提交节点集合、创建新增文档、更新标题/父节点/对象类型，并将不再出现的旧节点标为 MISSING。部分失败仅标记 UNVERIFIED、保存原目录，不推断删除。上传 Word/PDF、独立 Sheet/Bitable/File 等节点仍保存目录记录，但正文明确 UNSUPPORTED，不能算作已索引。

停止订阅是软删除：撤销该入口的有效覆盖。只有没有其他有效入口覆盖的托管文档才归档、清空正文/片段，并失效已完成的分析与整理。恢复必须重新核验后建立正文，SourceItem 身份保持不变。入口名称和用途可编辑，旧 revision 请求被拒绝。

编辑用途会更新该入口当前覆盖文档的用途及资料标签，保留正文/片段；重叠入口共享文档，所以共享文档的用途按最后一次显式编辑保存。目录层级与各入口名称仍独立，不为用途创建重复正文。

新入口和手动同步请求使用 `syncRequestedAt` 持久保存；沿用已有 30 秒调度检查、5 分钟周期与连接租约，关闭浏览器不丢失已保存请求。失败请求保留等待重试；成功仅清除本轮开始之前的请求，不清除同步中新增的请求。任务中断从头发现，不宣称具备逐页断点续传。

正文哈希使用正文和标题，remoteRevision 独立保存；未变化时保留片段身份。每文档正文/片段替换使用原事务协议。Wiki 检索不再阻塞等待整库扫描，而是对最多 12 个候选文档定向核验；缓存、检索及单资料读取均校验可读 kind 和有效入口覆盖。停用 feature flag 后托管文档不可进入这些 AI 路径，离线或核验失败时回退至其他资料。
