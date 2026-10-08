"use client";
import { useEffect, useState } from "react";
import { Folder, FolderOpen, Copy, HardDrive, RotateCcw } from "lucide-react";
type StorageInfo = { nativePicker?: boolean; external?: boolean; enabled: boolean; path: string; directory: string; directories: string[]; allowedPath: string; availableBytes: number; assetCount: number; assetBytes: number };
const size = (bytes: number) => bytes >= 1024 ** 3 ? `${(bytes / 1024 ** 3).toFixed(1)} GB` : `${(bytes / 1024 ** 2).toFixed(1)} MB`;
export function LocalStorageSettings() {
  const [info, setInfo] = useState<StorageInfo | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [picked, setPicked] = useState<{ selectedPath: string; selectionToken: string } | null>(null);
  const [directory, setDirectory] = useState("");
  async function load() {
    const response = await fetch("/api/settings/storage");
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || "无法读取本机存储状态。");
    setInfo(result); setDirectory(result.directory || "files");
  }
  useEffect(() => { load().catch(() => setError("无法读取本机存储，请刷新后重试。")); }, []);
  async function act(action: "probe" | "relocate" | "reset" | "relocateSelected") {
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/settings/storage", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, ...(action === "relocate" ? { directory } : {}), ...(action === "relocateSelected" && picked ? { selectionToken: picked.selectionToken } : {}) }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "操作未完成，原位置未改变。");
      setMessage(result.message); setPicked(null); setEditing(false); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "本机存储操作失败，请重试。"); }
    finally { setBusy(false); }
  }
  async function chooseDirectory() {
    if (!info?.nativePicker) { setEditing(!editing); setError(""); return; }
    setBusy(true); setError(""); setMessage("请在系统窗口中选择文件夹…");
    try { const response = await fetch("/api/settings/storage", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "pick" }) }); const result = await response.json(); if (!response.ok) throw new Error(result.message || "目录选择失败"); if (result.cancelled) setMessage("已取消选择，保存位置未改变。"); else { setPicked(result); setMessage(""); } }
    catch (cause) { setMessage(""); setError(cause instanceof Error ? cause.message : "目录选择失败"); }
    finally { setBusy(false); }
  }
  return <div aria-busy={busy}>
    {error ? <p role="alert" className="mb-4 text-sm text-[var(--danger)]">{error}</p> : null}
    {!info && !error ? <p className="settings-footnote">正在读取本机存储…</p> : null}
    {info?.enabled === false ? <p className="settings-footnote">当前运行环境尚未启用本机文件存储，请联系管理员完成本机运行配置。</p> : null}
    {info?.enabled ? <>
      <section className="settings-preferences"><div><div><h2>资料与媒体保存位置</h2><p>上传的文档、图片、音频和视频保存在运行应用的这台电脑上。</p></div><button className="settings-small-action" disabled={busy} onClick={() => void chooseDirectory()}><FolderOpen size={14} className="inline mr-1.5"/>更改位置</button></div></section>
      <div className="settings-storage-path"><Folder size={15}/><code>{info.path}</code><button type="button" aria-label="复制保存路径" title="复制保存路径" onClick={() => { navigator.clipboard.writeText(info.path).then(() => setMessage("保存路径已复制，可粘贴到文件资源管理器打开。")).catch(() => setError("复制失败，请选中路径后手动复制。")); }}><Copy size={14}/></button></div>
      {picked ? <section className="settings-folder-choice"><h3>确认新的保存位置</h3><p>{picked.selectedPath}</p><p className="settings-footnote">会在所选文件夹内创建当前公司的“鑫世界资料”子目录。复制并校验现有文件后才切换，旧文件保留。</p><footer><button className="settings-small-action" disabled={busy} onClick={() => void act("relocateSelected")}>确认迁移</button><button className="settings-small-action" disabled={busy} onClick={() => setPicked(null)}>取消</button></footer></section> : null}
      {editing ? <form className="settings-folder-choice" onSubmit={event => { event.preventDefault(); void act("relocate"); }}>
        <label>选择现有目录<select value={directory} onChange={event => setDirectory(event.target.value)} disabled={busy}><option value="">新建目录…</option>{info.directories.map(name => <option key={name} value={name}>{name === "files" ? "files（默认）" : name}</option>)}</select></label>
        <label className="mt-3">目录名称<input aria-label="新的存储目录名称" value={directory} onChange={event => setDirectory(event.target.value)} required maxLength={60} disabled={busy} className="rounded-lg border px-3" placeholder="例如：项目资料"/></label>
        <p className="settings-footnote" style={{marginTop:12}}>可选范围：{info.allowedPath}。将复制并校验现有文件后切换，旧目录保留；切换期间暂停文件写入。</p>
        <footer><button type="submit" className="settings-small-action" disabled={busy}>{busy ? "正在校验与切换…" : "确认更改"}</button><button type="button" className="settings-small-action" disabled={busy} onClick={() => setEditing(false)}>取消</button></footer>
      </form> : null}
      <section className="settings-preferences"><div><div><h2>检查本机读写</h2><p>写入并读取临时文件，确认目录可以正常使用。</p></div><button className="settings-small-action" disabled={busy} onClick={() => void act("probe")}>{busy ? "处理中…" : "检查读写"}</button></div><div><div><h2>默认保存位置</h2><p>恢复默认目录，同样会校验并保留现有文件。</p></div><button className="settings-small-action" disabled={busy || !info.external && info.directory === "files"} onClick={() => void act("reset")}><RotateCcw size={13} className="inline mr-1"/>恢复默认</button></div></section>
      {message ? <p role="status">{message}</p> : null}
      <section className="settings-storage-details"><h2 className="mb-4 flex items-center gap-2"><HardDrive size={15}/>存储概况</h2><dl><dt>当前公司已保存文件</dt><dd>{info.assetCount} 个 · {size(info.assetBytes)}</dd><dt>所在磁盘可用空间</dt><dd>{size(info.availableBytes)}</dd><dt>账号、项目与对话</dt><dd>本机数据库</dd></dl><p className="settings-footnote" style={{marginTop:18}}>这里更改的是文件目录，不会移动数据库或应用安装位置。每个公司的文件目录独立；浏览器访问远程部署时，“本机”指运行应用的电脑。</p></section>
    </> : null}
  </div>;
}
