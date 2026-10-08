# AI工作台 1.0 · 融合与本地运行说明

本次实施采用统一 Black Titanium 黑钛风格，基于原融合执行文档的第一阶段。代码保存在 `E:\AI工作台1.0`，独立分支 `fusion/black-titanium-local-1.0`。两个输入目录仅用于读取，未提交或推送远端。

## 来源与范围

- 功能底座：xsj-content-center，分支 `handoff/content-workbench-20261007`，提交 `3386c55ecccd0546aa81830d46f219f10f91732b`。
- 设计参考：duanju-ip-content-hub，main，提交 `999d75c7c678dccd56f20037101c7983ab2b2e65`。
- B 的 Black Titanium 视觉、星球与品牌素材已适配进 React；保留其 MIT 许可于 `apps/web/public/fusion/THIRD_PARTY_LICENSE.txt`。
- A 继续提供唯一认证、工作空间、数据库、API、项目、资料、研究、Skill 和成果底座。未引入 B 的 Vue 运行时、FastAPI 服务或第二套登录。
- 第一阶段：全局及组件配色、导航、响应布局、登录、真实首页概览、最近项目、资料与来源、搜索筛选、成员角色界面、研究展示。
- 未实施执行文档中的可选第二阶段：选题评分/否决/版本审批、事实版本/双人确认。自动发布和真实传播复盘仍是后续独立任务。

## 打开与登录

入口：`http://localhost:3030`。

账号：`admin@workbench.local`。随机初始密码只保存在 `E:\AI工作台1.0\.local-data\initial-login.env`，不会写入报告、日志或版本控制。登录后可以在“设置 → 我的账号”修改密码。修改后初始密码文件不会跟随更新。

这是新数据库，不包含旧工作台中的账号、项目和文件。管理员拥有新空间所有者资格，沿用 A 的 OWNER / ADMIN / EDITOR / VIEWER 权限。不修改原环境权限。

## 日常启动与停止

在 PowerShell 中进入新目录，运行：

```powershell
Set-Location -LiteralPath 'E:\AI工作台1.0'
node scripts/fusion-local.mjs start
node scripts/fusion-local.mjs check
```

也可双击目录中的 `启动工作台.cmd`。停止使用 `停止工作台.cmd` 或 `node scripts/fusion-local.mjs stop`，保留数据。

本次运行未安装开机启动任务。电脑重启后再次执行启动即可。

## 独立运行环境

| 服务 | 地址 | 数据/配置 |
|---|---|---|
| 网页与 API | localhost:3030，仅监听 127.0.0.1 | 已验证构建产物 |
| PostgreSQL 17.11 | 127.0.0.1:55436 | `.local-data/postgres`，数据库 `content_center_upgrade_review` |
| MinIO | 127.0.0.1:19000 | `.local-data/minio`，桶 `workbench-fusion` |
| 配置 | 不对网页公开 | `output/account-upgrade-private/review.env` |
| 日志 | 本机文件 | `.local-data/logs` |

PostgreSQL 原生工具使用临时目录中的 ASCII 路径别名绕过中文路径兼容问题。别名指向新目录，实际数据库仍在新目录内。启动会重新创建缺失别名。

`setup` 仅用于首次安装/校验独立环境；初始化已有数据库时不会重置账号密码。数据库已有其他账号时不会自动提升权限。请保留整个 `.local-data` 和私有配置，不要把其当作缓存删除。

## 重新安装与构建

使用 Node 24 及项目锁定的 pnpm 11.19.0。电脑全局 pnpm 12.9.1 会使嵌套 postinstall 版本检查失败。首次安装时可跳过生命周期，随后直接运行锁定依赖的 Prisma CLI：

```powershell
corepack pnpm install --frozen-lockfile --ignore-scripts
node packages/db/node_modules/prisma/build/index.js generate --schema packages/db/prisma/schema.prisma
node scripts/fusion-local.mjs setup
node scripts/local-release.mjs build
node scripts/fusion-local.mjs start
```

重新构建前先停止网页。构建使用原项目隔离发布机制，无实际数据库连接和外部网络；产物带源文件哈希及 Prisma 原生依赖校验。源码变化后需要重建，不能启动旧产物。

## 外部能力与待启用项

当前采用原项目本地隔离发布配置，Worker、Redis 队列和外部调用关闭，未填入或复制旧环境服务密钥。

- 可用：账号登录、权限、项目与来源管理、文件上传保存、支持文件的原生文本提取、搜索、Skill 管理、研究入口与历史展示。
- AI 生成/改写、联网研究：需要有效模型/搜索服务配置与明确开启外部调用。创建项目本身可用。
- 网址解析、异步粘贴文本采集：记录可以入库，但队列未启动时不会完成后台处理。使用 TXT/MD 文件上传可直接提取原生文本。
- 音视频转录：需要转录服务与相应运行链路，文件上传成功不代表已转录。
- 资讯日报：原项目限制特定管理员身份，新管理员没有该资讯权限。研究入口提供解释与新建研究链接，未绕过权限。
- 自动发布、经营数据复盘：未接入外部平台和真实指标。

完整验收结果、已修复启动问题和未启用功能见交付的部署检查报告。
