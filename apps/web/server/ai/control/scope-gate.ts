import type { AIControlTask, ScopeDecision, SelectedContextObject } from "./contracts";

const explicitlyUnrelated = [
  /(?:编程|代码|算法)(?:作业|题目|考试)/u,
  /(?:股票|基金|期货|加密货币).{0,12}(?:买卖|交易|荐股|收益|仓位)/u,
  /(?:今天|明天|本周).{0,8}(?:天气|气温|下雨)/u,
  /(?:数学|高数|代数|几何).{0,8}(?:作业|题目|解题|答案)/u,
  /(?:百科|介绍一下|是什么).{0,12}(?:恐龙|行星|化学元素|历史人物)/u,
];

const contentRelated = /(选题|写稿|改写|口播|标题|内容|资料|素材|研究|方法|表达|事实|来源|项目|创作|脚本|文章|视频|检查)/u;
const projectNativeTasks = new Set<AIControlTask>(["CONTENT_CHECK", "TOPIC_CANDIDATES", "DRAFT_SUGGESTION", "SOURCE_UNDERSTANDING", "RESEARCH", "METHOD_GUIDANCE", "MATERIAL_SEARCH", "MATERIAL_KNOWLEDGE_EXTRACTION", "METHOD_SUGGESTION_FROM_RESEARCH", "CREATOR_PROFILE_SUGGESTION"]);

export type ScopeGateInput = {
  userId: string;
  workspaceId: string;
  projectId?: string;
  taskType: AIControlTask;
  userInput?: string;
  selectedObjects?: SelectedContextObject[];
};

export type ScopeGateResult = {
  decision: ScopeDecision;
  reason: string;
  employeeMessage?: string;
};

export class ScopeGate {
  evaluate(input: ScopeGateInput): ScopeGateResult {
    const text = input.userInput?.trim() ?? "";
    if (text && explicitlyUnrelated.some((pattern) => pattern.test(text))) {
      return { decision: "OUT_OF_SCOPE", reason: "EXPLICITLY_UNRELATED", employeeMessage: "鑫小助主要用于当前内容项目相关的研究、资料整理和创作。" };
    }
    if (projectNativeTasks.has(input.taskType)) {
      return { decision: input.projectId || input.selectedObjects?.length ? "ALLOW_WITH_CONTEXT" : "ALLOW", reason: "CONTENT_TASK_TAXONOMY" };
    }
    if (contentRelated.test(text)) return { decision: input.projectId ? "ALLOW_WITH_CONTEXT" : "ALLOW", reason: "CONTENT_RELATED_INPUT" };
    if (input.projectId || input.selectedObjects?.length) return { decision: "ALLOW_WITH_CONTEXT", reason: "AMBIGUOUS_WITH_PROJECT_CONTEXT" };
    return { decision: "OUT_OF_SCOPE", reason: "NO_CONTENT_SCOPE", employeeMessage: "鑫小助主要用于当前内容项目相关的研究、资料整理和创作。" };
  }
}
