import type { SourceAdminDetails } from "@/server/material-detail/read-model";

export function MaterialAdminDetails({ details }: { details: SourceAdminDetails }) {
  return <details className="material-admin-details">
    <summary>处理详情（管理员）</summary>
    <div className="material-admin-details-body">
      <section><h3>当前状态</h3><dl><div><dt>资料</dt><dd>{details.processing.sourceStatus}</dd></div><div><dt>读取</dt><dd>{details.processing.ingestStatus || "未开始"}</dd></div><div><dt>文字稿</dt><dd>{details.processing.transcriptionStatus || "未开始"}</dd></div></dl></section>
      {details.jobs.length ? <section><h3>任务记录</h3><div className="material-admin-job-list">{details.jobs.map((job, index) => <article key={`${job.typeLabel}-${index}`}><strong>{job.typeLabel}</strong><span>{job.statusLabel} · {job.durationLabel}</span>{job.errorLabel ? <small>{job.errorLabel}</small> : null}</article>)}</div></section> : null}
      {details.assets.length ? <section><h3>保存资源</h3><div className="material-admin-job-list">{details.assets.map((asset, index) => <article key={`${asset.typeLabel}-${index}`}><strong>{asset.typeLabel}</strong><span>{asset.statusLabel}{asset.sizeLabel ? ` · ${asset.sizeLabel}` : ""}</span></article>)}</div></section> : null}
      {details.transcript ? <section><h3>文字稿处理</h3><p>{details.transcript.methodLabel}{details.transcript.metadataSummary ? ` · ${details.transcript.metadataSummary}` : ""}</p></section> : null}
    </div>
  </details>;
}
