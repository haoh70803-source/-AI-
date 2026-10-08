"use client";

import { ArrowRight, RefreshCw, Search, Zap } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import "./home-reference.css";
import { HomeComposer, type ComposerSelection } from "./home-composer";

import { creationPrompts, creationPromptText } from "@/lib/creation-prompts";
const categories = ["推荐", "抖音", "视频号", "朋友圈", "小红书"];
type SkillCard = { id: string; title: string; summary: string; scenarios: string[]; enabled: boolean };

export function WorkbenchStart({ canCreate, draftKey, initialSkillId, overview }: { canCreate: boolean; draftKey: string; initialSkillId?: string; overview?: ReactNode }) {
  const homeRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const inFlight = useRef(false);
  const [idea, setIdea] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"inspiration" | "skills">("inspiration");
  const [category, setCategory] = useState("推荐");
  const [offset, setOffset] = useState(0);
  const [previousIdea, setPreviousIdea] = useState<string | null>(null);
  const [appliedPrompt, setAppliedPrompt] = useState("");
  const [skills, setSkills] = useState<SkillCard[]>([]);
  const [skillState, setSkillState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [skillSearch, setSkillSearch] = useState("");
  const [reload, setReload] = useState(0);
  const creationRequestId = useRef<string | null>(null);
  const creationPayload = useRef("");
  useEffect(() => {
    if (tab !== "skills") return;
    let active = true;
    setSkillState("loading");
    void fetch("/api/methods").then(async (response) => {
      if (!response.ok) throw new Error("读取失败");
      return response.json();
    }).then((data) => {
      if (!active) return;
      const rows = Array.isArray(data) ? data : data.items ?? data.methods ?? [];
      setSkills(rows.map((item: { id: string; status: string; current: { title: string; steps: string[]; applicableScenarios: string[] } }) => ({
        id: item.id, title: item.current.title, summary: item.current.steps[0] || "查看使用说明",
        scenarios: item.current.applicableScenarios, enabled: item.status !== "DISABLED",
      })));
      setSkillState("ready");
    }).catch(() => { if (active) setSkillState("error"); });
    return () => { active = false; };
  }, [tab, reload]);
  useEffect(() => {
    try {
      setIdea(sessionStorage.getItem(draftKey) || "");
    } catch { /* Storage may be disabled. */ }
  }, [draftKey]);
  function changeIdea(value: string) {
    setIdea(value);
    creationRequestId.current = null;
    try { sessionStorage.setItem(draftKey, value); } catch { /* The in-memory draft remains usable. */ }
  }
  function usePrompt(value: string) {
    setPreviousIdea(idea);
    changeIdea(value);
    requestAnimationFrame(() => inputRef.current?.focus({ preventScroll: true }));
    window.scrollTo({ top: 0, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }
  async function start(selection: ComposerSelection) {
    const value = idea.trim();
    if (!value || !canCreate || inFlight.current) { inputRef.current?.focus(); return; }
    inFlight.current = true; setBusy(true); setError("");
    try {
      const explicitTopic = value.match(/主题(?:是|为)\s*([^，。！？!?\n]{2,36})/u)?.[1]?.trim();
      const title = explicitTopic && /口播|短视频|脚本/u.test(value) ? `${explicitTopic}口播`.slice(0, 40) : /口播|短视频|脚本/u.test(value) ? "口播稿创作" : value.replace(/^(?:我想|我要|帮我|请帮我)\s*/u, "").replace(/[。！？!?].*$/u, "").slice(0, 40) || "未命名工作";
      const payloadKey = JSON.stringify({ title, description: value, ...selection });
      if (creationPayload.current !== payloadKey) { creationPayload.current = payloadKey; creationRequestId.current = null; }
      creationRequestId.current ??= crypto.randomUUID();
      const response = await fetch("/api/projects", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title, description: value, ...selection, clientRequestId: creationRequestId.current }) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.message || "无法开始这项创作，请重试。");
      try { sessionStorage.removeItem(draftKey); sessionStorage.removeItem(`${draftKey}:sources`); sessionStorage.removeItem(`${draftKey}:composer-v2`); } catch { /* Storage may be disabled. */ }
      window.location.assign(`/dashboard?project=${result.id}&start=1`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "无法开始这项创作，请重试。");
      inFlight.current = false; setBusy(false);
    }
  }
  const filtered = creationPrompts.filter(item => category === "推荐" || item.platform === category);
  const cards = [...filtered.slice(offset % filtered.length), ...filtered.slice(0, offset % filtered.length)].slice(0, category === "推荐" ? 8 : 12);
  return <div ref={homeRef} className="xsj-home" data-testid="reference-home">
    <section className="xsj-hero" aria-labelledby="xsj-home-title">
      <div className="xsj-hero-status"><i />CONTENT OS · 创作工作台<ArrowRight size={14} /></div>
      <div className="xsj-morph-layer">
        <div className="xsj-hero-brand"><img src="/fusion/founder-os-mark.png" alt="" /><div><h1 id="xsj-home-title">鑫世界工作台</h1><p>把灵感、资料与创作连接起来</p></div></div>
        <HomeComposer initialSkillId={initialSkillId} idea={idea} onIdeaChange={changeIdea} inputRef={inputRef} canCreate={canCreate} busy={busy} draftKey={draftKey} error={error} onSubmit={(selection) => void start(selection)} />
        {appliedPrompt ? <div className="xsj-prompt-applied" role="status">已套用「{appliedPrompt}」{previousIdea !== null ? <button type="button" disabled={busy} onClick={() => { changeIdea(previousIdea); setPreviousIdea(null); setAppliedPrompt(""); }}>撤销套用</button> : null}</div> : null}
      </div>
    </section>
    {overview}
    <section className="xsj-explore" id="xsj-explore" aria-label="创作模板与 Skill">
      <div className="xsj-tabs" role="tablist" aria-label="探索内容"><button role="tab" aria-selected={tab === "inspiration"} aria-controls="inspiration-panel" id="inspiration-tab" onClick={() => setTab("inspiration")}>创作模板</button><button role="tab" aria-selected={tab === "skills"} aria-controls="skills-panel" id="skills-tab" onClick={() => setTab("skills")}>Skill</button></div>
      {tab === "inspiration" ? <div role="tabpanel" id="inspiration-panel" aria-labelledby="inspiration-tab">
        <div className="xsj-prompt-heading"><div><h2>从你想做的内容开始</h2><p>选一个模板，提示词会填入上方输入框。补一句主题，就能开始。</p></div></div>
        <div className="xsj-filter-row"><div className="xsj-categories">{categories.map(label => <button key={label} aria-pressed={category === label} onClick={() => { setCategory(label); setOffset(0); }}>{label}</button>)}</div>{filtered.length > 8 ? <button className="xsj-refresh" onClick={() => setOffset(value => value + 8)}><RefreshCw size={15}/>换一批</button> : null}</div>
        <div className="xsj-prompt-grid">{cards.map(item => <button type="button" className="xsj-prompt-card" data-platform={item.platform} key={item.title} disabled={!canCreate || busy} aria-label={`使用：${item.title}`} onClick={() => { usePrompt(creationPromptText(item)); setAppliedPrompt(item.title); }}><div className="xsj-prompt-meta"><span>{item.platform}</span><small>{item.kind}</small></div><h3>{item.title}</h3><p>{item.description}</p><small className="xsj-prompt-outputs">{item.outputs}</small><span className="xsj-prompt-apply">套用提示词<ArrowRight size={15}/></span></button>)}</div>
        <p className="xsj-reference-caption">点击只填入提示词，发送后才开始新工作。可同时添加资料、选择 Skill。</p>
      </div> : <div role="tabpanel" id="skills-panel" aria-labelledby="skills-tab">
        <div className="xsj-skill-toolbar"><label><Search size={16} /><input aria-label="搜索 Skill" placeholder="搜索你的 Skill" value={skillSearch} onChange={(event) => setSkillSearch(event.target.value)} /></label><Link href="/library/methods">管理与导入 Skill<ArrowRight size={15} /></Link></div>
        {skillState === "loading" ? <p className="xsj-empty" role="status">正在读取 Skill…</p> : skillState === "error" ? <div className="xsj-empty" role="alert">暂时无法读取 Skill。<button onClick={() => setReload((value) => value + 1)}>重试</button></div> : <div className="xsj-inspiration-grid">{skills.filter((skill) => [skill.title, skill.summary, ...skill.scenarios].join(" ").includes(skillSearch.trim())).map((skill) => <Link className="xsj-skill-card" href={`/library/methods/${skill.id}`} key={skill.id}><Zap /><span>{skill.enabled ? "可使用" : "已停用"}</span><h2>{skill.title}</h2><p>{skill.summary}</p><small>{skill.scenarios.slice(0, 2).join(" · ")}</small></Link>)}</div>}
        {skillState === "ready" && !skills.length ? <div className="xsj-empty"><Zap /><h2>从第一个 Skill 开始</h2><p>把常用Skill保存下来，需要时再加入工作。</p><Link href="/library/methods">导入 Skill<ArrowRight size={15} /></Link></div> : null}
      </div>}
    </section>

  </div>;
}
