"use client";

import { ArrowRight, CheckCircle2, CircleAlert, Lightbulb, Sparkles } from "lucide-react";
import type { AssistantMessageDTO, AssistantStructuredResult, AssistantTopicResultItem } from "@/lib/contracts/assistant";

type Props = {
  message: AssistantMessageDTO;
  onContinue?: (instruction: string) => void;
  onTopicContinue?: (topic: AssistantTopicResultItem) => void;
  onTopicSave?: (topicIndex: number) => void;
};

function TextResult({ content }: { content: string }) {
  return <div className="assistant-result assistant-result-text" data-testid="assistant-text-result">{content || "正在整理结果…"}</div>;
}

function TopicResult({ result, onContinue, onSave }: { result: Extract<AssistantStructuredResult, { type: "TOPIC" }>; onContinue?: (topic: AssistantTopicResultItem) => void; onSave?: (topicIndex: number) => void }) {
  return <section className="assistant-result assistant-result-topic" data-testid="assistant-topic-result">
    <header><span><Lightbulb size={14} /></span><div><strong>为你整理了 {result.topics.length} 个选题方向</strong><small>每个方向都可以继续展开</small></div></header>
    <div className="assistant-result-topic-list">{result.topics.map((topic, index) => {
      const sourceRefs = topic.sourceRefs?.filter((source) => source.trim() && !/^[a-z\d_-]{16,}$/iu.test(source.trim())).slice(0, 2) ?? [];
      return <article key={`${topic.title}-${index}`} data-topic-index={index}>
      <div className="assistant-topic-copy">
        <strong>{topic.title}</strong>
        {topic.angle ? <p className="assistant-topic-angle"><span>切入角度</span>{topic.angle}</p> : null}
        {topic.reason ? <p className="assistant-topic-reason"><span>为什么值得做</span>{topic.reason}</p> : null}
        {sourceRefs.length ? <small className="assistant-topic-source">参考：{sourceRefs.join("、")}</small> : null}
      </div>
      <div className="assistant-topic-actions">
        {onContinue ? <button className="assistant-topic-primary" type="button" onClick={() => onContinue(topic)}>继续展开<ArrowRight size={13} /></button> : null}
        {onSave ? <button className="assistant-topic-secondary" type="button" onClick={() => onSave(index)}>保存</button> : null}
      </div>
    </article>;
    })}</div>
  </section>;
}

function RewriteResult({ result }: { result: Extract<AssistantStructuredResult, { type: "REWRITE" }> }) {
  return <section className="assistant-result assistant-result-rewrite" data-testid="assistant-rewrite-result">
    <header><Sparkles size={15} /><strong>新版本</strong></header>
    <div className="assistant-result-rewrite-flow">
      {result.original ? <article><span>原文</span><p>{result.original}</p></article> : null}
      {result.original ? <ArrowRight size={15} aria-hidden="true" /> : null}
      <article className="is-new"><span>改写后</span><p>{result.aiVersion}</p></article>
    </div>
    {result.changeSummary?.length ? <ul>{result.changeSummary.map((item) => <li key={item}>{item}</li>)}</ul> : null}
  </section>;
}

function CheckResult({ result }: { result: Extract<AssistantStructuredResult, { type: "CHECK" }> }) {
  return <section className="assistant-result assistant-result-check" data-testid="assistant-check-result">
    <header><span><CircleAlert size={14} /></span><div><strong>识别出 {result.issues.length} 个需要关注的地方</strong><small>请回到原始资料确认后再使用</small></div></header>
    <div className="assistant-result-check-list">{result.issues.map((issue, index) => <article key={`${issue.originalText}-${index}`}>
      <div><span>原句</span><p>{issue.originalText}</p></div>
      <div><span>需要确认</span><strong>{issue.issue}</strong></div>
      {issue.reason ? <p className="assistant-result-detail">{issue.reason}</p> : null}
      {issue.suggestion ? <small>建议：{issue.suggestion}</small> : null}
    </article>)}</div>
  </section>;
}

function NextStepResult({ result, onContinue }: { result: Extract<AssistantStructuredResult, { type: "NEXT_STEP" }>; onContinue?: (instruction: string) => void }) {
  return <section className="assistant-result assistant-result-next-step" data-testid="assistant-next-step-result">
    <header><span><CheckCircle2 size={14} /></span><div><small>下一步</small><strong>{result.recommendedAction}</strong></div></header>
    <p>{result.reason}</p>
    {onContinue ? <button type="button" onClick={() => onContinue(result.recommendedAction)}><span>继续</span><ArrowRight size={15} /></button> : null}
    {result.secondaryActions?.length ? <div className="assistant-result-secondary-actions">{result.secondaryActions.slice(0, 2).map((action) => <button type="button" key={action} onClick={() => onContinue?.(action)}>{action}</button>)}</div> : null}
  </section>;
}

export function AssistantResultRenderer({ message, onContinue, onTopicContinue, onTopicSave }: Props) {
  if (message.role !== "ASSISTANT" || !message.structuredResult) return <TextResult content={message.content} />;
  const result = message.structuredResult;
  if (result.type === "TOPIC") return <TopicResult result={result} onContinue={onTopicContinue} onSave={onTopicSave} />;
  if (result.type === "REWRITE") return <RewriteResult result={result} />;
  if (result.type === "CHECK") return <CheckResult result={result} />;
  if (result.type === "NEXT_STEP") return <NextStepResult result={result} onContinue={onContinue} />;
  return <TextResult content={result.content || message.content} />;
}
