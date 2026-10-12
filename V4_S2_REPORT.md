# S2 核心上下文阶段报告

STATUS：PASS（隔离数据库与 Mock 模型）；真实模型和人工中文质量评价 NOT RUN。

范围：A02–A06；不改变权威文档、数据库 Schema、事实审批规则或 Provider 安全边界。

- A02：GENERAL_QUERY 接受通用任务；旧内容任务分类继续限制旧流程，RBAC、FactGate、ActionPermission 保留。
- A03：项目创建、设置、Assistant 统一零至三个授权 Skill；保存选中版本，加载全部选中项；激活、跳过、冲突继续使用既有 resolver。预算超限或截断的 Skill 不进入有效上下文。兼容旧单 Skill 字段。
- A04：KNOWLEDGE 引用具体 KnowledgeEntry，校验空间、内部可见、未退役、来源可读及当前飞书授权。内容保持 EXTERNAL；来源条目版本及 source hash 可追溯。
- A05：项目关联资料、显式资料/知识和已确认 Evidence 定位中的事实，只有当前授权、已确认、有效且未禁止/争议的 FactRecord 可进入 OWN_CONFIRMED。外部正文不会自动成为自有事实。
- A06：TURN、TASK、PROJECT 显式范围写入既有 AssistantMessage.metadata，保存解析时来源版本；重开重新鉴权，版本变化提示重选；PROJECT 素材显式复用 ProjectSource。资料超过八条要求用户选择，不靠关键词猜测加载。私人研究持续引用留在个人对话，不自动分享研究正文。

## 最小契约与成本

沿用既有 metadata JSON 增加 scope/sourceVersion/skillVersionIds，不新增表或版本系统。旧 MATERIAL 默认 TURN，旧 ARTIFACT/RESEARCH 默认 TASK。项目资料绑定继续使用现有 ProjectSource；其他类型的长期引用保存在个人线程。每次读取重新鉴权，版本失效不沿用旧缓存。批量事实限制 40 条，引用限制 8 条，Skill 上限 3，继续使用既有预算裁剪。未保存编辑与流式 checkpoint 没有在 S2 新增。

## 验证

LOCAL_TEST：content_center_agent_test_12；Mock Provider；外部调用禁用。

| 命令（共同前缀 node output/v4/run-local-test.mjs run） | 实际结果 | 证据 |
| --- | --- | --- |
| v4-general-scope、ai-control、creation-composer、project-methods、skill-resolver | 38 PASS | output/v4-s2/scope-skills-final.json |
| v4-knowledge-facts | 4 PASS | output/v4-s2/knowledge-facts-archived-fixtures.json |
| v4-reference-lifetime、project-agent-core、creation-agent、material-readable-content、assistant-stream-route | 33 PASS | output/v4-s2/persistence-final.json |
| node node_modules/typescript/bin/tsc -p apps/web/tsconfig.json --noEmit --incremental false | PASS / exit 0 | output/v4-s2/typecheck-final.log |

知识测试最初因事实有效期约束及禁止删除人工确认历史失败；保留原始失败报告，最终使用归档/停用清理并通过。不得移除这些数据库约束。早期失败 UUID 夹具可能残留在隔离库，未删除审批历史。持续引用旧用例改为显式 PROJECT，保留负向授权与事实校验断言。

## 回滚与限制

只反向撤销本阶段新增 hunks，不能重置混合文件。metadata 新字段可由旧代码忽略，但不能放宽来源权限或伪造确认状态。真实飞书、音视频解析、付费模型、浏览器交互及九类中文质量人工评价 NOT RUN。Skill dry-run 的冲突解释沿用原有实现，未宣称真实模型已验证。
