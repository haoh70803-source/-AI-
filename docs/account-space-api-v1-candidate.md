> **历史模块说明（2026-10-07交接标注）：** 本文保留原阶段范围和设计记录；当前运行版本、验证状态与待完成项请先读[内容工作台协作交接](WORKBENCH_HANDOFF.md). 产品定义仍以根目录权威文档为准。

# 账号与公司空间管理 V1 + 用户自助 API 配置 V1 候选

> 后续 UI 与存储迭代已完成，当前设置采用小窗口与本机文件存储。最新功能、验证与边界见 [设置窗口与本机存储说明](settings-window-local-storage.md)。下文保留初始候选验收记录。

STATUS: READY_FOR_REVIEW / 未暂存、未提交、未合并。

## 开发环境

- 独立目录：`D:\Documents\ChatGPT\内容生产中心-account`
- 独立分支：`feat/account-space-api-v1`
- 基线与当前 HEAD：`883dd84cd66e4a579b5126b5e317f9c854dd94e5`
- Web：`http://localhost:3014/settings`
- 独立 PostgreSQL：`127.0.0.1:55434/content_center_account_test`。
- 独立 Redis：`127.0.0.1:6381`。
- Docker Compose project：`content-center-account`；独立 PostgreSQL volume。
- `scripts/account-env.mjs` 检查固定数据库地址、库名、Web 与 Redis 端口；加密密钥和 Auth secret 随机生成到 Git 忽略的 `.env.account`。
- 登录 cookie 使用独立的 `account-v1` 前缀，避免与 localhost:3013 的主开发环境互相覆盖。

## 复用内容

沿用 Better Auth 邮箱密码登录、Session、修改个人资料、改密码及退出接口。成员账号使用 Better Auth 的密码哈希和 credential issuer，在同一数据库事务中创建 User、Account、WorkspaceMember；没有第二套登录系统。沿用 Workspace、OWNER/ADMIN/EDITOR/VIEWER、IntegrationConfig、AES-256-GCM 加密、OpenAI Compatible Adapter、RedFox / 豆包 / FunASR 客户端及业务模型路由。

## 用户账号

已接通登录、退出、当前用户/公司/角色、姓名修改、当前密码验证后的密码修改，以及撤销其他设备会话。登录失败使用中文提示，包含账号停用时的联系管理员指引。

本候选采用**管理员创建账号**。未增加公开自助注册；原仓库显式启用的内部邀请码注册能力保留，独立验收环境关闭。所有者的初始创建沿用已有管理员引导流程。

## 公司空间

展示名称、人数、创建时间、状态；所有者/管理员可改名称；用户可切换自己正常加入的空间。当前空间保存在服务端 Session，页面/API 共用同一解析逻辑。已选空间不可用时拒绝访问，显示不可用页，允许转入其他正常空间，不静默切到其他公司的数据。

## 成员权限

支持创建新成员账号、成员列表、角色修改、停用/恢复、移除。

| 角色 | 规则 |
|---|---|
| OWNER 所有者 | 管理管理员、普通/只读成员及公司 API |
| ADMIN 管理员 | 管理普通/只读成员及公司 API；不能管理所有者或其他管理员 |
| EDITOR 普通成员 | 沿用业务写入与 AI 权限；不能管理公司成员/API |
| VIEWER 只读成员 | 沿用正式只读规则；拒绝项目写入、API 修改/连接测试等操作 |

所有者不可在成员页降级、停用或移除；不能修改自己的成员权限。成员治理事务锁定当前 Workspace 后重新读取操作者权限。跨空间成员 ID 返回不存在。停用作用于 WorkspaceMember，不停用用户在其他公司的身份。移除只删除成员关系，保留 User、项目、资料和成果。

已有邮箱不能被公司管理员直接接管、改密或附加到当前公司；V1 创建新成员账号，已有账号加入需后续邀请接受流程。

## 模型与 API

- Kimi、DeepSeek：沿用现有模型目录，保存所选模型作为公司默认。
- 自定义模型服务：服务名称、公开 API 地址、Key、模型名称、启停、真实连接测试；复用 OpenAI Chat Completions。支持文本与 JSON Object 输出，不声明图像、工具或深度推理能力。
- 每个公司保留现有的一项 LLM 配置；切换服务替换当前默认，不新增多服务/多密钥 Provider Schema。
- RedFox：保存凭据、启停，输入公开作品链接后调用现有 parseWork 进行真实验证。
- 豆包：沿用认证方式、资源 ID 和 FLASH / RECORDING_FILE_2_0 协议；用用户指定的公开短音频执行转录测试。
- 转录：本地 FunASR / 豆包默认选择；本地不要求 Key，提供真实健康检查。测试本地连接不代表所选模型一定已安装，页面保留真实模型状态。
- 默认采用公司自助配置，包括 production。仍可显式设置 `SYSTEM_MANAGED_PROVIDERS=true` 保留系统托管模式。
- 自定义服务已通过现有 `ModelRouter → loadLLMRuntime → OpenAICompatibleLLMProvider` 实际 HTTP 请求测试。

## API Key 安全

- 复用 AES-256-GCM 服务端加密；数据库 publicConfig、API 返回和审计记录均不保存完整 Key。
- 页面只显示掩码和末四位；短密钥完全掩码；重新编辑必须输入新 Key。
- 不写入 localStorage；成功保存后清空表单中的密钥状态。
- 服务或接口地址改变时要求重新输入密钥，防止把旧 Key 自动发送到新地址。
- 携带凭据的外部请求使用公开 HTTPS、DNS 地址固定、禁止重定向、响应大小限制与超时；保留原模型 SSE 流式输出。仅隔离测试允许显式指定本地 fixture origin。
- 连接测试不反射第三方原始错误、堆栈、响应正文或 Key；页面显示中文结果。

## 页面与 UI/UX

设置中心、我的账号、公司空间、成员与权限、模型与 API、数据与存储、关于，以及空间不可用页面。

按新版界面的浅灰紫底、白色内容面、紫色主操作、紧凑分组和列表设计。仅只读参考主目录新版样式，没有复制主目录未提交研究实现。新增样式限定在设置模块，保留基线应用外壳。

成员列表优先，添加表单按需展开。默认模型配置放在 API 页首屏；标明公司作用域和服务替换规则。数据与存储只展示真实配置状态，不提供假备份/恢复操作。

## 数据库

新增 additive migration `20260928090000_account_space`：

- Session.activeWorkspaceId（nullable）
- Workspace.disabledAt（nullable）
- WorkspaceMember.disabledAt（nullable）

无删除、无清空、无数据重写。全部 58 条迁移已在新的隔离数据库执行成功；Prisma validate 和 migrate status 通过。没有向主数据库、正式或预发布环境执行迁移。

## 验证

定向自动化测试共 **133 项通过**：

- account-space：7
- account-api-connection：6（本地真实 HTTP fixture，涵盖掩码、隔离、失败清洗、自定义业务路由）
- auth.integration：1
- ai-control：12
- integrations 的 service/schema/encryption/policy：31
- providers 的 OpenAI/RedFox/豆包/safe-url：73（包括流式回归）
- db workspaces：3

HTTP smoke 验证：真实登录后，对成员/配置 API 和项目写入检查只读限制、跨空间拒绝、停用/恢复、资料修改、密码修改、退出及会话失效。

浏览器实际操作：登录 → 设置 → 添加成员 → 改只读角色 → 停用 → 恢复；保存自定义测试配置 → 掩码回显 → 测试连接真实失败。检查 API 响应无完整测试 Key、localStorage 无 Key；检查 390px 移动宽度无页面/输入控件横向溢出。用于失败测试的 API 配置已删除，避免留作真实服务。

Web、db、integrations、providers typecheck 通过；变更 TypeScript 文件定向 ESLint 通过；git diff --check 通过。未跑全仓 Playwright 或全仓构建。

截图位于 `output/playwright/`。标为“验收失败演示服务”的截图是隔离测试证据，不表示有真实可用外部 API。

## 暂未完成 / 后续能力

邮件邀请、已有账号接受邀请、所有权转移、自定义权限、SSO/LDAP、API 用量报表、多服务配置档案/智能路由、独立个人 API 覆盖层、系统凭据库、桌面/License、备份恢复均未扩张实现。

## 风险与真实限制

1. 没有提供真实第三方凭据：成功链路使用隔离 HTTP fixture 验证；真实服务商账户、额度和实际转录成功仍需人工配置后验收。未使用主项目凭据。
2. 旧生产环境如果依赖隐式系统托管，接入候选时需明确选择公司自助配置，或保留 `SYSTEM_MANAGED_PROVIDERS=true`。
3. 主目录也在修改设置入口和部分共享文件，人工集成时须逐文件/逐 hunk 合并，不应覆盖研究窗口的改动。
4. 本轮为所列模块与调用边界的定向验证，不是全仓安全审计或生产容量验证。外部 API 连接测试可能由服务商计费。

## 边界与 Git

主研究开发目录没有被本任务修改。所有代码、配置、迁移、验收截图均位于独立开发副本。未读取或复用主环境秘密，未共享可写数据库。

当前分支 `feat/account-space-api-v1`；HEAD 与指定基线相同；暂存为空。完整修改与未跟踪文件列表见 `account-space-api-v1-files.txt`。

commit = NO；push = NO；merge = NO。

## 复现与验收

```powershell
docker compose -f docker-compose.account.yml up -d
node scripts/account-env.mjs pnpm --filter @content-center/web exec next dev --port 3014
```

现有验收账号的凭据只在 Git 忽略的 `apps/web/.env.account-preview`。如需新的隔离验收账号：

```powershell
node scripts/account-env.mjs pnpm --filter @content-center/web exec tsx scripts/account-preview.ts
node scripts/account-env.mjs node scripts/account-http-smoke.mjs
```

NEXT：停止扩张，等待人工验收。不要自动暂存、提交、推送或合并。
