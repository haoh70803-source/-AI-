# V4 S1 权限与数据边界阶段报告

2026-10-10；状态 PASS（定向服务与数据库回归、类型检查）。依据用户“继续”及随后明确个人范围决策，保留其他任务原改动，精确扩展目标文件。

## 修改前后与依赖

| 编号 | 原行为 | 当前行为 | 修改文件 |
| --- | --- | --- | --- |
| A11 | 个人推荐候选读取空间全部项目/选题/资料 | 先校验活跃成员；上述私人输入只读当前 createdById；共享输入不得自动带入；公开趋势/对标保留 | server/discovery/recommendations/context-builder.ts |
| A12 | 列表和决定未限定 owner；去重键跨用户 | 列表/决定限定 ownerUserId；成员/用户/空间停用拒绝；新去重键含用户且兼容本人旧键 | server/learning-suggestions/service.ts |
| A16（权限部分） | 基础路径只检查角色，普通 createProject 依赖 API；幂等早返无 service 校验 | 两路径 service 拒绝停用/撤权/VIEWER；写事务重查；普通创建 Serializable；幂等读取/唯一冲突恢复先鉴权；错误映射403 | server/sidebar/basic-project.ts、server/project-service.ts、server/project-api.ts |

A16 三条创建编排尚未统一，留 S5。ContentTopic 入口原本事务内检查活跃成员与 VIEWER，无重复改造。MethodSuggestion 从用户明确选定且 workspace 授权的研究生成个人候选，不自动共享建议。旧建议记录不迁移、不改 owner、不删。旧去重键本人仍可识别。

## 先复现再修复

新增 v4-project-creation-permissions.test.ts：有效 Mock 白名单环境下修复前 17 项中12失败/5通过，包含停用、事务前撤权与禁写；修复后17通过。
新增 v4-personal-data-boundaries.test.ts：修复前7项中6失败/1通过，修复后7通过。Mock 查询按字段实际筛选 fixture，未连接真实数据库。

首次 pnpm 因目录访问拒绝不能启动；沙箱 Vitest 缓存 rename EPERM；使用授权本地执行后取得真实用例结果。最初 Mock 成员测试的跨空间模拟过宽，已先修正 fixture 后重新记录 before.json，未把错误 fixture 的失败当风险证据。

## 验收

使用既有白名单库 127.0.0.1:55438/content_center_agent_test_12，复用已验证本地配置但不输出凭据。无新库、Schema或迁移。临时辅助入口 output/v4/run-local-test.mjs 校验配置、目标白名单并禁用外部调用；不是新增生产测试系统。

最终命令：`node output/v4/run-local-test.mjs run apps/web/tests/v4-personal-data-boundaries.test.ts apps/web/tests/v4-project-creation-permissions.test.ts apps/web/tests/assistant-feishu-cache.test.ts packages/integrations/src/feishu/service-boundary.test.ts packages/providers/src/render-media-relay.test.ts apps/web/tests/assistant-media-link.test.ts apps/web/tests/sidebar-organization.test.ts apps/web/tests/learning-suggestions.test.ts apps/web/tests/today-recommendations.test.ts --no-file-parallelism --reporter=json --outputFile=output/v4-s1/final.json`

最终 58 项通过、0失败（9文件）。真实隔离 DB 仅三个既有集成文件创建/清理 UUID fixtures；其余为 Mock 单元。Provider 全部 Mock，未使用真实飞书/媒体/模型 API。

类型检查：`node node_modules/typescript/bin/tsc -p apps/web/tsconfig.json --noEmit --incremental false *> output/v4-s1/typecheck-final.log`，exit0、日志空。首次沙箱读依赖异常造成大量诊断；本地正常权限下复核成功，不修改无关代码。

失败记录保留：LOCAL_REVIEW_OFFLINE=true 与 LOCAL_TEST 冲突导致3套件未运行；修正测试进程标志且 EXTERNAL_CALLS_DISABLED=true 后运行。一次推荐集成16/17通过，另一用户无本人来源收到 RECOMMENDATION_NO_DATA，符合新批准政策；更新该测试先断言无私人线索，再明确创建本人资料，8项通过。不是放宽生产 scope。

飞书缓存5负例、离线边界4例通过。媒体 token 用途/过期/篡改/资产 scope 验证沿用测试，未把用于外部转录的签名 capability 强改为登录会话。签名链接5分钟有效期；即时逐用户撤销并非当前契约，不宣称已提供。媒体 HTTP、真实飞书撤权及真实 DB 权限竞争负载 NOT RUN。

## 风险、回滚与后续

不要把模块 PASS 当 C01–C16 全局完成。C10 为服务 Mock 与部分数据库回归覆盖；C11 为 Mock；真实服务、跨客户端 HTTP 与中文人工质量仍需最终验收。下一阶段 S2 可以进入；每项修改前核对当前 diff，保留已有变更。

回滚仅撤本次补丁，不回退为不安全权限；必要时停入口。无 Git add/commit/push，无删除或迁移。S1 新增两测试，另更新已有推荐私有性测试，与现有方法/侧栏/媒体调用方回归通过。
