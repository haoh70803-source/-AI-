import type { accountResearchPrompt } from "../server/research/account-research-analysis";
import type { AccountResearchAnswer } from "../server/research/account-research-contract";
type Prompt = ReturnType<typeof accountResearchPrompt>;
export function accountResearchFixture(prompt: Prompt): AccountResearchAnswer {
  const analyses = prompt.analyzeWorks.map(work => ({ ref: work.ref, basis: work.basis as "TEXT" | "TITLE", topic: work.body ? "真实问题与证据" : "标题中的问题", titlePattern: "直接提出问题",
    audienceTask: work.body ? "核对手头的问题" : null, promise: work.body ? "让观点有证据" : null,
    opening: work.body ? "先交代真实问题" : null, progression: work.body ? ["记录问题", "核对证据", "给出下一步"] : [],
    viewpoint: work.body ? "观点需要核对证据" : null, conflict: null, examples: work.body ? "使用自己的案例" : null,
    evidenceStyle: work.body ? "用事实支持解释" : null, turn: null, ending: work.body ? "提醒继续核对" : null,
    cta: work.body ? "邀请读者检查证据" : null, density: work.body ? "围绕同一个问题推进" : null,
    citations: [{ ref: work.ref, quote: (work.body || work.title).slice(0, 80) }], limitation: work.body ? "只依据提供的文字，不推断画面" : "仅标题级观察，没有正文" }));
  const all = [...prompt.reuseAnalyses, ...analyses];
  const lead = all.find(item => item.basis === "TEXT") ?? all[0]!;
  const body = lead.basis === "TEXT";
  const finding = { id: "main-topic", category: "THEME" as const, title: "当前样本提出了什么问题", statement: body ? "当前文字强调真实问题和证据核对。" : "当前只能看到标题提出的问题，不能推断正文。", basis: lead.basis, citations: lead.citations, counterRefs: [] as string[], limitation: "当前样本不能代表账号全部内容" };
  const high = prompt.computedFacts.highPerformance.highRefs[0]; const typical = prompt.computedFacts.highPerformance.typicalRefs[0];
  const recent = prompt.computedFacts.recent.refs[0]; const previous = prompt.computedFacts.previous.refs[0];
  const titleQuote = (ref: string) => ({ ref, quote: prompt.workCatalog.find(work => work.ref === ref)!.metadata.split("\n")[0]! });
  const changed = prompt.delta.added.length > 0 || prompt.delta.updatedText.length > 0 || prompt.delta.removed.length > 0;
  return {
    summary: body ? "先从已经读到的真实文字核对内容模式，再决定值得测试的做法。" : "已有作品基础记录可以研究标题与数据，正文结构仍需对应文字。",
    workAnalyses: analyses, findings: [finding],
    comparisons: high && typical ? [{ basis: "TITLE", dimension: "TITLE", observation: "两组标题都需要继续结合正文验证，不能把高表现视为标题的必然效果。", highRefs: [high], typicalRefs: [typical], counterRefs: [typical], citations: [titleQuote(high), titleQuote(typical)], limitation: "标题级对照，指标累积时长不同" }] : [],
    recentChanges: recent && previous ? [{ dimension: "TITLE", basis: "TITLE", title: "前后样本的标题线索", observation: "这些标题还不足以单独证明内容方向改变。", recentRefs: [recent], previousRefs: [previous], citations: [titleQuote(recent), titleQuote(previous)], limitation: "只比较实际提供的标题" }] : [],
    templates: [{ name: body ? "问题与证据的展开" : "对象与问题标题", basis: lead.basis, whenToUse: "需要提出一个可以核对的问题时", steps: body ? [{ slot: "真实问题", purpose: "填写亲自遇到的问题" }, { slot: "自己的证据", purpose: "补充可以验证的案例，再提出下一步" }] : [{ slot: "具体对象", purpose: "填写受众熟悉的对象" }, { slot: "核心问题", purpose: "写出一个明确的问题" }], requiredOwnEvidence: "自己的真实案例与事实", doNotCopy: "不复制作者经历或成果数字", citations: lead.citations, counterRefs: [], limitation: "这是当前样本中的一种组织方法，仍需验证" }],
    takeaways: (["LEARN", "DO_NOT_COPY", "TEST", "INSUFFICIENT"] as const).map(kind => ({ kind, basis: lead.basis, title: { LEARN: "核对证据", DO_NOT_COPY: "保留事实归属", TEST: "从自己的问题测试", INSUFFICIENT: "继续补充对应证据" }[kind], statement: "只借鉴组织方式，用自己的证据验证，不把样本当成必然有效的公式。", citations: lead.citations, limitation: "当前样本范围有限" })),
    commentInsights: prompt.comments.length ? [{ kind: "QUESTION", title: "评论中提出的问题", statement: "评论表达了待解答的问题，不能推断购买意愿。", citations: [{ ref: prompt.comments[0]!.ref, quote: prompt.comments[0]!.text.slice(0, 80) }], limitation: "只适用于这批实际评论" }] : [],
    reviews: prompt.previousFindings.length ? prompt.previousFindings.map(item => ({ status: changed ? "STRENGTHENED" as const : "UNCHANGED" as const, previousFindingId: item.id, title: item.title, explanation: changed ? "新文字继续出现相同线索，判断得到更多样本支持。" : "当前新证据没有明显改变主要判断。", refs: [lead.ref] })) : [{ status: "NEW", previousFindingId: null, title: finding.title, explanation: "首次根据实际证据形成观察。", refs: [lead.ref] }],
    unchanged: prompt.previousFindings.length > 0 && !changed,
    limitations: ["仅依据当前实际读取内容，不推断视频画面和商业转化。"],
  };
}
