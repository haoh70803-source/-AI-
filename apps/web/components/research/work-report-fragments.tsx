"use client";
import type {WorkDeepAnswer} from "@/server/research/work-research-contract";
const clock=(ms:number)=>Math.floor(ms/60000)+":"+String(Math.floor(ms/1000)%60).padStart(2,"0");
export function WorkSeek({accountId,workId,startMs,enabled=true}:{accountId:string;workId:string;startMs:number|null;enabled?:boolean}){
 return startMs===null?<span className="research-caption">无时间码</span>:enabled?<button className="work-seek" onClick={()=>window.dispatchEvent(new CustomEvent("research:seek-work",{detail:{accountId,workId,startMs}}))}>定位 {clock(startMs)}</button>:<time>{clock(startMs)} · 无本地原片</time>;
}
export function WorkReportFragments({blocks,accountId,workId,mediaAvailable}:{blocks:WorkDeepAnswer["structureBlocks"];accountId:string;workId:string;mediaAvailable:boolean}){
 const timed=blocks.length>0&&blocks.every(block=>block.startMs!==null&&block.endMs!==null&&block.endMs>block.startMs);
 return <section><h2>动态内容结构</h2><p className="research-caption">段落与作用来自本条报告；缺失时间码不估算。</p><nav className={timed?"work-report-timeline":"work-report-sections"} aria-label="报告段落">{blocks.map((block,index)=><a key={block.order} href={"#fragment-"+block.order}>{index+1} · {block.role}</a>)}</nav><ol className="work-report-fragments">{blocks.map(block=><li id={"fragment-"+block.order} key={block.order}><WorkSeek accountId={accountId} workId={workId} startMs={block.startMs} enabled={mediaAvailable}/>{block.endMs!==null?<time> — {clock(block.endMs)}</time>:null}<h3>{block.role}</h3><p>{block.content}</p><p><strong>作用：</strong>{block.purpose}</p>{block.expression?<p><strong>表达：</strong>{block.expression}</p>:null}<details><summary>展开本段原文</summary><blockquote className="work-report-original">{block.citation.quote}</blockquote><small>本版报告保存的引用 · {block.citation.ref==="M1"?"资料正文":"作品标题"}</small></details></li>)}</ol></section>;
}
