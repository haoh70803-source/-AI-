# 鑫世界 AI 开发协议

本文件落实已确定的长期工作协议，不授权 AI 自行重定产品方向或扩大任务。状态词按 [PRODUCT.md](PRODUCT.md) 使用：`INVARIANT`、`PRODUCT PRINCIPLE`、`TARGET ARCHITECTURE`、`CURRENT IMPLEMENTATION`、`CURRENT IMPLEMENTATION GAP`、`EXPERIMENT`、`LEGACY COMPATIBILITY`、`FUTURE`。目标与当前代码不一致时，报告 `CURRENT IMPLEMENTATION GAP`，不得将旧实现解释成产品规则。

## 权威信息优先级

发生冲突时依次参考：

1. [PRODUCT.md](PRODUCT.md)
2. [ARCHITECTURE.md](ARCHITECTURE.md)
3. [LEGACY.md](LEGACY.md)
4. 当前明确的模块任务说明
5. 当前模块文档
6. 其他历史 docs、README、注释
7. 历史聊天和旧任务描述

低优先级材料不能推翻高优先级规则。历史文档仍可用于追溯和查找实现，不能直接当作当前产品定义。

### Governance Update 例外

普通开发任务不得覆盖 `PRODUCT.md`、`ARCHITECTURE.md`、`LEGACY.md`、`AGENTS.md`。只有当前任务明确声明“这是经产品负责人批准的 Governance Update”，才允许修改这些权威规则。当前人工批准的治理决定可以更新旧的权威文档内容，不受普通文档优先级规则阻止。

## 任务与变更边界

- 一个任务只设一个主要目标；默认只改当前任务要求的模块。范围外问题只报告，不顺手修。
- 不默认全仓重构或清理，不顺手统一命名、格式化无关文件、改另一个模块。
- 新增 Service、Model、Adapter、Provider、DTO、Hook、CSS 系统或抽象前，先搜索等价能力；顺序为复用 → 扩展 → 适配 → 简化 → 最后新增。避免无必要的 `V2`、`V3`、`New`、`Unified`、`Next`、`LegacyNew` 平行实现。
- 修改共享 Service 前检查直接调用方和影响半径，只做到足以证明本次修改安全的相关核对，不机械扩大为全仓审计。
- **INVARIANT**：安全边界不可用 Prompt 或 UI 隐藏代替。Workspace、User、Credential、Project、Creator Account、License 等需要服务端 scope 和权限检查。

## 验证等级

| 等级 | 使用场景与最低验证 |
| --- | --- |
| V0 | 只读分析、计划、文档治理；默认不跑代码测试。 |
| V1 | 日常开发；跑直接相关的测试。 |
| V2 | 模块收口；跑模块单元测试、相关 Service / API 测试、必要 E2E 与相关 typecheck。 |
| V3 | 重要里程碑、Release、大型跨模块变更、Desktop 技术验证前、正式交付前；执行全局关键验收。 |

小改动不机械运行全仓 Playwright、build、全部测试或长时间完整验收；未运行的验证必须说明，不能将历史结果当作当前结果。

## Git 与数据库

- 默认节奏：小任务 → 小 diff → 定向验证 → 模块收口 → 独立 commit；不要长期堆积已稳定模块。
- 未经明确人工授权，不得执行 `git add` 或 `git commit`。日常施工默认停在 `READY_TO_STAGE` 或 `READY_TO_COMMIT`；只有当前任务明确授权，才允许暂存或提交。
- `push` 必须单独获得明确授权；暂存或提交授权不自动包含推送授权。
- 未经明确授权，不得 push、pull、merge、rebase、reset、stash、clean、切换分支或删除用户工作。
- 混合文件须精确处理 hunk；无法安全拆分就停止并报告，不为完成提交而带入其他模块。
- Schema、Migration 和拥有该变化的业务模块应属同一交付单元；不要让已执行 migration 长期与仓库代码分离。未经明确要求，不运行 migration deploy。

## 交付说明

日常施工优先用简短的 `STATUS`、`CHANGED`、`BOUNDARY`、`VERIFICATION`、`RISKS`、`GIT` 报告。除非任务本身是全仓审计，不每轮生成超长报告。`FUTURE` 能力不因出现在权威文档中而获得提前实施许可；`LEGACY COMPATIBILITY` 也不表示可以继续扩张旧产品中心。
