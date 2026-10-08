import type { DefaultContentMethodSection } from "./schemas";

export const INTERNAL_KNOWLEDGE_V1 = {
  title: "鑫世界内容中心内部知识源 V1",
  workspaceName: "鑫世界",
  sourceFile: "鑫世界内容中心内部知识源V1_导入版.md",
  sha256: "22EA56F0F7AA0933026D7DE734FD3157AAE7F87D440E458B26922C175EFFA5CC",
} as const;

export type InternalKnowledgeEligibility = "DEFAULT_METHOD" | "BACKGROUND_ONLY" | "FUTURE_ROUTE" | "EXAMPLE_ONLY";
export type InternalKnowledgeCategory = "COMPANY_POSITIONING" | "BUSINESS_PROBLEM" | "CREATION_PRINCIPLE" | "EVIDENCE_RULE" | "CONTENT_BOUNDARY" | "BACKGROUND" | "FUTURE_ROUTE" | "EXAMPLE";

export type InternalKnowledgeItem = {
  id: string;
  category: InternalKnowledgeCategory;
  title: string;
  summary: string;
  eligibility: InternalKnowledgeEligibility;
  sections: DefaultContentMethodSection["code"][];
  allowsOwnFact: boolean;
};

const usable = (id: string, category: Exclude<InternalKnowledgeCategory, "BACKGROUND" | "FUTURE_ROUTE" | "EXAMPLE">, title: string, summary: string, sections: DefaultContentMethodSection["code"][], allowsOwnFact = false): InternalKnowledgeItem => ({ id, category, title, summary, eligibility: "DEFAULT_METHOD", sections, allowsOwnFact });

export const internalKnowledgeV1: InternalKnowledgeItem[] = [
  usable("IKV1-001", "COMPANY_POSITIONING", "公司关注真实经营问题", "鑫世界不是单纯教 AI 工具或交付 Prompt，而是帮助 AI 进入内容、招生、销售、教研、交付和管理等真实经营问题。", ["AUDIENCE", "TOPIC"], true),
  usable("IKV1-002", "COMPANY_POSITIONING", "核心目标用户", "优先服务已有真实业务的教培机构老板、创始人、合伙人和实际经营负责人。", ["AUDIENCE"], true),
  usable("IKV1-003", "COMPANY_POSITIONING", "需要负责人参与", "目标用户愿意亲自参与判断、提供真实业务资料，并推动 AI 在真实场景落地。", ["AUDIENCE"], true),
  usable("IKV1-004", "COMPANY_POSITIONING", "不主动服务的需求", "不把只学软件按钮、只拿模板、要求保证结果或希望 AI 完全替代团队的人作为核心主动目标。", ["AUDIENCE", "BOUNDARY"], true),

  usable("IKV1-005", "BUSINESS_PROBLEM", "老板表达难持续", "老板有经验和观点，但难以持续表达，团队代写又容易失真。", ["TOPIC"]),
  usable("IKV1-006", "BUSINESS_PROBLEM", "内容依赖临时灵感", "团队不知道持续拍什么，内容没有形成素材库、选题库和复盘机制。", ["TOPIC"]),
  usable("IKV1-007", "BUSINESS_PROBLEM", "专业内容难让客户理解", "内容拍了很多却少有真实咨询，专业教学事实也没有被转成客户能理解的内容证据。", ["TOPIC", "EVIDENCE"]),
  usable("IKV1-008", "BUSINESS_PROBLEM", "报价早于价值建立", "客户问完价格就失联，销售容易过早报价，没有先理解问题和建立价值。", ["TOPIC"]),
  usable("IKV1-009", "BUSINESS_PROBLEM", "客户跟进依赖个人", "客户信息、沟通记录和跟进经验没有沉淀，人员变化时难以交接。", ["TOPIC"]),
  usable("IKV1-010", "BUSINESS_PROBLEM", "成交问题缺少诊断", "成交异议和未成交客户缺少复盘，容易把所有失败都简单归因于价格。", ["TOPIC"]),
  usable("IKV1-011", "BUSINESS_PROBLEM", "教研资料重复制作", "课程资料、备课和内容更新重复耗时，缺少可复用的资料和流程。", ["TOPIC"]),
  usable("IKV1-012", "BUSINESS_PROBLEM", "好老师经验难沉淀", "优秀老师的教研和交付经验集中在个人手里，难以被团队复用。", ["TOPIC"]),
  usable("IKV1-013", "BUSINESS_PROBLEM", "教学过程没有成为证据", "家长难以看到学生的过程变化，教学事实没有沉淀成信任和招生证据。", ["TOPIC", "EVIDENCE"]),
  usable("IKV1-014", "BUSINESS_PROBLEM", "AI 工具缺少统一标准", "团队使用不同 AI 工具但没有统一资料、流程和验收标准，结果难以控制。", ["TOPIC"]),
  usable("IKV1-015", "BUSINESS_PROBLEM", "经营资料和版本分散", "SOP、制度、资料和版本分散，重复整理且容易出现跨部门信息断层。", ["TOPIC"]),
  usable("IKV1-016", "BUSINESS_PROBLEM", "自动化早于流程", "没有负责人、流程、资料和验收标准时就直接自动化，容易把 AI 错当成裁员工具。", ["TOPIC", "BOUNDARY"]),

  usable("IKV1-017", "CREATION_PRINCIPLE", "先经营问题后 AI 工具", "先说明目标用户正在遇到的真实经营问题，再把 AI 作为解决方式、产品能力或工作方法带出来。", ["TOPIC", "OPENING", "BODY"]),
  usable("IKV1-018", "CREATION_PRINCIPLE", "从真实业务找选题", "优先从老板经历、客户问题、销售异议、课堂教研、交付现场、团队卡点和真实复盘中找选题。", ["TOPIC"]),
  usable("IKV1-019", "CREATION_PRINCIPLE", "一条内容讲一个问题", "一条内容优先讲清一个核心问题，不同时承担流量、人设、销售和完整方法等多项主任务。", ["TOPIC", "BODY"]),
  usable("IKV1-020", "CREATION_PRINCIPLE", "先讲重点再展开", "可以按问题—原因—做法、结果—原因—做法或现象—判断—解释—下一步展开，不要铺很久背景才说重点。", ["OPENING", "BODY"]),
  usable("IKV1-021", "CREATION_PRINCIPLE", "先给一个可执行动作", "复杂问题先找最重要的一点、最可能执行的动作和最容易验证的下一步，不一次塞很多建议。", ["BODY", "ENDING"]),
  usable("IKV1-022", "CREATION_PRINCIPLE", "真实证据优先于自夸", "有真实材料时优先使用界面、流程、脱敏记录、前后变化、数据、案例和现场过程，不用假案例或空泛效果表述。", ["EVIDENCE"]),
  usable("IKV1-023", "CREATION_PRINCIPLE", "AI 辅助人负责判断", "AI 可以整理、归类和生成初稿，人必须负责事实确认、最终判断、承诺、隐私和风险。", ["BODY", "BOUNDARY"]),
  usable("IKV1-024", "CREATION_PRINCIPLE", "用具体人话表达", "优先说具体对象、动作、问题、结果和下一步，默认避免赋能、闭环、飞轮、势能等空泛表达。", ["OPENING", "BODY", "ENDING"]),

  usable("IKV1-025", "EVIDENCE_RULE", "正式事实需要确认", "只有来源真实、内部确认且必要时已授权的公司资料、案例、数据、经验、反馈和项目状态才能作为鑫世界事实。", ["EVIDENCE", "BOUNDARY"]),
  usable("IKV1-026", "EVIDENCE_RULE", "外部事实不能迁移", "对标博主的客户、数字、学校、成绩、身份、经历和结果只能保留为外部事实。", ["EVIDENCE", "BOUNDARY"]),
  usable("IKV1-027", "EVIDENCE_RULE", "状态必须如实表达", "方案、计划、准备测试和阶段结果要与已经完成的成果明确区分。", ["EVIDENCE", "BOUNDARY"]),
  usable("IKV1-028", "EVIDENCE_RULE", "案例要交代完整链路", "使用案例时说明起点、问题、动作、过程和结果；没有跑完的结果明确标成阶段结果。", ["EVIDENCE"]),

  usable("IKV1-029", "CONTENT_BOUNDARY", "不保证经营结果", "不得保证招生、营收、利润、成交率、涨粉、爆款、获客量、固定回本周期或固定减员比例。", ["BOUNDARY"]),
  usable("IKV1-030", "CONTENT_BOUNDARY", "保护隐私和权限", "客户、学生和员工资料按需脱敏，不公开完整名单、联系方式、聊天记录、后台权限或其他不必要的高敏信息。", ["EVIDENCE", "BOUNDARY"]),
  usable("IKV1-031", "CONTENT_BOUNDARY", "不复制和冒充原创", "不复制同行独特原句，不把外部材料包装成公司原创案例；只学习结构、选题、证据和组织方式。", ["BOUNDARY"]),
  usable("IKV1-032", "CONTENT_BOUNDARY", "不夸大 AI 和未成熟能力", "不把 AI 包装成自动赚钱或完全替代人的工具，也不把未成熟产品和测试写成已经跑通。", ["BOUNDARY"]),

  { id: "IKV1-X01", category: "BACKGROUND", title: "产品与运营背景资料", summary: "价格、付款、退款、会务、客户分级、销售跟进和合同流程仅供背景核对。", eligibility: "BACKGROUND_ONLY", sections: [], allowsOwnFact: false },
  { id: "IKV1-X02", category: "FUTURE_ROUTE", title: "经营问题型短视频", summary: "老板专项方法论只作为未来独立创作路线参考，不自动进入默认方法。", eligibility: "FUTURE_ROUTE", sections: [], allowsOwnFact: false },
  { id: "IKV1-X03", category: "EXAMPLE", title: "六条改造后短视频稿件", summary: "只作为语言和结构质量样本，其中的数字、案例和假设场景不得成为公司事实。", eligibility: "EXAMPLE_ONLY", sections: [], allowsOwnFact: false },
];

export function getInternalKnowledgeV1DryRun() {
  const count = (eligibility: InternalKnowledgeEligibility) => internalKnowledgeV1.filter((item) => item.eligibility === eligibility).length;
  return {
    ready: true,
    source: INTERNAL_KNOWLEDGE_V1,
    highValueItems: count("DEFAULT_METHOD"),
    backgroundItems: count("BACKGROUND_ONLY"),
    futureRouteItems: count("FUTURE_ROUTE"),
    exampleItems: count("EXAMPLE_ONLY"),
    categories: Object.fromEntries([...new Set(internalKnowledgeV1.map(({ category }) => category))].map((category) => [category, internalKnowledgeV1.filter((item) => item.category === category).length])),
  };
}
