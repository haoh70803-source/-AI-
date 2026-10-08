"use client";
import { useEffect, useRef, useState } from "react";
export default function ExperienceEntry(){
 const started=useRef(false);const[error,setError]=useState("");
 useEffect(()=>{if(started.current)return;started.current=true;void fetch("/api/experience/start",{method:"POST"}).then(async response=>{const body=await response.json();if(!response.ok)throw new Error(body.message||"暂时无法进入体验。");window.location.replace("/dashboard");}).catch(cause=>setError(cause.message));},[]);
 return <main className="mx-auto max-w-lg px-6 py-24"><h1 className="text-2xl font-semibold">鑫世界体验版</h1><p role="status" className="mt-4">{error || "正在进入体验空间…"}</p>{error?<a className="mt-4 inline-block" href="/login?manual=1">使用体验账号登录</a>:null}<p className="mt-8 text-sm text-gray-500">此版本共用体验空间，请勿上传私人或敏感资料。</p></main>;
}
