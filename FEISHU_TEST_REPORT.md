# 飞书集成定向验证报告

## 2026-10-10 CLI 真实只读诊断

后续人工配置与授权后：全新应用 token 的 bot/info 返回 code=0，确认机器人能力已生效。用户明确授权创建专用私有群后，CLI 成功创建“鑫世界知识库只读接入”（oc_98bdb41808b5ecb6f5a55e52a8d36bd4），群主为已授权用户；机器人身份读取群成员成功，确认用户已加入及机器人具备群内访问权限。未发送群消息。此后续操作包含真实群创建，不能沿用下文“真实只读诊断”作为全部会话的写入边界。知识库空间授权尚未变更、应用根目录访问仍为 131006；未授予应用或群管理/编辑权限。

- 独立安装官方 lark-cli 1.0.97，安全复用唯一启用连接至命名配置 xinworld-wiki-support；不替换工作台凭证。
- 用户扫码登录成功，Wiki 只读授权有效。使用官方原始 API 命令递归读取销售部空间 7667109758477863923，取得 16 个节点、7 页、3 层：docx 9、file 6、bitable 1。这里只证明用户可见目录完成，不证明正文可读、已建索引或其他用户权限相同。
- 应用根目录读取已取得真实 131006（资源授权不足）；auth status 应用机器人检查返回 11205（app do not have bot）。此机器人检查失败不表示 tenant_access_token 无效。
- CLI 的 +node-list 快捷命令要求 wiki:node:retrieve；使用已授权 wiki:wiki:readonly 的原始 wiki nodes list 命令由飞书服务端鉴权成功，无需因快捷命令本地门禁重复申请权限。
- 本轮未变更飞书空间成员、文档正文、数据库 Schema 或工作台业务数据；未完成应用身份整库读取验收。机器人能力开启和发布需要开发者后台操作，不能将用户扫码成功当作应用获得空间授权。

日期：2026-10-09。范围：第一批模块边界、只读 Connector、管理员目录/正文预览与离线隔离。不是整库 RAG/生产交付验收报告。

## 本轮目录访问失败诊断验证

2026-10-09：仅运行 Connector 与 browse Service/API 两个测试文件，50 项通过。新增 4 项覆盖错误码 131005、131006、99991672 的安全回显、空间根目录与节点子目录错误区分、请求编号过滤及权限失败不重试。没有真实飞书请求；尚未获取截图所对应的上游错误码，因此不能把权限问题的具体原因标记为已确认或已修复。

## 已执行结果

- 独立飞书测试配置：6 个文件，61 项测试通过（包括 Connector/解析、管理 Service/API、DOM 预览、原有缓存再授权和离线来源隔离）。全部使用模拟 HTTP 与数据库对象，没有真实 API 或数据库读写。
- integrations 模块 typecheck 通过；Web typecheck 通过（禁用 incremental 写入）。
- 本次新增/修改的飞书文件定向 ESLint 通过。

复现命令：

```powershell
node node_modules/vitest/vitest.mjs run --config packages/integrations/vitest.feishu.config.ts
node node_modules/typescript/bin/tsc -p packages/integrations/tsconfig.json --noEmit
node node_modules/typescript/bin/tsc -p apps/web/tsconfig.json --noEmit --incremental false
```

## 覆盖

| 测试 | 证明的行为 |
| --- | --- |
| `packages/integrations/src/feishu/client.test.ts` | token 过期/并发刷新、限流/服务失败预算、权限失败不重试、固定 API origin/脱敏日志、离线/取消/大小限制、多级多页/循环/归属异常、结构分页/revision、旧链接正文协议 |
| `packages/integrations/src/feishu/docx.test.ts` | 标题路径、段落/列表、文末覆盖、表格行列、安全链接、未知元素/PARTIAL、缺失/孤立/重复/循环块、字符预算 |
| `packages/integrations/src/feishu/service-boundary.test.ts` | 离线不清空索引、不复用飞书内容，非飞书上传资料不受连接故障影响 |
| `apps/web/tests/feishu-browse.test.ts` | OWNER/ADMIN 后端边界、凭证不回显、对象解析/未支持类型、读取后权限/连接 revision 再校验、同源/登录/参数/no-store |
| `apps/web/tests/feishu-wiki-browser.test.tsx` | 不自动请求/索引，多层目录/加载更多，失败重试、PARTIAL 说明、正文按纯文本显示 |
| `apps/web/tests/assistant-feishu-cache.test.ts` | 缓存只存 ID、再核验/最新版本、失效回退、成员禁用、离线不使用缓存 |

## 环境问题与处理

普通沙箱执行遇到 pnpm 路径 canonicalization 与 Vitest 临时文件 rename 的 EPERM，改用 node 入口和受审核的本地静态检查/模拟测试执行权限，未访问业务库。

Prisma 客户端生成最初遇到依赖 realpath EPERM，随后在已有查询引擎 DLL 被占用时报告 rename EPERM。没有停止现有服务、替换主密钥或执行迁移；后续类型检查使用可读取的现有生成类型并通过。该生成失败不记为数据库验收成功，不据此宣称重新生成客户端已完整成功。

独立 DOM 测试首次因 Next 的 `jsx=preserve` 解析失败，已在仅飞书测试配置中使用 Vite Oxc automatic JSX；未修改 Next 编译配置。新增离线判断使旧缓存测试缺少 mock export，已补齐 mock 并新增离线测试。

## 未执行与未交付能力

未运行生产 build、全仓测试、真实 Playwright 浏览器/真实租户 API、旧数据库写入型 feishu 集成夹具、现场部署或 V3 全局关键验收。当前验证为定向开发验证，不能替代模块最终 V2/V3 收口。

空间持久同步/幂等增量/版本切换、用户节点 ACL/派生资料撤权、Embedding/向量/混合检索、三种知识模式/成果版本引用、真实模型生成仍未实施，因此相应最终验收尚未执行。没有用本批 61 项通过数冒充这些能力已通过。

数据库迁移、配置和业务写入按用户原约束等待明确授权，不在此报告中伪造成功记录。

## 2026-10-09：空间为空的接入修复

用户已授权排障及操作。本批新增 Wiki 链接定位与既有订阅链接预填、已定位子树选项、空页与最终空列表的不同提示；没有修改凭证、数据库或应用授权。

最终定向测试：6 个文件、72 项通过（本次运行，不沿用上一批结果）；相关 ESLint 通过，integrations 类型检查通过。新增验证覆盖固定 origin 链接解析、恶意域名/普通 Docx 拒绝、真实节点空间 ID、缺少空间 ID 和撤权错误、严格子树范围、空页后续分页、预填不自动联网。

完整 Web 类型检查遇到 `apps/web/.next/dev/types/routes.d.ts:356` TS1128。现场读取确认生成文件包含重复 RouteContext 尾部和额外闭括号；未改动该生成文件或 next-env.d.ts，不能把完整 Web 类型检查记录为通过。

补充使用 TypeScript API 和既有 Web tsconfig，仅以本次 6 个飞书 Web 文件为入口检查其依赖，显式包含 Next 全局/image 声明：0 diagnostics。该定向检查不替代完整 Web 类型检查。初次尝试排除生成文件后检查整个 Web 时发现 PageProps/RouteContext 缺失和本次 React createElement 的可选整体 props 参数类型错误；已改为标准组件 props 参数，并在最终定向检查及测试中通过。缺少生成类型的整仓尝试未记为通过。

未调用真实租户 API：用户提供的是 `open.feishu.cn/document/.../wiki-overview` 开发者文档，不是企业 `/wiki/{node_token}` 页面，不能作为目标空间样本。没有宣称空间授权已修复或已完成整库同步。

## 2026-10-09 16:02（Asia/Singapore）：完整目录读取

本批交付为 Wiki 目录读取，非整库正文入库。新增自动子树遍历、整空间遍历入口、逐父节点自动分页、实际进度、取消与完整性状态、跨页连接版本核对；原单篇同步/索引/AI 路径不变。

最终定向验证：6 个文件、83 项测试通过；完整 Web 类型检查与本批相关 ESLint 通过。此时 Next 生成文件已经可解析，先前生成文件阻断属于上批历史结果，本批未修改生成文件。未执行 build、全仓测试、真实浏览器 E2E、数据库迁移或真实租户读取。

新增测试覆盖 29 个节点/4 页的多层目录（超过旧 20 篇订阅上限）、展开已读目录不重复请求、链接子树与整空间兄弟节点、子目录权限失败及重试、空页后继续翻页、重复 cursor、节点循环/错空间/错父节点、读取期间连接版本变化丢弃数据、取消后不追加请求、64 层预算超限明确失败。既有 Connector、解析、权限 API、离线与 AI 缓存测试同轮通过。

默认沙箱首次执行出现 Vitest 临时缓存 rename EPERM，未能运行用例；使用受审核的模拟测试执行环境重跑后通过。测试夹具没有调用真实 API 或写入业务库。

尚缺真实企业 Wiki 页面链接，因此未验证用户租户的空间/节点授权，也不能宣称所有不可见目录已授权。目录完成只表示应用可见范围遍历成功；实时修改、页面关闭后恢复及持久同步仍需后续能力。

## 2026-10-09：多入口持久同步代码（等待迁移启用）

本轮从只读目录预览扩展到多空间/子树持久订阅。两表 migration 已编写，未执行。运行 profile 和真实凭证未更改，`FEISHU_WIKI_SYNC_ENABLED` 默认关闭；因此当前现场仍不能写入新订阅。

本轮最终定向验证：8 个文件、115 项知识库、连接器、权限、离线、AI 缓存和管理 UI 模拟测试通过。integrations 与完整 Web 类型检查、相关 ESLint 和 Prisma schema validate 通过。Prisma validate 使用虚拟 schema URL，不连接数据库。

新覆盖：多个入口与同一入口去重、多个入口覆盖同一文档时共享资料身份、所有后代目录和 UNSUPPORTED 节点保存、正文/标题更新、纯 remoteRevision 更新不重建片段、新增/移动/改名、完整扫描移除和清除派生分析、部分扫描不误判删除且停止旧检索、停止/恢复及新鲜授权、Workspace 隔离和乐观 revision、停止中禁止同步复活、数据库事务模拟回滚、持久手动请求与新请求保留、候选文档定向核验不扫描整库、feature flag 关闭后不提供托管资料、存储目录读取后再次校验连接版本、多链接/共享确认表单和实际统计展示。

模拟事务夹具没有连接 PostgreSQL。真实 DDL/FK、并发进程租约、备份恢复、真实飞书授权/正文读取和浏览器 E2E 均未验证；没有运行全仓 build 或 V3 验收。默认接口以既有 5 分钟周期同步，当前没有 SyncRun 分页检查点、实时事件订阅或独立用户节点 ACL。

本地 Prisma generate 两次均遇到正在使用的 query_engine-windows.dll.node rename EPERM，不能记为完整成功。生成的声明足以进行当前静态类型检查，但启用前必须在获准的服务重启窗口重新生成完整客户端。

截图中的上传 Word/File、独立 Sheet 等目录条目会持久保存并显示 UNSUPPORTED；本轮正文入库仍支持原生 Docx，不假称上传文件正文已完整解析。飞书原文的增删改不会由工作台执行。
