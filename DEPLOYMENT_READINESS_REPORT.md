# 部署就绪报告

记录时间：2026-10-10T18:14:15+08:00（Asia/Singapore）。集成源码参考 HEAD：`783658367057ecd0f8404cbbcc3fb74489685b0c`。详细原始日志在被忽略的 `output/github-audit/`；私有日志和备份没有上传。

**DEPLOYMENT_NOT_APPROVED / NOT_READY。** 生产服务器、线上数据库、云资源、现有绑定没有修改；未执行真实部署或migration deploy。

| 门 | 结果 |
| --- | --- |
| 本地代码保护/历史 | 通过：完整外部备份、源码哈希、Git bundle、快进及提交 |
| 源码检查 | 各包lint/typecheck通过；干净标准命令结果见CLEAN_CLONE_TEST_REPORT |
| 全部必要测试 | 不通过：1642总计/1341通过/128失败/173pending；浏览器/真实Provider不作假通过 |
| 干净生产构建 | receipt：BUILT；日志/manifest/hash结果见干净报告 |
| 可运行基础设施 | 部分通过：固定官方源码MinIO镜像与5项存储测试通过；仍缺FFmpeg PATH和完整独立review环境 |
| CI | 已增加verify.yml，Windows/Linux质量检查+全套integration；固定官方Action SHA、contents:read、无部署步骤；尚未在GitHub运行 |
| 数据库迁移 | additive SQL与Schema同提交；只在新测试库db push，迁移路径NOT TESTED |
| 真实API | NOT TESTED，不使用生产Key或付费调用伪装连接测试 |
| 云部署/健康 | CURRENT IMPLEMENTATION GAP：Render指向历史repo/branch且含自动迁移；当前ready只认本机profiles |
| 商业资源许可 | vendor来源CC BY-NC 4.0，商业适用性待负责人审查，未提供法律结论 |

## 构建证据解释

原workspace首轮Next编译exit0、118静态页面生成、networkDenied0、liveFilesUnchanged=true，但sourceUnchanged=false，因此receiptFAILED且顶层exit1。本任务期间修复源码，不能交付该过期产物。第二次构建也在后续资源修复期间执行，若sourceUnchanged=false同样拒绝。最终证据优先使用稳定commit的干净克隆receipt与产物哈希，不靠历史成功结果。

## 发布前待办

1. 审查128失败及66失败文件：分清环境fixture、过期UI断言与真正契约问题；不绕过安全guard或删除失败测试。
2. CI已默认使用经本机验证的固定官方源码构建配方；如覆盖 `TEST_S3_IMAGE` 则审查registry来源和digest。仍需安装FFmpeg/浏览器，按每组fixture建立互不共用的专用测试目标。
3. 在稳定最终commit重新执行所需数据库/HTTP/浏览器链路、深浅模式与移动端；真实API采用明确授权测试环境。
4. 校验数据库初始系统Prompt/初始化文档，测试迁移在空库与已有库的路径；生产升级须先一致性备份且另行批准。
5. 远程集成分支推送门通过后，从GitHub clone到另一个空目录重做install/build/test，确认GitHub Actions结果；再创建/更新PR。
6. 产品负责人决定部署目标和许可边界；审查Render/Relay/域名/持久盘/worker健康策略，获得主分支合并和生产部署批准。

安装/环境变量/启动/构建/迁移/故障与回滚详细步骤见 `docs/GITHUB_DEPLOYMENT.md`。保存上一份已验证构建、数据库/对象存储备份及稳定加密key；回滚用新revert提交或批准切回前一构建，不force/reset，不自动删迁移表。

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
