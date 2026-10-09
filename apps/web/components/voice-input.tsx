"use client";

import { LoaderCircle, Mic, Square, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import "./voice-input.css";

export function VoiceInput({ disabled, onText, onBusyChange }: { disabled?: boolean; onText: (text: string) => void; onBusyChange?: (busy: boolean) => void }) {
  const [ready, setReady] = useState(false);
  const [phase, setPhase] = useState<"idle" | "starting" | "recording" | "recognizing">("idle");
  const [message, setMessage] = useState("");
  const [seconds, setSeconds] = useState(0);
  const session = useRef<{ cancelled: boolean; stream?: MediaStream; recorder?: MediaRecorder; abort: AbortController; timer?: ReturnType<typeof setInterval> } | null>(null);
  const callbacks = useRef({ onText, onBusyChange });
  callbacks.current = { onText, onBusyChange };
  function release() { const current = session.current; if (!current) return; clearInterval(current.timer); current.stream?.getTracks().forEach(track => track.stop()); }
  function cancel() {
    if (session.current) { session.current.cancelled = true; session.current.abort.abort(); if (session.current.recorder?.state === "recording") session.current.recorder.stop(); }
    release(); session.current = null; setPhase("idle"); callbacks.current.onBusyChange?.(false);
  }
  useEffect(() => {
    setReady(true);
    return () => {
    const current = session.current;
    if (current) { current.cancelled = true; current.abort.abort(); clearInterval(current.timer); current.stream?.getTracks().forEach(track => track.stop()); if (current.recorder?.state === "recording") current.recorder.stop(); }
    callbacks.current.onBusyChange?.(false);
    };
  }, []);
  useEffect(() => { if (disabled && session.current) cancel(); }, [disabled]);
  async function start() {
    setMessage("");
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") { setMessage("当前环境无法录音，请使用支持麦克风的浏览器，并通过 HTTPS 或本机地址访问。"); return; }
    const current = { cancelled: false, abort: new AbortController() } as NonNullable<typeof session.current>;
    session.current = current; setPhase("starting"); callbacks.current.onBusyChange?.(true);
    try {
      const availability = await fetch("/api/voice-input", { signal: AbortSignal.any([current.abort.signal, AbortSignal.timeout(15_000)]) });
      const status = await availability.json();
      if (!availability.ok) throw new Error(status.message || "语音识别服务暂时不可用，请稍后重试。");
      if (current.cancelled) return;
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (current.cancelled) { stream.getTracks().forEach(track => track.stop()); return; }
      current.stream = stream;
      const mimeType = ["audio/webm;codecs=opus", "audio/ogg;codecs=opus", "audio/mp4"].find(type => MediaRecorder.isTypeSupported(type));
      if (!mimeType) throw new Error("当前浏览器不支持录音格式，请更换浏览器重试。");
      const recorder = new MediaRecorder(stream, { mimeType }); current.recorder = recorder;
      const chunks: Blob[] = []; let size = 0;
      recorder.ondataavailable = event => {
        if (!event.data.size || current.cancelled) return;
        size += event.data.size;
        if (size > 5 * 1024 * 1024) { cancel(); setMessage("录音超过 5MB，请缩短后重新录音。"); return; }
        chunks.push(event.data);
      };
      recorder.onerror = () => { cancel(); setMessage("录音中断，请检查麦克风后重试。"); };
      recorder.onstop = async () => {
        clearInterval(current.timer); current.stream?.getTracks().forEach(track => track.stop());
        if (current.cancelled) return;
        setPhase("recognizing");
        try {
          const audio = new Blob(chunks, { type: mimeType });
          if (!audio.size) throw new Error("录音为空，请重新录音。");
          const form = new FormData(); form.append("audio", audio, "voice");
          const response = await fetch("/api/voice-input", { method: "POST", body: form, signal: AbortSignal.any([current.abort.signal, AbortSignal.timeout(210_000)]) });
          const result = await response.json();
          if (!response.ok) throw new Error(result.message || "识别失败，请重新录音或重试。");
          if (typeof result.text !== "string" || !result.text.trim()) throw new Error("没有识别到人声，请重新录音。");
          if (!current.cancelled) { callbacks.current.onText(result.text.trim()); setMessage("已加入输入框，可修改后发送。"); }
        } catch (error) {
          if (!current.cancelled) setMessage(error instanceof Error && error.name === "TimeoutError" ? "语音识别超时，请重新录音或重试。" : error instanceof Error ? error.message : "识别失败，请重试。");
        } finally { if (session.current === current) { session.current = null; setPhase("idle"); callbacks.current.onBusyChange?.(false); } }
      };
      recorder.start(1000); setPhase("recording"); setSeconds(0);
      let elapsed = 0;
      current.timer = setInterval(() => { elapsed++; setSeconds(elapsed); if (elapsed >= 60 && recorder.state === "recording") recorder.stop(); }, 1000);
    } catch (error) {
      if (current.cancelled) return;
      release(); session.current = null; setPhase("idle"); callbacks.current.onBusyChange?.(false);
      setMessage(error instanceof Error && error.name === "NotAllowedError" ? "麦克风权限未开启，请允许访问后重试。" : error instanceof Error && error.name === "NotFoundError" ? "没有找到麦克风，请连接设备后重试。" : error instanceof Error ? error.message : "录音失败，请重试。");
    }
  }
  const label = phase === "recording" ? "停止录音并识别" : phase === "recognizing" ? "正在识别语音" : phase === "starting" ? "正在打开麦克风" : "语音输入";
  return <span className="voice-input">
    <button type="button" className="voice-input-button" aria-label={label} title={label} aria-pressed={phase === "recording"} disabled={!ready || disabled || phase === "starting" || phase === "recognizing"} onClick={() => phase === "recording" ? session.current?.recorder?.stop() : void start()}>{phase === "recording" ? <Square size={16} /> : phase === "idle" ? <Mic size={17} /> : <LoaderCircle size={17} className="voice-input-spinner" />}</button>
    {phase !== "idle" ? <><span className="voice-input-progress" role="status">{phase === "recording" ? `${seconds}/60 秒` : phase === "starting" ? "检查服务并等待麦克风授权" : "正在识别…"}</span><button type="button" aria-label="取消语音输入" title="取消语音输入" onClick={cancel}><X size={14} /></button></> : null}
    {message ? <span className="voice-input-message" role="status">{message}</span> : null}
  </span>;
}
