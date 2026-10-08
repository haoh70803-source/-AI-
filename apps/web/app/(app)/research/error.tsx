"use client";
export default function ResearchErrorPage({ reset }: { reset: () => void }) { return <div className="research-center-empty" role="alert"><h2>研究页面暂时无法读取</h2><p>这不会删除你的历史研究。请稍后重试。</p><button type="button" onClick={reset}>重新读取</button></div>; }
