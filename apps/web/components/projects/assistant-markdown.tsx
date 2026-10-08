"use client";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { AssistantMessageDTO } from "@/lib/contracts/assistant";

type MarkdownNode = { type: string; value?: string; url?: string; children?: MarkdownNode[] };
export function AssistantMarkdown({ message }: { message: AssistantMessageDTO }) {
  const citations = () => (tree: MarkdownNode) => {
    function visit(node: MarkdownNode) {
      if (!node.children || ["link", "code", "inlineCode"].includes(node.type)) return;
      node.children = node.children.flatMap(child => {
        if (child.type !== "text" || !child.value) { visit(child); return [child]; }
        return child.value.split(/(\[\d+\])/g).filter(Boolean).map(value => {
          const number = /^\[(\d+)\]$/.exec(value)?.[1];
          return number && message.sources.some(s => s.citation === Number(number)) ? { type: "link", url: `#source-${message.id}-${number}`, children: [{ type: "text", value }] } : { type: "text", value };
        });
      });
    }
    visit(tree);
  };
  return <div className="assistant-markdown"><ReactMarkdown remarkPlugins={[remarkGfm, citations]} components={{
    a: ({ href, children }) => <a href={href} onClick={() => { if (href?.startsWith(`#source-${message.id}-`)) document.getElementById(`sources-${message.id}`)?.setAttribute("open", ""); }} rel="noreferrer">{children}</a>,
    img: ({ alt }) => <span>{alt || "图片引用"}</span>,
  }}>{message.content || "正在整理结果…"}</ReactMarkdown></div>;
}
