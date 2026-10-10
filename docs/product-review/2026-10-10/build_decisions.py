"""Build review records from explicit static findings; never prefill final decisions."""
from pathlib import Path
import json

OUT = Path(__file__).resolve().parent
ROOT = OUT.parents[2]
SOURCES = {
    "home": "apps/web/app/(app)/home/page.tsx",
    "dashboard": "apps/web/app/(app)/dashboard/page.tsx",
    "video": "apps/web/server/video-operations/service.ts",
    "analytics": "apps/web/components/video-analytics-workspace.tsx",
    "project": "apps/web/server/project-service.ts",
    "sidebar": "apps/web/server/sidebar/service.ts",
    "assistant": "apps/web/server/assistant/service.ts",
    "policy": "apps/web/server/assistant/creation-policy.ts",
    "prompt": "apps/web/server/assistant/prompt.ts",
    "controls": "apps/web/components/projects/creation-controls.tsx",
    "artifact": "apps/web/server/artifacts/service.ts",
    "editor": "apps/web/components/projects/artifact-editor.tsx",
    "studio": "apps/web/components/projects/studio-shell.tsx",
    "feishu": "apps/web/server/knowledge/feishu-context.ts",
    "faccess": "packages/integrations/src/knowledge/feishu-access.ts",
    "governance": "apps/web/server/content-governance/service.ts",
    "material": "apps/web/server/material-detail/service.ts",
    "research": "apps/web/server/research/service.ts",
    "skill": "apps/web/server/ai/skill-resolver.ts",
    "context": "apps/web/server/ai/control/context-builder-v2.ts",
    "auth": "apps/web/server/access.ts",
    "integration": "packages/integrations/src/service.ts",
    "provider": "packages/integrations/src/system-provider-policy.ts",
    "usage": "apps/web/server/admin/usage.ts",
    "storage": "apps/web/server/local-storage.ts",
    "publish": "apps/web/server/publishing/publish-task-service.ts",
    "schema": "packages/db/prisma/schema.prisma",
    "product": "PRODUCT.md",
    "architecture": "ARCHITECTURE.md",
    "legacy": "LEGACY.md",
}
# ID, original candidate name, bounded code observation, value hypothesis,
# evidence keys, dependencies, proposed disposition, relative cost driver.
DATA = """
01.01|核心业务指标卡片|部分对应：现有主要为内容流量指标，不是机构经营指标；首页为演示|帮助识别运营变化|home,video|数据来源与口径|优化|中：真实口径与展示调整
01.02|AI创作成果统计|部分对应：有管理端调用和项目计数，未确认首页成果效率统计|观察工作台使用效果|usage,artifact|成果和调用记录|优化|中：统计定义与埋点
01.03|短视频数据概览|代码存在：手动或 CSV 快照汇总；首页样例不能作为真实数据|集中查看录入的流量|video,home|账号与日快照|延期|中：数据维护
01.04|平台账号数据对比|部分对应：账号矩阵和筛选；不代表平台授权实时对比|比较账号表现|video,analytics|账号和一致时间范围|延期|中：口径和接入
01.05|最近创作项目|代码存在：侧栏项目列表和最近打开偏好|回到持续工作|sidebar,dashboard|项目与用户偏好|保留|低：入口维护
01.06|任务待办与进度|代码存在：VideoTask 截止时间、状态和完成记录|减少遗漏|video|账号和成员|延期|中：运营域维护
01.07|数据趋势图|代码存在：已录入快照形成趋势；演示模式另外生成样例|观察已录入数据变化|video,analytics|时间范围和日快照|延期|中：覆盖率与口径
01.08|快捷操作入口|代码存在：创建项目、附资料、进入工作台等入口|缩短开始工作路径|dashboard,project|登录与项目|保留|低：交互维护
01.09|异常数据提示|部分对应：规则生成播放下降、人工限流、负评提醒；不是智能预警系统|辅助人工复核|video|完整日与人工标记|延期|中：误报和规则维护
01.10|数据更新时间与来源|CURRENT IMPLEMENTATION GAP：首页隐藏来源；真实录入有 observedAt/source|防止样例与真实混淆|home,analytics,video|来源、样例模式、更新时间|优化|中：全路径标识核对
02.01|资料上传与内容解析|代码基础存在：SourceItem、资产、转录与资料详情；格式成功率待实测|减少手工整理|schema,material|存储、Worker、ASR、解析器|保留|中：媒体和异步处理
02.02|主题与选题生成|代码存在：TOPIC 策略、选题保存和选题治理；成效待评估|提供创作切入角度|policy,assistant,governance|输入资料、模型|保留|中：模型和质量评估
02.03|短视频口播脚本|代码存在：SCRIPT 策略；旧母稿路径兼容，口播不是产品中心|交付可拍摄文本|policy,studio,legacy|项目、资料、模型、成果|保留|中：内容质量
02.04|短视频分镜脚本|部分对应：策略可按要求附镜头建议；未确认独立结构化分镜交付|辅助拍摄准备|policy|脚本与明确拍摄要求|延期|中：交付格式与质量
02.05|朋友圈文案|代码存在：MOMENTS 策略和任务类型选择；自然度待实测|减少招生文案改稿|policy,controls|事实、身份、模型|保留|中：质量评估
02.06|小红书图文文案|部分对应：旧平台适配与通用对话基础；独立图文闭环待核验|复用内容到渠道|schema,legacy|旧 PlatformVariant、平台规范|延期|中：旧流程耦合
02.07|抖音标题与简介|部分对应：旧平台内容及发布包基础；通用成果接入待核验|准备发布配套文本|schema,publish|稿件、平台版本、人工审核|延期|中：兼容与接入
02.08|活动宣传与招生文案|部分对应：PLAN、MOMENTS 和通用对话可承载；非专门已验收模块|完成宣传策划|policy,prompt|真实课程、活动信息|保留|中：事实和风格验收
02.09|多版本创作与对比|部分对应：稿件分支、历史和成果恢复；未确认并排比较|比较候选并保留过程|studio,artifact|DraftBranch、DraftRevision|优化|中：版本交互
02.10|自定义创作风格|代码存在：任务深度、自然度、身份和 Skill；实际风格一致性待评估|适配机构表达|controls,policy,skill|身份资料、可选技能|保留|中：评估样本
02.11|口语化与降低AI味|EXPERIMENT：有 SPOKEN 策略与提示约束；不等于质量问题已解决|减少人工润色|policy,prompt|真实输入、内容质量评审|优化|中：真实模型盲评
02.12|对话修改与局部重写|代码存在：选区/段落合并、版本检查、未选区保护|快速改稿且保留其他内容|assistant,policy,artifact|已保存成果、版本与权限|保留|中：冲突和范围验证
02.13|字数与内容长度控制|部分对应：深度、简短/详细识别和 token 上限；非严格字数保证|适配时长与渠道|policy,controls|生成策略与正文校验|优化|中：长度质量
02.14|创作内容保存与导出|代码存在：文本成果保存、历史、已保存版本导出；非所有格式导出|让成果可持久使用|artifact,editor|Artifact、版本、成员权限|保留|中：可靠性验收
03.01|Agent入口与角色选择|部分对应：项目 Agent 与身份/任务控制；非多岗位独立 Agent 系统|降低使用门槛|dashboard,controls,assistant|项目和可选技能|优化|中：职责收敛
03.02|创作意图理解|代码存在：意图和策略识别；正确率待实测|减少反复解释|assistant,policy|本轮指令与上下文|保留|中：任务样本评估
03.03|多轮对话与上下文记忆|代码存在：线程、历史和召回；长期记忆准确率待核验|连续协作|assistant,schema|用户、项目、对话范围|保留|中：上下文长度和误记忆
03.04|关联项目历史成果|代码存在：ArtifactContextAdapter 与目标成果读取|基于已有工作继续|assistant,artifact|项目、成果、版本|保留|中：范围与更新
03.05|调用企业知识库|代码存在：授权飞书资料检索与上下文引用；外部调用可关闭|使回答依据机构资料|feishu,context|授权、同步、检索、scope|保留|中：第三方接口
03.06|不同创作策略与风格|代码存在：探索/执行、任务类型、自然度和 Skill Resolver|适配不同工作需求|policy,controls,skill|模型、技能和输入|保留|中：策略质量
03.07|提出创作方向建议|代码存在：探索模式提供多个实质不同角度；实际差异待评估|加快方案选择|policy|需求和真实依据|保留|中：发散质量评估
03.08|修改意图识别|代码存在：EDIT、选区、指定段落和补充任务状态|减少改稿偏离|policy,assistant|目标正文和版本|保留|中：语义边界
03.09|结果质量自检|部分对应：提示自检及事实警告后处理；不是独立质量评分系统|减少明显失实输出|prompt,assistant|可核实输入与评审样本|优化|中：质量指标和误判
03.10|操作过程及调用记录|代码存在：执行状态、AIRun、ApiUsage、AuditLog|追溯失败与成本|assistant,schema,usage|运行记录与权限|保留|中：记录保留与脱敏
04.01|飞书Wiki接入|代码存在：浏览、订阅、同步和授权文档上下文；真实租户连通待验证|复用现有企业资料|feishu,schema,faccess|飞书权限和外部调用开关|保留|中：接口限流与授权
04.02|文档导入与解析|代码基础存在：DOCX/PDF 等适配和 SourceItem；格式兼容待验证|减少资料重复输入|material,schema|文件、解析器和存储|保留|中：格式兼容
04.03|知识库分类与检索|部分对应：分类、检索与 KnowledgeEntry；不是已验收统一搜索系统|定位所需依据|feishu,governance|入库、索引和权限|保留|中：检索质量
04.04|按机构或项目隔离资料|部分对应：workspace scope 和项目资料关系；全系统隔离存在已知缺口|防止跨机构资料泄露|auth,project,architecture|服务端 scope 与成员权限|保留|高：安全负向验证
04.05|企业产品与课程资料管理|部分对应：通用知识条目、事实和资料；未确认课程专属模型|统一课程与产品依据|governance,schema|资料与事实审核|保留|中：内容治理
04.06|历史案例与优秀素材库|部分对应：资料集合和知识条目；没有据此证明专用案例工作流|复用有价值资料|schema,governance|来源、分类、权限|优化|中：分类与复用交互
04.07|资料更新与同步|代码存在：飞书同步、连接版本与失效内容处理；时效待实测|减少陈旧依据|feishu,faccess|第三方授权、Worker、缓存|保留|中：更新与失效处理
04.08|资料来源引用|代码存在：Context 来源、飞书原文链接和联网来源|提高可追溯性|feishu,assistant|可访问原文和来源元数据|保留|中：引用正确率
04.09|知识权限管理|部分对应：成员检查、RESTRICTED 知识范围、飞书 scope；不宣称完全隔离|保护内部资料|faccess,governance,architecture|服务端权限和撤权处理|保留|高：越权回归
04.10|敏感信息处理|部分对应：保密级别、凭证配置与事实边界；未确认统一自动脱敏|降低敏感内容外发风险|governance,integration,prompt|密钥加密、权限、日志规则|优化|高：外发与脱敏核对
06.01|创作项目创建|代码存在：创建长期项目，可附资料、技能和模型偏好|组织持续工作|project,dashboard|登录、Workspace、资料和技能|保留|中：创建编排耦合
06.02|草稿自动保存|部分对应：旧 Studio 保存编排；通用成果是显式保存按钮，不应笼统称全部自动保存|减少工作丢失|studio,editor|版本、失败提示、冲突保护|优化|中：保存可靠性
06.03|项目分类与搜索|代码存在：文件夹、列表搜索和用户偏好|快速找到工作|project,sidebar|项目权限与偏好|保留|低：入口维护
06.04|创作版本历史|代码存在：DraftRevision、成果历史与恢复|回溯和撤回编辑|artifact,editor|版本与权限|保留|中：冲突验收
06.05|再次打开继续修改|代码存在：项目转入 dashboard、加载工作区和成果|跨会话持续工作|dashboard,artifact,sidebar|持久数据与版本|保留|中：恢复和兼容
06.06|成果收藏与归档|部分对应：项目偏好/归档和成果锁定；未确认成果专属收藏归档|整理成果|sidebar,project,artifact|对象生命周期和引用|优化|中：对象语义
06.07|复制及导出|代码存在：成果导出已保存版本；具体复制入口见控件索引|带到发布与外部工具|editor,analytics|已保存正文与权限|保留|低：格式与提示
06.08|项目状态管理|代码存在：状态转换、归档和恢复；部分状态仍与旧流程关联|识别项目进度|project,legacy|权限、旧审核和稿件|优化|中：兼容状态
06.09|素材与成果关联|部分对应：ProjectSource、来源消息和 Context 引用；完整成果溯源待验收|复用有据可查的产出|project,artifact,context|SourceItem、对话、成果|保留|中：溯源一致性
06.10|成果复用与模板沉淀|部分对应：继续修改、稿件复制和 Skill 版本；未确认通用模板沉淀闭环|减少重复劳动|studio,artifact,skill|成果、可选技能与版本|优化|中：模板边界
07.01|任务新建与分配|代码存在：VideoTask 和成员分配；不是通用协作任务系统|安排运营执行|video,schema|账号、成员与角色|延期|中：任务域维护
07.02|任务优先级|未确认：VideoTask 当前未见 priority 字段|帮助排序工作|schema|任务模型和排序|延期|中：需求与模型调整
07.03|截止日期与提醒|部分对应：dueAt、逾期与延期；未确认主动推送提醒|减少逾期|video,schema|任务、时间口径、通知渠道|延期|中：通知能力
07.04|内容审核与审批|部分对应：选题评审、事实确认、旧平台审核；非统一成果审批流程|降低错误发布|governance,publish,schema|角色、事实和旧平台版本|延期|高：跨模块状态
07.05|评论和修改意见|部分对应：审核意见/任务执行记录；未确认通用成果评论线程|保留审核意见|governance,publish,video|成果或任务的权限|延期|中：协作模型
07.06|团队协同编辑|未确认：版本冲突保护不等于多人实时协作编辑|支持共同编辑|artifact,schema|冲突、成员、协同协议|延期|高：实时协作
07.07|内容发布状态跟踪|代码存在：内容台账与人工发布任务状态；不是自动发布成功回执|记录运营进度|video,publish|账号、平台内容、人工记录|延期|中：状态可信度
07.08|任务完成率统计|部分对应：今日完成和待办计数；未确认系统性完成率统计|观察执行情况|video|任务范围、时间分母|延期|中：统计口径
07.09|操作日志|代码存在：AuditLog 写入；覆盖率和保留策略未验收|追溯重要操作|schema,video,artifact|服务端身份与脱敏|保留|中：覆盖率和保留
07.10|负责人工作看板|部分对应：任务指派与列表；未确认专门负责人看板|了解工作负荷|video,schema|任务与成员范围|延期|中：看板需求
08.01|登录与身份认证|代码存在：Session、登录与禁用检查；运行有效性待验收|控制访问入口|auth,schema|认证、会话和用户状态|保留|中：会话与安全
08.02|角色与权限管理|代码存在：WorkspaceRole、成员角色和管理检查；全域安全仍有缺口|保护不同操作权限|auth,architecture,schema|服务端成员及 scope|保留|高：权限负向验证
08.03|多机构或多租户管理（候选）|部分对应：Workspace 基础；不等于席位、许可证或完整商业交付|隔离客户与团队|product,auth,schema|用户、Workspace、商业授权|延期|高：商业交付后续域
08.04|大模型配置与切换|代码存在：模型目录、系统/公司配置和项目模型偏好|选择适用模型|provider,integration,project|凭证、能力与可用性|保留|中：模型适配
08.05|API密钥和额度管理|部分对应：配置、加密和调用限制基础；未确认统一供应商剩余额度管理|管理调用入口|integration,provider,assistant|安全凭证与服务端限制|优化|高：凭证与额度口径
08.06|第三方平台授权|部分对应：飞书授权和 Provider 配置；不是抖音/小红书完整 OAuth 发布授权|连接外部能力|feishu,provider,integration|供应商权限与策略|优化|高：授权和撤权
08.07|调用成本统计|部分对应：ApiUsage、token 和转录时长；不等于供应商实际账单|估算资源消耗|usage,schema|供应商单价与真实用量|优化|中：账单口径
08.08|系统运行监控|部分对应：任务状态、运行和诊断基础；未确认完整告警/SLA 系统|定位运行问题|assistant,research,schema|运行日志和后台任务|优化|中：诊断与告警
08.09|数据备份与恢复|FUTURE：有本机文件目录管理；未确认数据库与文件一致备份恢复闭环|降低数据丢失风险|product,storage|数据库、文件、恢复演练|延期|高：一致性和桌面交付
08.10|安全审计及错误日志|部分对应：AuditLog、AI 失败状态和安全测试资产；非全域已验收|追溯安全和故障|auth,assistant,schema,architecture|权限、错误脱敏、保留策略|保留|高：安全与恢复验证
""".strip()

records = []
for line in DATA.splitlines():
    fid, name, observed, value, evidence, dependencies, suggestion, cost = line.split("|")
    refs = [SOURCES[key] for key in evidence.split(",")]
    for file in refs:
        assert ROOT.joinpath(file).is_file(), file
    if "CURRENT IMPLEMENTATION GAP" in observed:
        governance_status = "CURRENT IMPLEMENTATION GAP"
    elif observed.startswith("FUTURE"):
        governance_status = "FUTURE"
    elif observed.startswith("EXPERIMENT"):
        governance_status = "EXPERIMENT"
    elif observed.startswith("未确认"):
        governance_status = None
    else:
        governance_status = "CURRENT IMPLEMENTATION"
    records.append({"id": fid, "name": name, "explanation": observed, "businessValueHypothesis": value, "governanceStatus": governance_status, "implementationObservation": observed, "actualEffect": "本轮无运行或业务成效测量；源码依据见 evidence。", "costEstimate": cost + "；相对判断，不是工期或报价", "evidence": refs, "dependencies": dependencies.split("、"), "suggestedDecision": suggestion, "finalDecision": None, "owner": None, "acceptance": "会议确认范围后制定；核心验收模板见报告", "executionAuthorized": False})
for i in range(1, 12):
    records.append({"id": f"05.{i:02}", "name": "待补充候选名称", "explanation": "用户仅列出板块总数，未给出此项具体名称；不能代填既定需求。", "businessValueHypothesis": None, "governanceStatus": None, "implementationObservation": "待补充名称后映射", "actualEffect": None, "costEstimate": "待定义", "evidence": [], "dependencies": [], "suggestedDecision": None, "finalDecision": None, "owner": None, "acceptance": None, "executionAuthorized": False})
records.sort(key=lambda r: r["id"])
assert len(records) == 85 and len({r["id"] for r in records}) == 85
(OUT / "feature-decisions.json").write_text(json.dumps({"title": "鑫世界 AI 工作台功能决策底稿", "date": "2026-10-10", "basis": "V0 static review; 74 named candidates and 11 unnamed slots", "decisionsAreProposals": True, "records": records}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
lines = ["# 鑫世界候选功能决策明细", "", "74 项具名候选已比对；第 05 板块保留 11 个待补项，总计 85 个槽位。代码存在不等于功能验收完成；未确认不等于未开发。建议均未批准，最终决定、负责人和执行授权为空。保留或延期建议只讨论交付范围，不授权新增 FUTURE 或删改已有兼容代码。", "", "实际效果：本轮所有项目均未做运行和业务成效测量。成本为相对维护复杂度判断，不是工期或预算。具体证据路径见 JSON；运行结果以后另记。", "", "| 编号 | 功能及说明和当前状态 | 业务价值假设 | 依赖 | 相对代价 | 建议 | 上级决定 |", "| --- | --- | --- | --- | --- | --- | --- |"]
for r in records:
    lines.append(f"| {r['id']} | **{r['name']}**：{r['implementationObservation']} | {r['businessValueHypothesis'] or '待定义'} | {'、'.join(r['dependencies']) or '待定义'} | {r['costEstimate'].split('；')[0]} | {r['suggestedDecision'] or '待补'} | 待确认 |")
lines += ["", "## 证据映射", "", "下列路径是本次实际读取或静态资产索引包含的源码。逐项映射存于 feature-decisions.json；它是报告候选清单，不是施工指令。", ""]
lines.extend(f"- {key}：[{file}](<{ROOT.joinpath(file).as_posix()}>)" for key, file in SOURCES.items())
(OUT / "feature-decisions.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
print("85 records: 74 named candidates, 11 unnamed slots; finalDecision null throughout")
