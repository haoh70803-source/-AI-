# 飞书集成运行与回滚

日期：2026-10-09。连接器、管理员预览与多入口持久知识库同步代码已完成定向开发验证；未执行现场迁移、真实业务回填或真实租户验证。

## 当前批次

- 沿用既有 Next Web/Worker/PostgreSQL/Prisma，不安装新依赖。预览不需要 DDL；持久知识库新增两表，必须先迁移再启用。
- App ID/Secret 仍通过现有飞书管理页面服务端加密保存；不得将聊天文本/日志当密钥传递渠道。现有 `INTEGRATION_ENCRYPTION_KEY` 保持原值，不生成或替换生产主密钥。
- 环境片段样例位于 `config/environments/feishu.env.example`，只展示已有离线边界，不是完整可启动配置。本次没有修改 .env 或运行 profile。
- 离线环境禁用飞书 Scheduler，已有运行中定时器也在 tick 内检查。手动同步返回 OFFLINE，AI 飞书上下文返回空且不使用正文缓存。
- 在 `/library/feishu` 由 OWNER/ADMIN 点击“读取授权空间”并选择空间，或提交 Wiki 链接“定位知识空间”。提交链接后自动遍历该节点子树；点击“读取整个知识空间目录”遍历根目录及所有应用可见后代。打开页面不会自动联网；目录遍历不自动订阅、不修改飞书、不写正文索引。

## 验证与运行

在已安装依赖的仓库根目录运行数据库无关测试：

```powershell
node node_modules/vitest/vitest.mjs run --config packages/integrations/vitest.feishu.config.ts
node node_modules/typescript/bin/tsc -p packages/integrations/tsconfig.json --noEmit
node node_modules/typescript/bin/tsc -p apps/web/tsconfig.json --noEmit --incremental false
```

独立测试配置只包含飞书模拟响应、模拟数据库和 DOM 夹具；没有加载根测试库 setup，不会跑 migration 或业务数据库夹具。需要实际租户测试时，先确认已配置应用发布/只读 scopes、空间/文档授权，使用少量已授权节点。当前批次未执行。

应用启动/打包遵守现有 daily/live/release profile，不复制历史 LOCAL_REAL legacy 启动或 db:migrate 命令。离线 profile 不能为了预览擅自改变外部调用开关。工作台主要运行形态仍是现有 Web，未据此提前实施 Desktop 交付。

## 本批回滚

尚未执行迁移，因此现场无需数据库回滚。持久功能如已启用，先通过管理入口停止全部 Wiki 订阅并确认托管正文/片段已清除，再关闭 `FEISHU_WIKI_SYNC_ENABLED`；保留新表用于排查，旧单篇订阅和 SourceItem 身份不变。不要直接回滚到不识别托管 kind 的旧代码而留下 READY 托管文档。保留用户成果与旧密钥；模块转发文件与知识业务目录需一起回滚。

工作区同时存在其他任务修改；回滚仅针对飞书改动 hunk，不能 git reset/clean 或覆盖共享 Assistant 文件。Git 暂存/提交/推送均需单独明确授权。

## 后续迁移方案（尚未实施）

本轮已编写 `packages/db/prisma/migrations/20261009083000_feishu_wiki_subscriptions/migration.sql`，新增 FeishuSubscription/FeishuSubscriptionNode 两表、索引与 Workspace 复合外键，未执行。未来 SyncRun/检查点、个别用户权限映射和版本索引仍以审查报告为后续提案。

后续顺序：新增兼容 schema/迁移 SQL → 隔离库验证/恢复演练 → 明确授权现场迁移和回填 → 关闭新能力进行部署 → 按空间逐个核验 → 启用索引供给。旧链接记录保留 SourceItem 身份，不自动全员共享新空间。

回滚以关闭新入口/队列与逻辑版本切换为先；只有来源权限仍有效才允许切回旧内容版本。撤权不能被应用回滚恢复。新表留存排查，DROP/down SQL、备份、现场配置与业务数据恢复需要独立批准；本批不提供未经实现和验证的生产 DROP 脚本。

## 本轮启用顺序与授权范围

1. 人工明确目标为当前本地工作台的数据库，审核两表 SQL，备份并确认恢复方案；不要借此授权迁移其他环境。
2. 先在获准的隔离数据库执行迁移/生命周期验证，再在获准目标库执行仅本轮新增迁移。先核对待执行 migration 列表，不能直接 `migrate deploy` 夹带其他任务迁移。
3. 暂停需重启的本地服务后完成 Prisma 客户端生成。现场生成遇到正在使用的 query_engine-windows.dll.node rename EPERM，未停止服务；不能把这次 generate 记为完整成功。
4. 仅在获准运行 profile 启用 `FEISHU_WIKI_SYNC_ENABLED=true`，保留既有密钥与数据库，遵守线上/离线出口规则；重启服务以加载新 Prisma delegate。
5. 使用一个小型授权 Wiki 节点验证目录、正文和撤权；之后由管理员添加多个空间入口，确认共享范围，再执行首次后台回填。首次添加/回填属于实际业务写入，需要原任务要求的明确授权。
6. 每 5 分钟重新扫描/同步；手动请求在服务运行时由 30 秒调度检查处理。状态、节点和索引数来自数据库。上传 Word 文件会显示正文不支持，不得把它的目录记录算成正文入库。

若服务未运行，请求保留到下次启动。当前没有独立 SyncRun 检查点或实时事件订阅；飞书侧原文增删改不由本系统执行。
