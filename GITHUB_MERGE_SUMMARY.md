# GitHub 安全集成总结

记录时间：2026-10-10T18:14:15+08:00（Asia/Singapore）。集成源码参考 HEAD：`783658367057ecd0f8404cbbcc3fb74489685b0c`。详细原始日志在被忽略的 `output/github-audit/`；私有日志和备份没有上传。

STATUS：**LOCAL_INTEGRATED / VALIDATION_FAILED / NOT_PUSHED / NO_PR / NOT_DEPLOYED**。

- 本地最新源码、UI和业务逻辑已经外部备份并建立466adfd快照；备份168,967文件、约39.623GiB、0复制失败，源码1,733文件哈希一致。链接和活动数据库备份限制见合并前审计。
- GitHub默认main `eac630b63434a3cdfa99990a6f7f980fae06674e` 只是既有本地提交的PR合并记录，tree完全相同；独立分支 `integration/github-safe-20261010` 已安全快进，无冲突、无旧功能恢复。
- 本地main仍未切换/合并/推送；原delivery分支与备份引用保留。没有force push、reset/clean/stash/rebase、unrelated-histories。
- 实际提交：

```text
7836583 ci: build pinned official MinIO source for isolated storage tests
2145346 Record generated route declarations and clean-checkout verification order
81087f4 Generate route types in fresh checkouts and validate inline artifact editing
e3952be Verify production artifact hashes against release receipt
5d55403 Preserve committed runtime resources and portable browser selection
ceea840 Include secret-free configurable review environment template
a3d36cc Add reproducible delivery checks and repair verified source boundaries
466adfd Preserve latest local workbench features before delivery verification
```

- 修复：lint/夹具类型、纯契约边界、显式私有profile文件、vendor构建资源、浏览器路径；新增Windows/Linux CI及产物哈希检查。README保留历史副本；环境模板无密钥。
- 各包检查通过；Node33/33、离线单元133/133；全套1642：1341通过、128失败、173pending。干净安装463下载/0复用成功，干净lint=PASS、typecheck=PASS (after next typegen repair)、build receipt=BUILT。
- 失败阻塞推送：当前授权包含集成分支推送，但用户明确要求测试通过后推送，因此没有执行git push或创建远程PR，也没有伪称远程克隆完成。**不需要重复授权独立分支推送；需要先关闭验收失败。**
- 未运行真实Provider、生产迁移/部署和main合并。CI配置未在GitHub执行；本机MinIO源码镜像与5项存储测试已通过；生产存储、历史测试环境与少数契约/旧UI断言仍需判断。

## 审核/回滚入口

审核这七份报告及 `docs/GITHUB_DEPLOYMENT.md`；完整失败文件和原日志路径见CODE_INTEGRITY_REPORT。需要恢复本地旧工作时，外部备份、原HEAD、源码快照tag及bundle均保留，先做新目录恢复并验证链接/数据库一致性。代码回滚用新的revert提交，不丢弃用户工作。

## 后续PR应包含的说明（尚未创建）

目标：在当前main上保护最新本地项目/Agent/成果/研究/飞书/UI源码，并补齐可追溯的交付验证。远程历史无内容差异，冲突0；保留所有新功能及必要legacy兼容。提交与验证结果按本报告记录；必须附全套失败关闭证据、最终干净远程clone结果和CI检查链接。部署目标与真实API验收仍为明确门；main合并与生产部署等待产品负责人批准。

## 补充终态

干净目录最终标准lint/typecheck均8/8，生产构建BUILT及1649产物哈希通过；本机HTTP冒烟通过但ready仍503，不能上线。独立创作E2E1/1与飞书fixture119/119通过，导航专项另有3失败。全部验收门未通过，保持NOT_PUSHED；详细命令、初次失败和复验边界见其他报告。

## MinIO调查与隔离存储复验终态

用户表示没有已审核可拉取镜像并要求继续调查。官方仓库已于2026-04-25归档，社区版源码分发；依据[官方仓库说明](https://github.com/minio/minio)。没有选择任意第三方镜像或更换生产存储。

实际成功命令：`docker build --progress=plain --tag xsj-audit-minio:source-9e49d5e output/github-audit/minio-source-build`，exit0；固定官方提交9e49d5e7a648f00e26f2246f4dc28e6b07f8c84a、Go官方linux/amd64镜像digest c268a04d59aea0b180ed9946a658cfab9e7b3391dc90eed6e4969ccff98c851f；`go mod verify`输出all modules verified。正式复现配方见config/testing/minio-source.Dockerfile。

本地image config ID `sha256:ce413a1c0a4d167aa11e9f781035a97f238b21d00dec887c4c9ae8519216d601`，构建manifest list `sha256:badf5122cb3ca9d210b1ab9927f14f170738b416ae9194698d18005c1289c376`。镜像仅存在本机，**没有推送registry，不得把这些值写成可远程拉取的地址**。运行显示DEVELOPMENT.GOGET（源码构建默认版本字符串），实际来源以固定Git SHA为准；不是官方签名发行二进制或生产安全认证。

实际运行：`docker run --detach --name xsj-github-audit-minio-20261010 --read-only --cap-drop ALL --security-opt no-new-privileges --memory 512m --cpus 2 --tmpfs /data:rw,uid=10001,gid=10001,mode=0700 --tmpfs /tmp:rw,uid=10001,gid=10001,mode=0700 --publish 127.0.0.1:9002:9000 --env HOME=/tmp --env MINIO_ROOT_USER=minioadmin --env MINIO_ROOT_PASSWORD=minioadmin xsj-audit-minio:source-9e49d5e server /data --address :9000`。只用假测试凭据及内存数据，无生产目录或用户卷。

在**全新克隆**执行：`node node_modules/vitest/vitest.mjs run packages/providers/src/minio-storage.test.ts packages/providers/src/s3-compatible-storage.test.ts --no-file-parallelism --reporter=json --outputFile=../clean-storage-results.json`。ENVIRONMENT_ID=LOCAL_TEST、独立测试DB55433、S3_ENDPOINT=http://127.0.0.1:9002、bucket=github-audit-storage-test、external calls disabled，exit0：**5总计、5通过、0失败**；真实本机S3上传/签名下载/删除，不是storage Mock。原Vite兼容警告保留。

CI不再因缺TEST_S3_IMAGE必然停止：默认重建固定官方源码，仅在显式覆盖时要求审核过的registry镜像@sha256:digest；YAML解析通过，但GitHub运行未执行。源码配方和CI提交7836583没有修改2145346构建所覆盖的apps/packages/scripts/vendor。上游归档、依赖安全与AGPL许可适用性仍需生产审查，本轮不作生产许可或安全结论。

全套原诊断128失败/173pending未重跑，不能扣除存储通过项后伪称全套已过；完整资料上传/ASR/专用review链仍未验证。补充终态优先于上文“9002不可用”的原诊断环境记录。

结束时实际执行 `docker stop xsj-github-audit-minio-20261010 xsj-github-audit-postgres-20261010 xsj-github-audit-redis-20261010` 成功，三个本次测试容器均已停止（未删除）；MinIO内存测试数据随停止释放。原有pg16-dev和两个用户Redis容器仍运行，未修改。没有遗留本次HTTP冒烟进程。
