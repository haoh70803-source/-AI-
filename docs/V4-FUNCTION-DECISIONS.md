# V4 功能决定与施工边界

日期：2026-10-10。本轮不是 Governance Update。依据 PRODUCT.md → ARCHITECTURE.md → LEGACY.md → 当前V4任务核对。

## 决策核对

已读取 `docs/product-review/2026-10-10/` 的管理层正文、实现索引、机器盘点、核对记录及全页面审计。原盘点是静态证据/访客访问，不将其当作已登录功能验收。本轮以当前代码和隔离运行补充证据。

`feature-decisions.json` 的85条 records：`finalDecision` 全部 null，`owner` 未设置，`executionAuthorized` 全部 false，没有已批准项。`feature-decisions.md` 明确“建议均未批准”。全页面审计的 `function-decisions.csv` 157行也保留待管理层填写字段；报告内填写/导出不自动写回产品。

没有修改上述决定表，不把“优化/保留/延期”建议解释为施工授权。当前V4任务明确授权不改变产品范围的可用性修复，该授权不等于批准功能取舍。

| 对象/建议 | 当前状态 | 本轮处置 |
| --- | --- | --- |
| 首页驾驶舱改为项目首页 | CURRENT IMPLEMENTATION GAP；取舍尚未批准 | 不改首页产品角色；只恢复已有演示来源标识。 |
| 项目库/最近项目/内容创作入口合并 | 尚未批准 | 保留路线；检查导航和项目回到工作区。 |
| Studio、Canvas、MotherContent、Default Method | LEGACY COMPATIBILITY / VERIFY | 不删除、不搬迁、不扩张兼容产品中心。 |
| MaterialAnalysis/Distillation合入Research | MERGE_CANDIDATE；尚未批准 | 不改变资料/研究职责或数据结构。 |
| 通用文本成果编辑、预览、保存和历史 | CURRENT IMPLEMENTATION | 在原ArtifactEditor/Hook/接口上修复可用性。 |
| 发布、经营、License和Desktop | FUTURE | 不施工，不以本轮通过工程测试宣称商业交付完成。 |

## 发布阻断清单

| 优先级 | 状态 | 问题及边界 |
| --- | --- | --- |
| P0 | FAIL，沿用V3实测 | 真实故事时序/心理/感官和课程具体安排仍新增事实；失败稿不得对外使用。V4界面修复没有解除此项。 |
| P1 | NOT TESTED | 人工盲评与首次使用运营人员测试未完成；浏览器自动化不能替代。 |
| P1 | BLOCKED / NOT TESTED | 真实飞书授权测试连接/文档缺失，本轮不读取生产知识来凑验收。 |
| P1 | CURRENT IMPLEMENTATION GAP | ARCHITECTURE.md已登记Recommendation个性化范围安全缺口，当前未重新验收或修复；不能宣称全系统隔离。 |

本轮不能宣称上线就绪。只可沿用V3的受控内部试用判断，对外稿件逐份对照授权资料核对；保存、锁定、导出均不是事实审核。
