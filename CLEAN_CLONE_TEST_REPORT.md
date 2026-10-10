# 干净克隆验证

记录时间：2026-10-10T18:14:15+08:00（Asia/Singapore）。集成源码参考 HEAD：`783658367057ecd0f8404cbbcc3fb74489685b0c`。详细原始日志在被忽略的 `output/github-audit/`；私有日志和备份没有上传。

**性质：项目外从本地集成分支克隆；远程集成分支克隆NOT EXECUTED。** 推送门未通过，禁止把本地结果称为远程克隆完成。

目录：`C:\Users\19075\.codex\visualizations\2026\10\10\01a12525-7c43-7333-a73a-8945d6bdc3e5\clean-clone`。实际命令：

```powershell
git clone --no-hardlinks --branch integration/github-safe-20261010 E:\AI工作台1.2 <project-outside>/clean-clone
git fetch origin integration/github-safe-20261010
git merge --ff-only FETCH_HEAD
$env:pnpm_config_store_dir='<project-outside>/fresh-pnpm-store'
$env:pnpm_config_cache_dir='<project-outside>/fresh-pnpm-cache'
$env:pnpm_config_state_dir='<project-outside>/fresh-pnpm-state'
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm build
node scripts/verify-build-artifact.mjs
```

安装首个多CLI参数尝试被解析器拒绝（unknown frozen-lockfile/state-dir），改用独立目录环境变量后exit0，4m37.1s；日志最终resolved463 / downloaded463 / added463 / reused0。所有依赖从新缓存取得，没有复制原node_modules、`.next`或Turbo缓存；Prisma生成成功。

| 检查 | 本轮结果 |
| --- | --- |
| README/版本/模板 | README重写为当前入口，旧内容保留docs/README_HISTORY_20261010.md；.node-version24.21.0；pnpm11.19.0；local-review.env.example已提交 |
| 包管理器/锁文件 | frozen install通过，未绕过manifest或supply-chain检查；日志有587entries供应链检查 |
| 标准lint | PASS；成功时8/8、0cache |
| 标准typecheck | PASS (after next typegen repair) |
| 原Node启动/边界测试 | 33通过、0失败 |
| 离线单元测试 | 133/133；exit0时仍保留slug/tag-slug worker shutdown timeout警告，不能隐去 |
| 生产receipt | {"id": "release-20261010T100007Z-6901d6fd", "status": "BUILT", "exitCode": 0, "networkDenied": 0, "liveFilesUnchanged": true, "sourceUnchanged": true, "buildId": "6y4GuyLtmgigJ2ch5OeXU"} |
| 产物检查 | `{"id":"release-20261010T100007Z-6901d6fd","status":"BUILT","buildId":"6y4GuyLtmgigJ2ch5OeXU","artifactFiles":1649}` |
| 开发启动 | 原profile check/unit通过；完整新开发环境因review DB/存储独立配置尚未完成；NOT PASSED |
| MinIO/ASR静态依赖 | 官方历史镜像不可取得，固定官方源码镜像已本机构建并通过5项存储测试；ASR模型/venv需独立安装；不能从维护者缓存补齐后伪称干净运行 |
| 静态资源 | 跟踪public/brand和vendor；修复release漏复制vendor；产物manifest检查范围明确 |
| 路径兼容 | frontend browser硬编码E盘路径已移除；Windows辅助.ps1/.cmd与ASR脚本仍为平台专用；Linux CI仅配置，尚未执行 |
| 缺失API配置 | fail-closed策略与对应单测有证据；真实外部服务未测试 |
| 路由刷新/UI | 独立浏览器E2E另见CODE_INTEGRITY_REPORT；未通过不宣称成功 |

源码clean-clone origin是本地路径，远程HEAD与GitHub workflow/PR状态不能用它代替。全局1642项诊断来自原workspace，绝不归入此干净克隆结果。

## 稳定源码产物与本机冒烟

构建源码2145346；最后receipt `release-20261010T100007Z-6901d6fd` 为BUILT，exit0、networkDenied0、sourceUnchanged=true、liveFilesUnchanged=true；BUILD_ID `6y4GuyLtmgigJ2ch5OeXU`，1649文件SHA-256检查通过。最终报告提交只增加交付资料，不替代这条源码构建证据。

实际命令 `python output/github-audit/production-smoke.py`：从干净克隆receipt的workspace执行 `node <clone>/apps/web/node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3047`，结束只停止自己的子进程。结果：存活200、登录200、未登录/home跳转/login200、两个品牌SVG200；ready503且ready=false。专用LOCAL_TEST假配置、external calls disabled、worker disabled。**证明产物可以启动与响应，不证明生产配置、存储、真实API或部署就绪。**

最初冒烟混用了LOCAL_TEST与LOCAL_REVIEW_OFFLINE=true，instrumentation按现有guard拒绝 `REVIEW_SAFETY_FLAGS_REQUIRED` 并超时。保留初始失败日志，修正独立测试配置为LOCAL_REVIEW_OFFLINE=false后通过；没有修改或放宽应用安全guard。该进程已停止。完整JSON/log在项目外验证目录。

## MinIO调查与隔离存储复验终态

用户表示没有已审核可拉取镜像并要求继续调查。官方仓库已于2026-04-25归档，社区版源码分发；依据[官方仓库说明](https://github.com/minio/minio)。没有选择任意第三方镜像或更换生产存储。

实际成功命令：`docker build --progress=plain --tag xsj-audit-minio:source-9e49d5e output/github-audit/minio-source-build`，exit0；固定官方提交9e49d5e7a648f00e26f2246f4dc28e6b07f8c84a、Go官方linux/amd64镜像digest c268a04d59aea0b180ed9946a658cfab9e7b3391dc90eed6e4969ccff98c851f；`go mod verify`输出all modules verified。正式复现配方见config/testing/minio-source.Dockerfile。

本地image config ID `sha256:ce413a1c0a4d167aa11e9f781035a97f238b21d00dec887c4c9ae8519216d601`，构建manifest list `sha256:badf5122cb3ca9d210b1ab9927f14f170738b416ae9194698d18005c1289c376`。镜像仅存在本机，**没有推送registry，不得把这些值写成可远程拉取的地址**。运行显示DEVELOPMENT.GOGET（源码构建默认版本字符串），实际来源以固定Git SHA为准；不是官方签名发行二进制或生产安全认证。

实际运行：`docker run --detach --name xsj-github-audit-minio-20261010 --read-only --cap-drop ALL --security-opt no-new-privileges --memory 512m --cpus 2 --tmpfs /data:rw,uid=10001,gid=10001,mode=0700 --tmpfs /tmp:rw,uid=10001,gid=10001,mode=0700 --publish 127.0.0.1:9002:9000 --env HOME=/tmp --env MINIO_ROOT_USER=minioadmin --env MINIO_ROOT_PASSWORD=minioadmin xsj-audit-minio:source-9e49d5e server /data --address :9000`。只用假测试凭据及内存数据，无生产目录或用户卷。

在**全新克隆**执行：`node node_modules/vitest/vitest.mjs run packages/providers/src/minio-storage.test.ts packages/providers/src/s3-compatible-storage.test.ts --no-file-parallelism --reporter=json --outputFile=../clean-storage-results.json`。ENVIRONMENT_ID=LOCAL_TEST、独立测试DB55433、S3_ENDPOINT=http://127.0.0.1:9002、bucket=github-audit-storage-test、external calls disabled，exit0：**5总计、5通过、0失败**；真实本机S3上传/签名下载/删除，不是storage Mock。原Vite兼容警告保留。

CI不再因缺TEST_S3_IMAGE必然停止：默认重建固定官方源码，仅在显式覆盖时要求审核过的registry镜像@sha256:digest；YAML解析通过，但GitHub运行未执行。源码配方和CI提交7836583没有修改2145346构建所覆盖的apps/packages/scripts/vendor。上游归档、依赖安全与AGPL许可适用性仍需生产审查，本轮不作生产许可或安全结论。

全套原诊断128失败/173pending未重跑，不能扣除存储通过项后伪称全套已过；完整资料上传/ASR/专用review链仍未验证。补充终态优先于上文“9002不可用”的原诊断环境记录。

结束时实际执行 `docker stop xsj-github-audit-minio-20261010 xsj-github-audit-postgres-20261010 xsj-github-audit-redis-20261010` 成功，三个本次测试容器均已停止（未删除）；MinIO内存测试数据随停止释放。原有pg16-dev和两个用户Redis容器仍运行，未修改。没有遗留本次HTTP冒烟进程。
