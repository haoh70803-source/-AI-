"use client";
import { useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { paginateContent, pageWindow } from "@/lib/content-pagination";
import { Pagination } from "./pagination";
export function PaginatedContent({ content, plain = false }: { content: string; plain?: boolean }) {
  const pages = useMemo(() => paginateContent(content), [content]);
  const [position, setPosition] = useState({ content, page: 1 });
  const current = pageWindow(pages.length, position.content === content ? position.page : 1, 1);
  const ref = useRef<HTMLDivElement>(null);
  function change(page: number) { setPosition({ content, page }); ref.current?.scrollIntoView({ block: "nearest" }); ref.current?.focus({ preventScroll: true }); }
  return <div ref={ref} tabIndex={-1} className="paginated-content">
    <Pagination label="正文分页" page={current.page} pages={current.pages} onChange={change}/>
    {plain ? <div className="paginated-plain-text">{pages[current.page - 1]}</div> : <article className="assistant-markdown" data-testid="generic-artifact-view"><ReactMarkdown remarkPlugins={[remarkGfm]} components={{ img: ({ alt }) => <span>{alt || "图片引用"}</span> }}>{pages[current.page - 1]}</ReactMarkdown></article>}
    <Pagination label="正文底部分页" page={current.page} pages={current.pages} onChange={change}/>
  </div>;
}
