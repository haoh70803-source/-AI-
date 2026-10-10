import { BookOpen, Compass, Files, History, Newspaper, ScanText, TrendingUp } from "lucide-react";

// Both navigation surfaces use these labels, destinations and route boundaries.
export const researchNavigation = [
  { label: "开始研究", href: "/research/new", icon: Compass, group: "分析与理解", sidebar: true, relatedPaths: ["/research/session", "/research/focus"] },
  { label: "作品拆解", href: "/research/teardown", icon: ScanText, group: "分析与理解", sidebar: true },
  { label: "老师 / 对标", href: "/research/benchmarks", icon: BookOpen, group: "分析与理解", sidebar: true },
  { label: "热点趋势", href: "/research/trends", icon: TrendingUp, group: "发现与收集", sidebar: true },
  { label: "资讯日刊", href: "/research", icon: Newspaper, group: "发现与收集", sidebar: true },
  { label: "研究记录", href: "/research/results", icon: History, group: "留存与应用", sidebar: true },
  { label: "已保存来源", href: "/research/sources", icon: Files, group: "发现与收集", sidebar: false },
  { label: "对标新作", href: "/research/works", icon: BookOpen, group: "发现与收集", sidebar: false },
] as const;

export const researchNavigationGroups = ["发现与收集", "分析与理解", "留存与应用"] as const;
export const researchSidebarItems = researchNavigation.filter(item => item.sidebar);

function matchesPath(pathname: string, href: string) {
  return pathname === href || (href !== "/research" && pathname.startsWith(href + "/"));
}

export function isResearchNavigationActive(pathname: string, href: string) {
  const item = researchNavigation.find(item => item.href === href);
  return Boolean(item && (matchesPath(pathname, item.href) ||
    ("relatedPaths" in item && item.relatedPaths.some(path => matchesPath(pathname, path)))));
}

export function isResearchPath(pathname: string) {
  return matchesPath(pathname, "/research") || pathname.startsWith("/research/");
}
