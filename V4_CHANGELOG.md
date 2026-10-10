# V4 本轮变更记录

2026-10-10；未Git暂存、commit、push；无Schema/migration及数据删除。原脏工作树快照见 V4_S0_BASELINE.md。

| 阶段 | 真实行为变化 | 关键代码 |
| --- | --- | --- |
| S1 | 推荐仅本人项目/选题/资料；建议owner隔离和去重；创建活跃权限及事务复核 | server/discovery/recommendations/context-builder.ts；server/learning-suggestions/service.ts；server/project-service.ts；server/sidebar/basic-project.ts；server/project-api.ts |
| S2 | 通用任务scope；0–3授权Skill全契约；具体知识条目与有效确认事实；TURN/TASK/PROJECT来源版本持久化与重查 | server/ai/control/{scope-gate,context-builder-v2,ai-control-service}.ts；server/assistant/{references,service}.ts；lib/contracts/{creation,references}.ts；server/project-methods/service.ts；home-composer.tsx；studio-default-method.tsx；assistant API |
| S3 | Idea事务与并发幂等；消息/修订向前分页；初始化锁；限频partial checkpoint与中断重开 | discovery/service.ts；discovery/api.ts；assistant/service.ts；artifacts/service.ts；drafts/service.ts；assistant/history API；use-artifact-editor.tsx；artifact-editor.tsx |
| S4 | 五主入口、真实首页；默认Conversation+Artifact；高级Canvas；资料二级入口；资讯按既有权限显示；选题审核兼容跳转 | sidebar-foundation.tsx；app-shell.tsx；home/dashboard/projects/library/topics/content-review/research layout；content-hub.tsx；studio-shell.tsx；artifact-window.tsx/css；research-shell.tsx |
| S5 | 三条基础创建复用createProject；报告纯函数移出UI目录，原路径re-export | sidebar/basic-project.ts；content-governance/service.ts；lib/work-research-markdown.ts；components/research/work-research-markdown.ts；analysis export API |
| S6 | 13候选核查清单；未删除 | V4_S6_DELETION_CANDIDATES.md |

测试新增：v4-personal-data-boundaries、v4-project-creation-permissions、v4-general-scope、v4-knowledge-facts、v4-reference-lifetime、v4-history-pagination、v4-checkpoint-process、v4-workspace-browser；旧回归按批准的个人数据/显式引用语义更新。九类中文真实质量固定样本位于 tests/fixtures/v4-chinese-quality.json，输出/人工评价NOT RUN。

测试隔离：next.config.ts新增LOCAL_TEST编译目录，.gitignore忽略该目录；现有Next自动更新next-env.d.ts生成路径，原文件本来已有未提交状态，独立核对，不用Git覆盖还原。

本记录只认本轮上述行为，git diff还包含其他任务原改动，不能整仓暂存。既有权威五文件SHA256与S0相同。
