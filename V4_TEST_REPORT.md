# V4 实际测试与验收报告

2026-10-10；HEAD仍242f7b911e369d4c93d0deccc02ee368cfd90137，验证对象是当前未提交工作树，不能按HEAD误认为已提交改版。证据均来自本轮运行，不使用历史QA当当前通过。

## 环境与最终结果

LOCAL_TEST 127.0.0.1:55438/content_center_agent_test_12，已通过test-target白名单；UUID测试空间/用户；Mock Provider；EXTERNAL_CALLS_DISABLED=true。浏览器专用localhost:3040，独立.next-local-test；无付费外部请求、无生产数据/不可逆迁移。临时配置从已有本地隔离profile验证后选取；不在文档输出凭据。

- 核心29文件203项PASS / 0 FAIL：output/v4-final/core.json。
- 导航13项PASS / 0 FAIL / 1可选截图预览SKIP：output/v4-s4/navigation-final.json。
- 真实隔离Web无头Edge组合流程1项PASS：output/v4-final/browser.json。
- 纯报告格式器3项PASS：output/v4-final/report-formatter.json。
- 共220项最终不同用例通过；没有累计各阶段重复运行次数。组合浏览器用例含多项断言，不拆分伪增测试数。
- Web最终typecheck PASS / exit0：output/v4-final/typecheck-after-formatter.log。
- Worker typecheck PASS / exit0：output/v4-final/worker-typecheck.log。

这些结果不代表生产可用、真实模型质量或C01–C16全部最终验收通过。

## 实际命令

临时隔离入口为 output/v4/run-local-test.mjs，读取本地配置并强制白名单库、Mock和禁止外部调用；output被git忽略，不是第二套业务测试框架。UI测试配置仅在output/v4/vitest-ui.config.mts设置已安装Vite8的JSX转换，未改通用Vitest配置。

```powershell
node output/v4/run-local-test.mjs run apps/web/tests/ai-control.test.ts apps/web/tests/artifacts.test.ts apps/web/tests/assistant-feishu-cache.test.ts apps/web/tests/assistant-media-link.test.ts apps/web/tests/assistant-stream-route.test.ts apps/web/tests/content-discovery.test.ts apps/web/tests/content-governance.test.ts apps/web/tests/content-quality-review.test.ts apps/web/tests/creation-agent.test.ts apps/web/tests/creation-composer.test.ts apps/web/tests/drafts.test.ts apps/web/tests/learning-suggestions.test.ts apps/web/tests/material-readable-content.test.ts apps/web/tests/project-agent-core.test.ts apps/web/tests/project-methods.test.ts apps/web/tests/publishing-center.test.ts apps/web/tests/research-project-handoff.test.ts apps/web/tests/sidebar-organization.test.ts apps/web/tests/sidebar-state.test.ts apps/web/tests/skill-resolver.test.ts apps/web/tests/today-recommendations.test.ts apps/web/tests/v4-general-scope.test.ts apps/web/tests/v4-history-pagination.test.ts apps/web/tests/v4-knowledge-facts.test.ts apps/web/tests/v4-personal-data-boundaries.test.ts apps/web/tests/v4-project-creation-permissions.test.ts apps/web/tests/v4-reference-lifetime.test.ts packages/providers/src/render-media-relay.test.ts packages/integrations/src/feishu/service-boundary.test.ts --no-file-parallelism --reporter=json --outputFile=output/v4-final/core.json
node output/v4/run-local-test.mjs run apps/web/tests/research-navigation.test.tsx --config output/v4/vitest-ui.config.mts --no-file-parallelism --reporter=json --outputFile=output/v4-s4/navigation-final.json
$env:V4_BROWSER_ORIGIN='http://localhost:3040'
node output/v4/run-local-test.mjs run apps/web/tests/v4-workspace-browser.test.ts --no-file-parallelism --reporter=json --outputFile=output/v4-final/browser.json
node output/v4/run-local-test.mjs run apps/web/tests/work-research-markdown.test.ts --no-file-parallelism --reporter=json --outputFile=output/v4-final/report-formatter.json
node node_modules/typescript/bin/tsc -p apps/web/tsconfig.json --noEmit --incremental false
node node_modules/typescript/bin/tsc -p apps/worker/tsconfig.json --noEmit --incremental false
```

浏览器之前使用 node output/v4/run-local-test.mjs --serve 启动专用服务，验收结束仅关闭经父子PID核对的本轮服务。Web引擎路径使用已安装本地Prisma DLL；没有生成或部署数据库迁移。

## C01–C16逐项记录

共同证据根目录 output/v4-final；各阶段的原始失败报告亦保留。PASS/MOCK必须按环境解释。

| ID | 测试目标 | 环境 | 命令对应套件 | 结果 | 失败/未运行原因 | 修复文件/边界 | 实际证据 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| C01 | 空项目零Skill通用任务 | LOCAL_TEST / Mock | creation-composer、v4-general-scope、project-agent-core | PASS（功能，非真实模型质量） | 无；真实模型NOT RUN | project-service；scope-gate；context-builder-v2 | core.json：相关套件通过 |
| C02 | 多个授权Skill创建/设置/加载/版本 | LOCAL_TEST / Mock | creation-composer、project-methods、skill-resolver | PASS | 无；真实模型多Skill表现NOT RUN | contracts/creation；project-methods；context-builder-v2 | core.json：0/2/3/超限/外空间/激活状态 |
| C03 | 文本/PDF/图片/音视频上传后引用 | LOCAL_TEST / Mock | material-readable-content、creation-agent | PARTIAL | 文本可读/引用PASS；浏览器上传与真实ASR/PDF处理NOT RUN | material-detail/readable-content；assistant/references | core.json：固定Source文本；没有伪造上传证据 |
| C04 | 有效确认事实与外部来源区分 | LOCAL_TEST / Mock | v4-knowledge-facts、content-governance | PASS（隔离事实链） | 首次夹具有效期/禁止清除历史已修；真实人工业务审批NOT RUN | assistant/references；context-builder-v2 | core.json；knowledge-facts-archived-fixtures.json |
| C05 | 生成→成果保存→重开 | LOCAL_TEST / Mock + real HTTP | creation-agent、artifacts；v4-workspace-browser | PASS（本地功能） | 首次API编译等待已修；真实生成质量NOT RUN | artifact-window；studio-shell；artifacts/service | browser/evidence.json：PUT 200、正文/version |
| C06 | 指定段落应用/连续改稿/锁定保护 | LOCAL_TEST / Mock | creation-agent；v4-workspace-browser | PASS（范围与版本） | 真实模型遵循修改范围NOT RUN | assistant/service；ArtifactEditor既有契约 | core.json：连续局部修改、锁定负例；浏览器dirty取消 |
| C07 | 同时保存同version与409 | LOCAL_TEST | creation-agent、artifacts | PARTIAL | 真实DB最多一成功PASS；两真实HTTP客户端并发409 NOT RUN | artifacts/service既有冲突；未另建版本系统 | core.json：ARTIFACT_VERSION_CONFLICT |
| C08 | 私人研究入新/已有项目与幂等 | LOCAL_TEST / Mock | research-project-handoff | PASS（分享事务） | 真实外部研究生成NOT RUN | research/sharing复用createProject | core.json：6项分享/权限测试 |
| C09 | 旧Idea重复启动与绑定中断 | LOCAL_TEST / Mock queue | content-discovery | PASS | 无；已收录Source保留重试 | discovery/service；project-service | core.json：并发单项目、绑定失败完整回滚 |
| C10 | 个人建议/推荐、跨空间、VIEWER、停用 | LOCAL_TEST / Mock query + DB | v4-personal-data-boundaries、v4-project-creation-permissions、research-project-handoff | PASS（定向边界） | 修复前18项负例失败；未宣称发生泄漏 | recommendations/context-builder；learning-suggestions；project-service | S1 before JSON与final core对应负例 |
| C11 | 飞书撤权、缓存及媒体授权 | LOCAL_TEST / Mock | assistant-feishu-cache、feishu/service-boundary、media tests | PASS（模拟权限边界） | 真实飞书/API撤权NOT RUN | 本轮沿用已有feishu读取和签名URL权限 | core.json：失效拒绝/缓存重查；真实服务无成功宣称 |
| C12 | 停止/截断/超时/硬中断 | LOCAL_TEST / Mock + real test worker kill | creation-agent、assistant-stream-route；专用checkpoint child | PARTIAL | 停止/长度截断/真实测试worker SIGKILL恢复PASS；真实模型超时/Redis故障NOT RUN | assistant/service checkpoint/重开投影 | core.json；checkpoint-process.log（子退出预期，父断言PASS） |
| C13 | 80+消息/100+修订完整分页 | LOCAL_TEST | v4-history-pagination | PASS | 首次非法同用户双默认线程夹具已修 | assistant/service/history API/Artifact hook | core.json：161相同时间消息、201修订无重漏 |
| C14 | 旧母稿/平台稿审核发布包 | LOCAL_TEST / Mock review | drafts、content-quality-review、publishing-center | PASS（现有服务兼容） | 真实平台发布NOT RUN | 服务保留；content-review/topics入口调整 | core.json：13/7/7项，ReviewRecord链保留 |
| C15 | 真实首页/空数据/资讯授权 | LOCAL_TEST real Web + SSR | v4-workspace-browser；research-navigation | PARTIAL | 首页真实最近项目和资讯入口鉴权显示PASS；运营真实空数据全UI NOT RUN | home/page；ResearchShell；research/layout | browser/home-mobile.png；navigation-final.json |
| C16 | 五导航/手机/键盘/后退/dirty | LOCAL_TEST real Edge + SSR | v4-workspace-browser；research-navigation；sidebar-state | PARTIAL | 1600/390、键盘dirty、保存重开、旧审核深链PASS；全量旧URL/浏览器后退/所有设备NOT RUN | SidebarFoundation；ArtifactWindow；StudioShell | browser截图及evidence；SSR13PASS/预览1SKIP |

## 失败证据与修复

S1先负向复现：权限17项12失败、个人边界7项6失败，之后均通过。pnpm沙箱入口/临时文件和sandbox typecheck造成环境失败，改用安装Node CLI及已批准本地隔离执行；不能把未执行算通过。

S2旧通用scope断言更新为旧DRAFT任务限制；知识fixture首次违反有效期约束及删除审批历史限制，未移除数据库保护，改归档/停用保留历史。较早失败UUID夹具可能残留LOCAL_TEST库，不删除审批历史。持续资料旧测试改用明确PROJECT范围；版本变化时重新提交未给新版本也拒绝，避免静默更新依据。

S3初始分页夹具违反默认线程唯一约束，改为另一个项目；nullable错误映射修复。硬中断用例首次process.exit被Vitest拦截，改为专用worker自身SIGKILL；最终父断言通过，子runner异常日志是故障注入证据。

S4普通JSX测试配置在Vite8保留JSX造成导入失败，使用临时UI配置真正执行13项。浏览器实测发现浮动成果按钮遮挡视图操作并修复；首次保存poll过短，改等待HTTP200并查DB。曾仅SKIP的 browser.json没有计入通过，计入的是最终实际执行报告。

## 中文创作质量

固定九场景：教培口播、朋友圈、邀约、课程宣传、对标改写、长脚本、发散、多轮指定段落、仅删减原文。样本/资料/维度在 apps/web/tests/fixtures/v4-chinese-quality.json。

真实生成结果、人工评分全部NOT RUN：本轮没有外部费用/生产凭据授权。JSON输出为null，不伪造评价；已有Mock仅验证范围、长度策略、数据权限和保存流程，不算真实内容质量达标。

## 未运行及残余风险

真实模型/飞书/ASR/平台外部调用、端到端文件上传解析、真实模型超时、Redis故障、所有旧URL和浏览器后退、全局build/生产部署/Release V3均NOT RUN。资料深度编排A17、全局CSS覆盖A14、默认loader旧数据聚合A13、VIEWER兼容初始化A19仍有缺口；流式恢复只保证最后成功checkpoint，人工未保存正文不自动恢复。

Next自动更新原已修改 next-env.d.ts 的生成类型路径；未尝试猜测覆盖原改动，须在交付审阅中独立核对。schema与四份权威文档未改。
