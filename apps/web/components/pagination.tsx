"use client";
import "./pagination.css";
export function Pagination({ page, pages, total, label, onChange, disabled = false }: { page: number; pages: number; total?: number; label: string; onChange: (page: number) => void; disabled?: boolean }) {
  if (pages <= 1) return null;
  return <nav className="content-pagination" aria-label={label}>
    <span aria-live="polite">{total !== undefined ? `共 ${total} 条 · ` : ""}第 {page} / {pages} 页</span>
    <button type="button" disabled={disabled || page <= 1} onClick={() => onChange(page - 1)}>上一页</button>
    <button type="button" disabled={disabled || page >= pages} onClick={() => onChange(page + 1)}>下一页</button>
  </nav>;
}
