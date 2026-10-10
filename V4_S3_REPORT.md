# S3 保存、重开与历史阶段报告

STATUS：当前代码修改 PASS；异常恢复完整验收仍 PARTIAL，不能视为 C01–C16 全部达标。

A23：startIdeaProject 先验证活跃写权限，采集保留在事务外；同选题 advisory lock 后重读关联，在同一现有事务创建项目及全部资料、更新选题、记录 Audit。并发只建一个项目；绑定失败全部项目写入回滚，已采集 Source 保留供重试。

A25：Assistant 最近窗口仍 80 条，增加按 createdAt/id 稳定向前分页，游标必须属于当前用户当前线程；Artifact 最近窗口 100 条，按同分支 revision 向前分页。API 与前端加载更早入口已接通。历史没有删除。

A19：兼容初始化仍沿用既有 lazy migration；增加事务内活跃成员复核及项目 advisory lock，防止并发读取重复初始化。VIEWER 读取兼容初始化写入没有改成新的产品政策，仍作为 CURRENT IMPLEMENTATION GAP 记录；需后续显式兼容迁移方案。

A26：没有新增自动保存、版本表或 checkpoint。已保存 Artifact 承诺重开；编辑器未保存修改仅由 dirty 导航保护，进程硬故障不承诺恢复。已存在 Assistant 心跳和十分钟超时处理仍保留。最小后续设计：复用 AssistantMessage.content，每隔 5 秒且至少增长 1KB，条件更新 PENDING/STREAMING 的部分正文；终态统一提交，增加 partial/complete 元信息；每条消息最多约 12 次写入/分钟。重开显示未完成片段并允许从既有 USER snapshot 重试，不生成 Artifact Revision。需先审核恢复承诺和写入预算，再实施；本阶段未擅自新增。

## 验证

LOCAL_TEST content_center_agent_test_12，Mock Provider，外部调用禁用。

node output/v4/run-local-test.mjs run v4-history-pagination、content-discovery、creation-agent、artifacts、drafts、assistant-stream-route（实际命令完整文件路径见 output/v4-s3/core-final.json）：37 PASS，包含 161 条相同时间消息、201 个历史版本、并发启动、事务失败回滚、局部连续改稿、并发版本冲突、锁定、恢复、停止及 token 截断。

Web tsc --noEmit --incremental false：PASS / exit 0，output/v4-s3/typecheck-final.log。首次测试夹具误建同用户同项目第二默认线程，唯一约束阻止；已改不同项目并通过。首次类型检查暴露 nullable 错误映射，已修复 fallback，不修改无关 API。

NOT RUN：真实上传/解析、真实模型超时、真实子进程硬杀、Redis 故障、浏览器 UI 分页及人工中文质量。上述未运行项目不计为通过。

回滚：只针对阶段新增 hunks 反向补丁，保留用户既有改动及历史实体；新分页字段对旧调用兼容，不迁移或删表。S4 纯导航入口可按既有实施计划独立收敛；完整异常恢复验收不因导航通过而标为完成。

## 用户授权后的 A26 实施与验收（覆盖前述暂缓设计状态）

用户答复“你觉得哪个比较好，评估后进行选择，写过过程文档就行”，授权按评估选择。选择复用 AssistantMessage：每5秒检查，UTF-8正文比上一checkpoint增长至少1024字节才保存；不足增长每30秒仅心跳。最多12次检查/分钟，实际正文写入受增长条件限制；同一时刻仅一个写入，终态前等待在途写入结束，条件只更新 PENDING/STREAMING，不覆盖已完成状态。

partial 元信息与“未完成恢复片段”提示保存在既有消息JSON；不生成 Artifact Revision。重开读到超过10分钟未更新的未完成消息，只读投影为失败并保留片段，可从原请求重试；新请求沿用既有超时状态收口。最后checkpoint之后的delta仍可能丢失，编辑器未保存的人工正文仍不自动恢复。

真实专用Vitest子进程生成400次固定短句，确认checkpoint已写入后自身SIGKILL，绕过正常catch/finally；父测试重新读库与重开，验证部分正文保留、无成果应用操作、已保存Artifact正文/version不变。子runner异常退出是预期注入，最终父套件38 PASS（output/v4-s3/checkpoint-verified.json；原始进程日志 output/v4-s3/checkpoint-process.log）。Web类型PASS。真实外部Provider超时、Redis故障仍NOT RUN。
