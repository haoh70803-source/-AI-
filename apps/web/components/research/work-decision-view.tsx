import Link from "next/link";
import type { ReactNode } from "react";
import type { WorkDeepAnswerV2 } from "@/server/research/work-research-contract";

type Props = { answer: WorkDeepAnswerV2; sourceItemId: string | null; savedRunId: string | null; showIntro?: boolean; creationAction?: ReactNode };
type Citation = { ref: "W1" | "M1"; quote: string };

function Evidence({ citation, sourceItemId }: { citation: Citation; sourceItemId: string | null }) {
  return <details className="work-decision-evidence"><summary>原内容与来源</summary><blockquote>{citation.quote}</blockquote><span>{citation.ref === "M1" ? "研究时保存的资料正文" : "研究时保存的作品标题"}</span>{sourceItemId ? <Link href={`/library/${sourceItemId}`}>打开原资料核对 →</Link> : null}</details>;
}

function interpretationText(value: string, corrections: WorkDeepAnswerV2["decision"]["displayCorrections"]) {
  // A finding about an ASR error must still name the original erroneous word.
  if (/转写|识别|原词|误写|ASR/u.test(value)) return value;
  return corrections.reduce((text, item) => text.replaceAll(item.original, item.display), value);
}

export function WorkDecisionIntro({ answer }: { answer: WorkDeepAnswerV2 }) {
  const decision = answer.decision;
  const correction = (value: string) => interpretationText(value, decision.displayCorrections);
  return <section className="work-decision-intro" aria-labelledby="work-one-line">
    <div><span className="work-decision-kicker">一句话看懂</span><h2 id="work-one-line">{correction(decision.executiveSummary.oneLine)}</h2><p>{correction(decision.executiveSummary.topicDecision)}</p></div>
    <div className="work-decision-playbook"><h3>核心打法</h3><ol>{decision.executiveSummary.corePlaybook.map((item, index) => <li key={index}><span>{String(index + 1).padStart(2, "0")}</span>{correction(item)}</li>)}</ol></div>
  </section>;
}

export function WorkDecisionView({ answer, sourceItemId, showIntro = true, creationAction }: Props) {
  const decision = answer.decision;
  const correction = (value: string) => interpretationText(value, decision.displayCorrections);
  const topMechanisms = answer.mechanisms;
  const workWeaknesses = decision.weaknesses.filter(item => !/转写|识别错误|ASR|字幕错字/u.test(item.finding));
  const claimItems = (items: typeof decision.claims) => <ul className="work-decision-claims">{items.map((item, index) => <li key={`${index}-${item.claim}`}><strong>{correction(item.claim)}</strong><p>{item.offeredProof ? correction(item.offeredProof) : "作品没有给出明确证明"}<span> · {item.proofKind === "NONE" ? "未提供" : item.proofKind === "ORAL" ? "作者口述" : "作品内呈现"}</span></p><Evidence citation={item.citation} sourceItemId={sourceItemId} /></li>)}</ul>;
  return <div className="work-decision-view">
    {showIntro ? <WorkDecisionIntro answer={answer} /> : null}
    {decision.displayCorrections.length ? <p className="work-decision-asr">展示文字已校正明显的转写错词；原文与引用保持不变。{decision.displayCorrections.map(item => `“${item.original}”显示为“${item.display}”`).join("；")}。</p> : null}
    <section className="work-research-section work-decision-topic"><header><h2>这个选题从哪里切入</h2><p>从观众正在面对的问题，看到作者选取的角度。</p></header>
      <div className="work-decision-topic-grid"><div><span className="work-decision-label">切入角度</span><h3>{correction(decision.topicLogic.angle)}</h3><p>{correction(decision.topicLogic.whyThisAngle)}</p>{decision.topicLogic.deeperStakes ? <p><strong>更深的后果：</strong>{correction(decision.topicLogic.deeperStakes)}</p> : null}{decision.topicLogic.reframe ? <p><strong>认知变化：</strong>{correction(decision.topicLogic.reframe)}</p> : null}<Evidence citation={decision.topicLogic.citation} sourceItemId={sourceItemId} /></div>
        <div><span className="work-decision-label">谁会在意</span>{decision.audienceRoles.length ? <ul>{decision.audienceRoles.map((item, index) => <li key={index}><strong>{correction(item.role)}</strong><span>{correction(item.need)}</span><Evidence citation={item.citation} sourceItemId={sourceItemId} /></li>)}</ul> : <p>当前正文没有足够信息区分不同角色。</p>}</div></div>

    </section>
    <section className="work-research-section"><header><h2>标题承诺和实际兑现</h2><p>点进来的理由，与看完后真正得到的内容。</p></header><div className="work-decision-promise"><div><span>标题 / 开头</span><p>{correction(decision.packaging.titlePromise || decision.packaging.opening || "当前标题或开头没有明确承诺。")}</p></div><div><span>正文兑现</span><p>{correction(decision.promisePayoff.delivered || "无法从当前正文判断兑现结果。")}</p></div></div>{decision.promisePayoff.gap ? <p className="work-decision-gap">需要留意：{correction(decision.promisePayoff.gap)}</p> : null}<Evidence citation={decision.promisePayoff.citation} sourceItemId={sourceItemId} /></section>
    <section className="work-research-section"><header><h2>内容怎样往前走</h2><p>每个节点都是一次内容决策，顺序来自这条作品本身。</p></header><ol className="work-decision-flow">{answer.structureBlocks.map(block => <li key={block.order}><span>{String(block.order).padStart(2, "0")}</span><strong>{correction(block.role)}</strong><p>{correction(block.contentDecision)}</p><details><summary>看这一段</summary><p>{correction(block.content)}</p>{block.audienceState ? <p>观众可能：{correction(block.audienceState)}</p> : null}{block.nextQuestion ? <p>留下的问题：{correction(block.nextQuestion)}</p> : null}<Evidence citation={block.citation} sourceItemId={sourceItemId} /></details></li>)}</ol>

    </section>
    {topMechanisms.length ? <section className="work-research-section"><header><h2>可以借鉴哪些写法</h2><p>只展示最能解释这条作品的做法。</p></header><ul className="work-decision-mechanisms">{topMechanisms.map((item, index) => <li key={index}><span>{({ ATTENTION: "注意力", PROOF: "可信度", EXPRESSION: "表达", OTHER: "内容" })[item.kind]}</span><h3>{correction(item.name)}</h3><p>{correction(item.description)}</p><Evidence citation={item.citation} sourceItemId={sourceItemId} /></li>)}</ul></section> : null}

    <section className="work-research-section"><header><h2>值得学，也要看到不足</h2><p>借方法之前，先看这条作品自己的取舍。</p></header><div className="work-decision-review"><div><h3>值得学</h3><ul>{decision.strengths.map((item, index) => <li key={index}><strong>{correction(item.finding)}</strong><p>{correction(item.whyItMatters)}</p><Evidence citation={item.citation} sourceItemId={sourceItemId} /></li>)}</ul></div><div><h3>可以做得更好</h3><ul>{workWeaknesses.map((item, index) => <li key={index}><strong>{correction(item.finding)}</strong><p>{correction(item.whyItMatters)}</p><Evidence citation={item.citation} sourceItemId={sourceItemId} /></li>)}</ul></div></div></section>
    <section className="work-research-section work-decision-transfer"><header><h2>把方法用到自己的内容</h2><p>看看哪些方法适合自己的受众与业务，再选择下面要借鉴的部分。</p></header><h3>我可以从什么角度写</h3><p>{correction(decision.creationBlueprint.angle)}</p><p>把这个起点换成自己的受众与问题，再用下方的资料和目标生成自己的版本。</p><h3>{correction(answer.transferable.principle)}</h3><p>{correction(answer.transferable.why)}</p><ol>{answer.transferable.steps.map((step, index) => <li key={index}>{correction(step)}</li>)}</ol><div className="work-decision-transfer-note"><strong>换成自己的内容时需要补充</strong><p>{correction(decision.creationBlueprint.proofNeeded)}</p></div>{decision.testVariables.length ? <p className="work-decision-test">下一版可测试：{decision.testVariables.map(item => item.variable).join("、")}</p> : null}</section>
    {creationAction}
    <details className="work-research-full"><summary>查看完整研究与依据</summary><div>    <section className="work-research-section"><header><h2>作者靠什么让人相信</h2><p>口述、案例和真实核验是不同的证据层级。</p></header>{decision.claims.length ? <>{claimItems(decision.claims)}</> : <p>当前内容没有可单独核验的主张与证明。</p>}{decision.ctaAnalysis.action ? <div className="work-decision-cta"><p><strong>最后引导：</strong>{correction(decision.ctaAnalysis.action)}</p><p><strong>铺垫：</strong>{decision.ctaAnalysis.preparation ? correction(decision.ctaAnalysis.preparation) : "当前正文中没有清晰铺垫。"}</p></div> : null}</section><h2>逐段内容与分析限制</h2><p>{correction(answer.summary)}</p><ol>{answer.structureBlocks.map(block => <li key={block.order}><strong>{correction(block.role)}</strong><p>{correction(block.purpose)}</p><Evidence citation={block.citation} sourceItemId={sourceItemId} /></li>)}</ol><h3>研究限制</h3><ul>{decision.researchLimits.map((item, index) => <li key={index}>{item}</li>)}</ul></div></details>
    <p className="work-decision-disclaimer">关于注意力、可信度和传播效果的判断属于内容机制分析；当前没有平台留存或转化数据证明因果。</p>
  </div>;
}
