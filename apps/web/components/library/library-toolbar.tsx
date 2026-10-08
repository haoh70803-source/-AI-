"use client";

import { Grid2X2, List, Search, X } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

export function LibraryToolbar({ count }: { count: number }) {
  const router = useRouter();
  const params = useSearchParams();
  const [query, setQuery] = useState(params.get("search") || "");
  const [pending, startTransition] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const composing = useRef(false);
  const current = params.toString();
  useEffect(() => { setQuery(params.get("search") || ""); }, [params]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  function update(key: string, value: string) {
    if (timer.current) clearTimeout(timer.current);
    const next = new URLSearchParams(current);
    if (value) next.set(key, value); else next.delete(key);
    next.delete("page");
    startTransition(() => router.replace(`/library?${next}`, { scroll: false }));
  }
  return <div className="asset-library-toolbar" aria-busy={pending}>
    <span>{pending ? "正在查找…" : `${count} 条资料`}</span>
    <div>
      <form onSubmit={(event) => { event.preventDefault(); update("search", query.trim()); }} role="search">
        <Search size={15} /><input aria-label="搜索资料" placeholder="搜索资料" value={query} onCompositionStart={() => { composing.current = true; if (timer.current) clearTimeout(timer.current); }} onCompositionEnd={(event) => { composing.current = false; update("search", event.currentTarget.value.trim()); }} onChange={(event) => { const value = event.target.value; setQuery(value); if (timer.current) clearTimeout(timer.current); if (!composing.current) timer.current = setTimeout(() => update("search", value.trim()), 350); }} />
        {query ? <button type="button" aria-label="清除搜索" onClick={() => { setQuery(""); update("search", ""); }}><X size={14} /></button> : null}
      </form>
      <select aria-label="资料排序" value={params.get("sort") || "newest"} onChange={(event) => update("sort", event.target.value)}><option value="newest">最近加入</option><option value="oldest">最早加入</option><option value="title">名称排序</option></select>
      <div className="asset-layout-switch" aria-label="布局方式"><button type="button" aria-label="网格视图" aria-pressed={params.get("layout") !== "LIST"} onClick={() => update("layout", "GRID")}><Grid2X2 size={15} /></button><button type="button" aria-label="列表视图" aria-pressed={params.get("layout") === "LIST"} onClick={() => update("layout", "LIST")}><List size={16} /></button></div>
    </div>
  </div>;
}
