"use client";
import { useEffect, useRef, useState } from "react";
type Observation = { id: string; observedAt: Date; rank: number | null };

/** Shows only saved observations. Missing ranks leave a gap; no interpolation. */
export function TrendHistoryChart({ snapshots }: { snapshots: Observation[] }) {
  const container = useRef<SVGSVGElement>(null);
  const [width, setWidth] = useState(900);
  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const observer = new ResizeObserver(entries => setWidth(Math.max(260, entries[0]!.contentRect.width)));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const points = [...snapshots].sort((a, b) => a.observedAt.getTime() - b.observedAt.getTime());
  const known = points.flatMap(point => point.rank === null ? [] : [point.rank]);
  if (!known.length) return <div className="research-empty-chart">这些快照没有排名数据。仍可在下方查看已保存的原始记录。</div>;
  const best = Math.min(...known); const worst = Math.max(...known);
  const range = worst - best || 1;
  const first = points[0]!.observedAt.getTime(); const last = points.at(-1)!.observedAt.getTime();
  const x = (time: Date) => first === last ? width / 2 : 45 + (time.getTime() - first) / (last - first) * (width - 70);
  const y = (rank: number) => best === worst ? 120 : 35 + (rank - best) / range * 165;
  const date = (time: Date) => time.toLocaleDateString("zh-CN", { timeZone: "Asia/Shanghai", month: "short", day: "numeric" });
  return <svg ref={container} viewBox={`0 0 ${width} 255`} role="img" aria-label={`保存的排名变化，${points.length} 次观察，已知排名 ${best} 至 ${worst}；排名越小越靠前，缺失不连接`}>
    <text x="5" y="16">排名</text>
    {[...new Set([best, Math.round((best + worst) / 2), worst])].map(rank => <g key={rank}><line x1="45" y1={y(rank)} x2={width - 25} y2={y(rank)} stroke="var(--research-line)" strokeDasharray="3 5" /><text x="30" y={y(rank) + 4} textAnchor="end">{rank}</text></g>)}
    {points.map((point, index) => {
      if (point.rank === null) return null;
      const previous = points[index - 1];
      return <g key={point.id}>
        {previous && previous.rank !== null ? <line x1={x(previous.observedAt)} y1={y(previous.rank)} x2={x(point.observedAt)} y2={y(point.rank)} stroke="var(--research-accent)" strokeWidth="2" /> : null}
        <circle cx={x(point.observedAt)} cy={y(point.rank)} r="4"><title>{`${point.observedAt.toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })} · 排名 ${point.rank}`}</title></circle>
      </g>;
    })}
    <text x="45" y="239">{date(points[0]!.observedAt)}</text><text x={width - 25} y="239" textAnchor="end">{date(points.at(-1)!.observedAt)}</text>
  </svg>;
}
