# 代码完整性与功能验证

记录时间：2026-10-10T18:14:15+08:00（Asia/Singapore）。集成源码参考 HEAD：`783658367057ecd0f8404cbbcc3fb74489685b0c`。详细原始日志在被忽略的 `output/github-audit/`；私有日志和备份没有上传。

## 结论

**未达到完整验收，不推送/合并main/生产部署。** 项目源码保存成功，关键新模块有通过记录，但全套测试存在失败。自动修复没有删除功能、关闭lint/类型检查或改失败测试为skip。

| 验证 | 实际执行与结果 |
| --- | --- |
| 原workspace标准检查尝试 | `pnpm exec turbo lint --force` / typecheck触发pnpm隐式install，Prisma DLL EPERM；关闭隐式重装后Turbo spawn UNKNOWN。这些尝试失败 |
| 各包等价检查 | `python output/github-audit/checks.py lint/typecheck` 逐包调用原脚本的ESLint/tsc；8/8包通过，两处原检查错误已修复 |
| 原启动/安全/浏览器边界测试 | `node --experimental-vm-modules --test scripts/check-client-boundaries.test.mjs scripts/fusion-config.test.mjs scripts/local-profile.test.mjs scripts/local-web.test.mjs scripts/release-profile.test.mjs`，33通过、0失败 |
| 全套诊断 | `node node_modules/vitest/vitest.mjs run apps/web/tests apps/worker/src packages --no-file-parallelism --maxWorkers=1 --reporter=json --outputFile=output/github-audit/vitest-results.json`；exit1；1642总计、1341通过、128失败、173pending/skip；66个失败文件；runner计数479 suites包含嵌套describe，不等于文件数 |
| CI明确范围离线单测 | `vitest run packages/core/src` 加creation-policy/fact-safety/readiness/source-processing及feishu client/docx；133/133通过；没有把子集代替全套 |
| 干净克隆标准检查 | pnpm lint：PASS；pnpm typecheck：PASS (after next typegen repair)；原Node测试33/33，单元测试133/133 |
| 独立创作浏览器测试 | `node node_modules/@playwright/test/cli.js test --config apps/web/playwright.creation.config.ts --reporter=json`；结果：{"startTime": "2026-10-10T09:56:45.796Z", "duration": 68700.85100000001, "expected": 1, "skipped": 0, "unexpected": 0, "flaky": 0}；未取得JSON终态时不宣称通过 |

全套诊断在安全修复期间运行，不能作为最终Git tree完整验收通过证据；边界修复之后补跑了原Node测试与相关单元范围。后续发布需在最终commit按各fixture要求重新运行全部必要检查。

## 本次测试环境

`docker run` 新建 `xsj-github-audit-postgres-20261010`（postgres:16-alpine，127.0.0.1:55433）和 `xsj-github-audit-redis-20261010`（redis:8-alpine，127.0.0.1:6380）；无生产卷/现有实例变更。`DATABASE_URL` 仅指向content_center_test。`prisma db push --schema packages/db/prisma/schema.prisma --skip-generate` exit0创建新空测试schema，未执行migration deploy。

测试env：ENVIRONMENT_ID=LOCAL_TEST、MOCK_MODE=true、SYSTEM_MANAGED_PROVIDERS=false、EXTERNAL_CALLS_DISABLED=true、独立假AUTH_SECRET与测试加密key。MinIO两个官方历史标签拉取失败，9002不可用；FFmpeg不在本次测试PATH。部分Provider fixture预期允许loopback网络，被offline guard拒绝，因此不能都解释为实际Provider回归；同样不能把所有失败都归因环境。

## 实际模块矩阵

| 模块 | 已取得的证据 | 尚未证明 |
| --- | --- | --- |
| 首页/看板 | creation-composer、部分界面/服务测试；源码与新UI保留 | 完整导航、真实看板与浏览器性能验收 |
| Agent对话/生成 | creation-agent.test.ts、v4-general-scope.test.ts通过（Mock，真实隔离DB持久化） | 真LLM、全部API/流式故障路径 |
| 资料/上下文 | source-processing-state、v4-reference-lifetime及上下文测试部分通过 | MinIO上传下载、FFmpeg/ASR完整链路 |
| 脚本生成/修改保存 | creation-agent与fact-safety/政策fixture通过 | 自然度/真实模型质量、完整浏览器编辑链 |
| 成果重开/继续编辑 | artifacts.test.ts通过，版本/权限服务存在 | 全部历史浏览器续编辑与恢复验收 |
| 内容创作/研究 | teardown-chain、research-project-handoff通过（Fixture/Mock） | 旧UI断言差异、完整Research入口与真实数据 |
| 外部API | 飞书client/docx纯fixture通过，配置边界仍保留 | RedFox/Doubao/Kimi/DeepSeek/Feishu真实服务均NOT TESTED |
| 用户/权限/持久化 | v4-project-creation-permissions、v4-personal-data-boundaries等通过 | content-projects错误码差异及全部HTTP跨用户路径 |
| 深浅模式 | 新CSS、主题逻辑完整快照保留 | 本轮全面视觉验收NOT PASSED |
| 桌面/移动/路由 | Next构建含应用路由；已有创作responsive E2E执行记录 | 未通过的E2E不作成功，Linux未实际运行 |

许可/桌面交付/完整内容经营域按PRODUCT.md属于FUTURE或CURRENT IMPLEMENTATION GAP；没有伪造已实现接口。

## 全套失败文件清单

表内数量是该文件明确failed assertion数；0仍可能有collection、hook或fixture失败。原JSON保持完整堆栈和全部失败用例。待审问题不自动恢复旧代码。

| 文件 | failed assertions | 首个原因/收集错误 |
| --- | --- | --- |
| `apps/worker/src/ingest.integration.test.ts` | 5 | Error: promise rejected "Error: INTERNAL_ERROR: 采集处理失败。" instead of resolving |
| `apps/worker/src/job-recovery.integration.test.ts` | 0 | beforeAll/afterAll/fixture failure；查看原JSON |
| `apps/worker/src/transcription.integration.test.ts` | 7 | Error: spawn ffmpeg ENOENT |
| `apps/web/tests/account-api-connection.test.ts` | 2 | AssertionError: expected { ok: false, …(1) } to match object { ok: true } |
| `apps/web/tests/account-browser.test.ts` | 0 | browserType.launch: Executable doesn't exist at E:\agent 开发环境\aegnt开发\06-数据\playwright-browsers\chromium_headless_shell-1234\chrome-headless-shell-win64\chrome-headless-shell.exe |
| `apps/web/tests/account-http-isolation.test.ts` | 0 | REVIEW_ONLY_HTTP_FIXTURES |
| `apps/web/tests/account-report-tables.test.ts` | 1 | Error: ENOENT: no such file or directory, open 'E:\AI工作台1.2\docs\research\li-xiao-public-observation.json' |
| `apps/web/tests/account-security-http.test.ts` | 6 | TypeError: fetch failed |
| `apps/web/tests/ai-creation.test.ts` | 3 | PrismaClientKnownRequestError:  |
| `apps/web/tests/artifact-final-navigation-browser.test.ts` | 0 | UNIQUE_FINAL_OUTPUT_REQUIRED |
| `apps/web/tests/assistant-read-and-shortcut-browser.test.ts` | 0 | ISOLATED_REVIEW_ONLY |
| `apps/web/tests/assistant-redis.integration.test.ts` | 0 | ISOLATED_ASSISTANT_REDIS_REQUIRED |
| `apps/web/tests/assistant-runtime.integration.test.ts` | 0 | ISOLATED_AGENT_DATABASE_REQUIRED |
| `apps/web/tests/benchmark-topics.test.ts` | 1 | AssertionError: expected 'import Link from "next/link";\r\nimpo…' to contain '开始一次研究' |
| `apps/web/tests/benchmark-workbench-browser.test.ts` | 0 | ISOLATED_REVIEW_REQUIRED |
| `apps/web/tests/connection-failures.test.ts` | 0 | This module cannot be imported from a Client Component module. It should only be used from a Server Component. |
| `apps/web/tests/content-discovery-trends.test.ts` | 2 | PrismaClientKnownRequestError:  |
| `apps/web/tests/content-production.test.ts` | 1 | AssertionError: expected 'import { notFound } from "next/naviga…' to contain 'material-transcript-disclosure' |
| `apps/web/tests/content-projects.test.ts` | 1 | Error: expected ProjectServiceError: PROJECT_FORBIDDEN { code: '…' } to match object { code: 'PROJECT_NOT_FOUND' } |
| `apps/web/tests/content-quality-review.test.ts` | 1 | PrismaClientKnownRequestError:  |
| `apps/web/tests/creation-quality.test.ts` | 1 | Error: ISOLATED_DATABASE_REQUIRED |
| `apps/web/tests/deep-content-package.test.ts` | 3 | PrismaClientKnownRequestError:  |
| `apps/web/tests/feishu-knowledge-subscriptions.test.tsx` | 0 | Failed to parse source for import analysis because the content contains invalid JS syntax. If you use tsconfig.json, make sure to not set jsx to preserve. |
| `apps/web/tests/feishu-wiki-browser.test.tsx` | 0 | Failed to parse source for import analysis because the content contains invalid JS syntax. If you use tsconfig.json, make sure to not set jsx to preserve. |
| `apps/web/tests/feishu.test.ts` | 14 | Error: 当前运行环境已关闭外部服务调用 |
| `apps/web/tests/global-artifact-search.test.ts` | 0 | beforeAll/afterAll/fixture failure；查看原JSON |
| `apps/web/tests/home-performance-browser.test.ts` | 0 | ISOLATED_REVIEW_REQUIRED |
| `apps/web/tests/ingest-job-recovery.test.ts` | 0 | beforeAll/afterAll/fixture failure；查看原JSON |
| `apps/web/tests/integration-card-browser.test.ts` | 0 | SCOPED_OUTPUT_REQUIRED |
| `apps/web/tests/llm-runtime-vision.test.ts` | 2 | LLMError: 升级验收副本不调用模型，请在正式环境启用后使用。 |
| `apps/web/tests/material-chain.integration.test.ts` | 0 | The "file" argument must be of type string. Received undefined |
| `apps/web/tests/material-storage-roundtrip.test.ts` | 0 | ISOLATED_REVIEW_REQUIRED |
| `apps/web/tests/platform-content-factory.test.ts` | 2 | Error: promise rejected "PrismaClientKnownRequestError{ …(7) }" instead of resolving |
| `apps/web/tests/project-agent-core.test.ts` | 0 | beforeAll/afterAll/fixture failure；查看原JSON |
| `apps/web/tests/project-assistant.test.ts` | 2 | AssertionError: expected { id: '', messages: [], …(2) } to deeply equal { id: '', messages: [] } |
| `apps/web/tests/project-methods-ai.test.ts` | 1 | PrismaClientKnownRequestError:  |
| `apps/web/tests/provider-v0-policy.test.ts` | 1 | Error: expected LLMError: 升级验收副本不调用模型，请在正式环境启用后使用。 { …(3) } to match object { code: 'KIMI_NOT_CONFIGURED', …(1) } |
| `apps/web/tests/qa-prelaunch-core.test.ts` | 0 | QA_ISOLATED_DATABASE_REQUIRED |
| `apps/web/tests/research-abc-flow.test.ts` | 0 | REVIEW_ONLY |
| `apps/web/tests/research-account-trend-browser.test.ts` | 0 | ISOLATED_ACCOUNT_TREND_BROWSER_ONLY |
| `apps/web/tests/research-core-browser.test.ts` | 0 | ISOLATED_RESEARCH_CORE_ONLY |
| `apps/web/tests/research-creation-browser.test.ts` | 0 | REVIEW_BROWSER_ONLY |
| `apps/web/tests/research-creation-selection.test.ts` | 0 | REVIEW_ONLY |
| `apps/web/tests/research-experience-browser.test.ts` | 0 | ISOLATED_REVIEW_REQUIRED |
| `apps/web/tests/research-home-inputs.test.ts` | 0 | ISOLATED_REVIEW_REQUIRED |
| `apps/web/tests/research-library.test.ts` | 1 | Error: LOCAL_REVIEW_EXTERNAL_CALL_BLOCKED |
| `apps/web/tests/research-navigation.test.tsx` | 0 | Failed to parse source for import analysis because the content contains invalid JS syntax. If you use tsconfig.json, make sure to not set jsx to preserve. |
| `apps/web/tests/research-news-api.test.ts` | 0 | ISOLATED_NEWS_TEST_ONLY |
| `apps/web/tests/research-news-browser.test.ts` | 0 | REVIEW_ONLY_BROWSER |
| `apps/web/tests/research-queued-timeout.test.ts` | 0 | beforeAll/afterAll/fixture failure；查看原JSON |
| `apps/web/tests/research-source-inbox.test.ts` | 0 | ISOLATED_REVIEW_REQUIRED |
| `apps/web/tests/shared-artifact-editor-browser.test.ts` | 0 | ISOLATED_REVIEW_ONLY |
| `apps/web/tests/starship-frontend-browser.test.ts` | 0 | ISOLATED_REVIEW_REQUIRED |
| `apps/web/tests/studio-default-method.test.ts` | 5 | PrismaClientKnownRequestError:  |
| `apps/web/tests/unified-creative-analysis.test.ts` | 3 | PrismaClientKnownRequestError:  |
| `apps/web/tests/video-analytics-browser.test.ts` | 0 | ISOLATED_REVIEW_REQUIRED |
| `apps/web/tests/voice-input-browser.test.ts` | 0 | ISOLATED_REVIEW_REQUIRED |
| `apps/web/tests/voice-recording-roundtrip.test.ts` | 0 | ISOLATED_REVIEW_REQUIRED |
| `packages/providers/src/ffmpeg-media-processor.test.ts` | 5 | Error: spawn ffmpeg ENOENT |
| `packages/providers/src/minio-storage.test.ts` | 1 | Error: connect ECONNREFUSED 127.0.0.1:9002 |
| `packages/providers/src/review-policy.test.ts` | 1 | LocalAsrError: 验收环境已关闭语音服务调用。 |
| `packages/providers/src/safe-url.test.ts` | 4 | Error: expected Error: LOCAL_REVIEW_EXTERNAL_CALL_BLOCKED to match object { code: 'INVALID_URL' } |
| `packages/providers/src/source-providers.test.ts` | 1 | Error: LOCAL_REVIEW_EXTERNAL_CALL_BLOCKED |
| `packages/providers/src/doubao/streaming-client.test.ts` | 9 | Error: promise rejected "Error: LOCAL_REVIEW_EXTERNAL_CALL_BLOCKED" instead of resolving |
| `packages/providers/src/openai-compatible/provider.test.ts` | 25 | Error: promise rejected "LLMError: 无法连接 AI 模型服务。 { …(3) }" instead of resolving |
| `packages/providers/src/redfox/client.test.ts` | 17 | RedFoxError: RedFox 网络请求失败。 |

173项pending/skip不计为通过，其中含真实Provider opt-in、环境前置失败等；没有为本任务新增skip。Vite原配置存在未来native-loader兼容警告，未压制。

## 最终追加验证及边界

- `node node_modules/vitest/vitest.mjs run --config packages/integrations/vitest.feishu.config.ts --reporter=json --outputFile=output/github-audit/feishu-results.json`：119/119通过，HTTP请求为注入fixture，未连接真实飞书。
- `node node_modules/vitest/vitest.mjs run --config apps/web/vitest.research-navigation.config.ts --reporter=json --outputFile=output/github-audit/navigation-results.json`：18总计，14通过、3失败、1原有pending；next/navigation mock缺少useRouter导出，未删测试或恢复旧导航。
- 本地隔离PyYAML解析 `.github/workflows/verify.yml` 成功（`workflow-syntax-final.log`）；不是GitHub执行结果。
- 32/32原始CSS文件哈希保持一致；源码快照与最终代码之间的15个已有文件改动均为本次明确修复/交付配置，新增文件另见差异报告。未全仓格式化或重构。
- 创作浏览器场景最终1/1通过，覆盖Mock生成、真实隔离DB持久化、锁定后的API403、保存重开、恢复历史版本、局部改写保留首尾段落和390px移动端。这个范围补充上表“完整浏览器编辑链尚未证明”；其他浏览器及深浅模式验收仍未完成。

## MinIO调查与隔离存储复验终态

用户表示没有已审核可拉取镜像并要求继续调查。官方仓库已于2026-04-25归档，社区版源码分发；依据[官方仓库说明](https://github.com/minio/minio)。没有选择任意第三方镜像或更换生产存储。

实际成功命令：`docker build --progress=plain --tag xsj-audit-minio:source-9e49d5e output/github-audit/minio-source-build`，exit0；固定官方提交9e49d5e7a648f00e26f2246f4dc28e6b07f8c84a、Go官方linux/amd64镜像digest c268a04d59aea0b180ed9946a658cfab9e7b3391dc90eed6e4969ccff98c851f；`go mod verify`输出all modules verified。正式复现配方见config/testing/minio-source.Dockerfile。

本地image config ID `sha256:ce413a1c0a4d167aa11e9f781035a97f238b21d00dec887c4c9ae8519216d601`，构建manifest list `sha256:badf5122cb3ca9d210b1ab9927f14f170738b416ae9194698d18005c1289c376`。镜像仅存在本机，**没有推送registry，不得把这些值写成可远程拉取的地址**。运行显示DEVELOPMENT.GOGET（源码构建默认版本字符串），实际来源以固定Git SHA为准；不是官方签名发行二进制或生产安全认证。

实际运行：`docker run --detach --name xsj-github-audit-minio-20261010 --read-only --cap-drop ALL --security-opt no-new-privileges --memory 512m --cpus 2 --tmpfs /data:rw,uid=10001,gid=10001,mode=0700 --tmpfs /tmp:rw,uid=10001,gid=10001,mode=0700 --publish 127.0.0.1:9002:9000 --env HOME=/tmp --env MINIO_ROOT_USER=minioadmin --env MINIO_ROOT_PASSWORD=minioadmin xsj-audit-minio:source-9e49d5e server /data --address :9000`。只用假测试凭据及内存数据，无生产目录或用户卷。

在**全新克隆**执行：`node node_modules/vitest/vitest.mjs run packages/providers/src/minio-storage.test.ts packages/providers/src/s3-compatible-storage.test.ts --no-file-parallelism --reporter=json --outputFile=../clean-storage-results.json`。ENVIRONMENT_ID=LOCAL_TEST、独立测试DB55433、S3_ENDPOINT=http://127.0.0.1:9002、bucket=github-audit-storage-test、external calls disabled，exit0：**5总计、5通过、0失败**；真实本机S3上传/签名下载/删除，不是storage Mock。原Vite兼容警告保留。

CI不再因缺TEST_S3_IMAGE必然停止：默认重建固定官方源码，仅在显式覆盖时要求审核过的registry镜像@sha256:digest；YAML解析通过，但GitHub运行未执行。源码配方和CI提交7836583没有修改2145346构建所覆盖的apps/packages/scripts/vendor。上游归档、依赖安全与AGPL许可适用性仍需生产审查，本轮不作生产许可或安全结论。

全套原诊断128失败/173pending未重跑，不能扣除存储通过项后伪称全套已过；完整资料上传/ASR/专用review链仍未验证。补充终态优先于上文“9002不可用”的原诊断环境记录。

结束时实际执行 `docker stop xsj-github-audit-minio-20261010 xsj-github-audit-postgres-20261010 xsj-github-audit-redis-20261010` 成功，三个本次测试容器均已停止（未删除）；MinIO内存测试数据随停止释放。原有pg16-dev和两个用户Redis容器仍运行，未修改。没有遗留本次HTTP冒烟进程。
