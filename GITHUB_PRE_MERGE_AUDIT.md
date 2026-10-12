# GitHub 合并前审计

记录时间：2026-10-10T18:14:15+08:00（Asia/Singapore）。集成源码参考 HEAD：`783658367057ecd0f8404cbbcc3fb74489685b0c`。详细原始日志在被忽略的 `output/github-audit/`；私有日志和备份没有上传。

## 环境与只读命令

| 检查 | 实际命令 | 结果 |
| --- | --- | --- |
| 根目录 | `Get-Location` | `E:\AI工作台1.2` |
| 原分支/状态 | `git status --short --branch`、`git status --porcelain=v1 -uno` | `delivery/workbench-20261009`；123 个已跟踪文件修改，363 个未跟踪文件；状态按目录折叠为238条 |
| 远程 | `git remote -v` | `https://github.com/haoh70803-source/-AI-.git` |
| 默认分支 | `git ls-remote --symref origin HEAD` | `refs/heads/main`，远程 `eac630b63434a3cdfa99990a6f7f980fae06674e` |
| 原始 HEAD | `git rev-parse HEAD` | `242f7b911e369d4c93d0deccc02ee368cfd90137` |
| 引用获取 | `git fetch origin --no-tags` | 成功；origin/main 从696d0f3更新到eac630b，不改工作区文件 |
| 共同祖先 | `git merge-base HEAD origin/main`（同步前） | `242f7b911e369d4c93d0deccc02ee368cfd90137` |
| 分歧数量 | `git rev-list --left-right --count HEAD...origin/main`（同步前） | `0 1`；远程只多一条PR合并记录 |
| 文件树 | `git diff --quiet HEAD origin/main`（同步前） | exit 0，文件树完全相同 |
| 版本 | `node --version`、`pnpm --version`、`docker --version` | Node v24.21.0；pnpm11.19.0；Docker29.8.2 |
| Git特殊结构 | `git ls-files --stage`、根配置检查 | 无submodule；未发现LFS配置/pointer；pnpm workspace共9个项目（根+8包） |

第一次沙箱内远程访问失败 `Could not resolve host: github.com`，经权限环境重试成功；pnpm 在沙箱内路径检查报拒绝访问。没有将网络/工具失败报告为代码通过。

技术栈为 Next.js16.3.4 / React19.2.8 / TypeScript6.0.3 / Prisma6.19.3、PostgreSQL、Redis/BullMQ、S3-compatible/Render Relay、可选 Python 本地ASR。启动、检查和构建脚本来自 package.json。发现四份Compose、worker Dockerfile、三份Render配置；原仓无 `.github/workflows`。没有修改四份权威治理文件。

## 本地备份与恢复边界

- 外部目录：`E:\AI-workbench-backups\20261010-173038\project`。
- 实际命令：`robocopy E:\AI工作台1.2 <backup>\project /E /SL /XJ /R:1 /W:1 /NP /NFL /NDL /LOG:<backup>\robocopy.log`。
- Robocopy exit1为成功复制状态；168,967个文件、约39.623GiB、0失败、0mismatch。保留.git、未提交/未跟踪源码、被忽略的本机资料、依赖、构建和虚拟环境；未覆盖既有备份。
- `/XJ` 未展开1,673个链接目录。另做当前链接清单，发现1,687个链接（构建期间新增链接使数量变化），均指向项目内部；恢复时按清单重建链接或重新安装依赖，不声称备份能直接作为启动目录。
- 合并前源码清单1,733个文件、91,827,858bytes；逐一比较备份SHA-256，0缺失、0不一致，含 `.dsh-audit-css.py` 和QA资料。清单保存于外部 `source-manifest.json`。
- `local-changes.patch` 保存原始binary diff；`traceable-history.bundle` 由 `git bundle create ... --all` 生成，`git bundle verify` exit0。Git备份分支 `backup/pre-integration-20261010-173038` 指向原HEAD；源码快照提交466adfd；本地annotated tag `backup/local-source-20261010` 指向该快照。
- `output/account-upgrade-private` 私有env、`.local-data`、ASR虚拟环境、缓存等不进入远程；新开发者要独立配置。Docker卷、项目外数据库/模型缓存不属于文件复制备份。运行中的数据文件不是一致性数据库导出，未宣称数据库灾备验收通过。

## 凭据与发布约束

候选文本扫描使用private-key/GitHub token/API key/AWS key模式，泛化credential-literal命中主要为测试假凭据与QA页面快照。QA全部保持私有并新增忽略规则。历史高特征扫描覆盖1710个文本blob，命中0；这不是穷尽秘密证明，二进制图片及第三方制品不作无秘密认证。未提交真实.env、私钥、Token或生产数据；`.env.example`只含占位符/测试值。

用户当前任务明确授权独立分支提交、推送及PR；推送前仍要求验证通过。main/master merge与生产部署未授权，当前不会执行。README/Render历史仓库引用与当前origin不同，以实际远程和权威产品文档为准。
