# S5 架构精简阶段报告

STATUS：本次基础编排收敛 PASS；全领域精简仍有明确保留项，不能宣称所有架构问题消除。

三条项目创建路径现在复用现有 createProject：侧栏 createBasicProject 保留校验和兼容错误码，仅委托；普通创作直接调用；选题转换在原审批/事实事务内调用。研究分享与旧 Idea 启动原本或已在 S3 复用同一事务能力。统一基础分支、活跃成员权限、CreatorProfile、IP快照、个人文件夹排序与 Audit，不新增 ProjectV2 或第二套创建服务。

行为变化：空项目也使用普通项目的已发布 IP 快照与 CreatorProfile 初始化；零 Skill 仍合法。选题证据 EVIDENCE 绑定与事务历史仍由选题编排负责，不把其审批强加给普通项目，不引入八条创作引用上限限制旧选题证据。

A27：纯 workResearchMarkdown 实现放入 lib/work-research-markdown.ts；API直接引用共享层。旧 components 路径保留薄 re-export 兼容，格式与安全转义没有第二套实现或删除文件。

Artifact 在默认工作区、高级成果窗和既有研究场景继续用同一编辑及版本状态契约。研究外壳沿用 ResearchShell，生命周期仍使用各自已有服务；本次没有生造通用 ResearchRuntime。不同研究证据、任务状态不得按相似 JSX 强行合并。

资料原文通过 readable-content 与 existing reference adapter 读取；MaterialAnalysis/Distillation 的旧深度编排仍是 A17 CURRENT IMPLEMENTATION GAP，未通过简单搬文件伪装职责拆分。全局 CSS 多套历史覆盖仍在，当前只修实测遮挡并将新增布局限制在项目/成果选择器。API错误封装保留各域错误语义，Discovery 新增映射已有 Project/Research 错误且保留 fallback。

Web/Worker模式锁和运行入口未重写。Web及Worker typecheck均PASS，未启动生产队列。

## 验收与回滚

创建编排 60 PASS（output/v4-s5/creation-consolidation.json）：v4-project-creation-permissions、sidebar-organization、creation-composer、content-governance、research-project-handoff、content-discovery。

纯报告格式器定向用例 PASS（output/v4-final/report-formatter.json）。最终29文件203项核心回归PASS、导航13项PASS、浏览器1项PASS；次数不能累计为不同能力完成率。

Web最终类型PASS；Worker类型PASS（output/v4-final/worker-typecheck.log）。仅反向补丁阶段 hunks；所有共享调用方在上述定向集成/类型范围核对，未全仓迁移或删除旧入口。A17、全局CSS彻底归一、旧数据按需加载等仍待后续独立模块收口；不因文件变少而宣称领域边界完成。
