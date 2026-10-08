import type { PublishSnapshot } from "./schemas";

export type PublishPackageSection = { key: string; label: string; content: string };

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())) : [];
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function jsonText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) return value.map((item) => typeof item === "string" ? item : JSON.stringify(item)).join("\n");
  if (typeof value === "object") return JSON.stringify(value, null, 2);
  return String(value);
}

function section(key: string, label: string, content: string | null | undefined): PublishPackageSection | null {
  const normalized = content?.trim();
  return normalized ? { key, label, content: normalized } : null;
}

export function buildPublishPackage(snapshot: PublishSnapshot) {
  const metadata = object(snapshot.metadata);
  const mediaPlan = object(snapshot.mediaPlan);
  const hashtags = snapshot.hashtags.map((tag) => tag.trim()).filter(Boolean).map((tag) => tag.startsWith("#") ? tag : `#${tag}`).join(" ");
  let sections: Array<PublishPackageSection | null>;

  switch (snapshot.platform) {
    case "DOUYIN":
      sections = [
        section("title", "标题", snapshot.title),
        section("hook", "开场 Hook", snapshot.hook),
        section("script", "口播脚本", snapshot.body),
        section("hashtags", "Hashtags", hashtags),
        section("duration", "时长建议", text(metadata.duration) || text(mediaPlan.duration)),
        section("shots", "拍摄建议", jsonText(mediaPlan.shots ?? mediaPlan)),
      ];
      break;
    case "XIAOHONGSHU":
      sections = [
        section("title", "标题", snapshot.title),
        section("body", "正文", snapshot.body),
        section("hashtags", "Hashtags", hashtags),
        section("coverTitles", "封面标题候选", strings(metadata.coverTitles ?? metadata.titles).join("\n")),
        section("images", "配图建议", jsonText(mediaPlan.images ?? mediaPlan)),
      ];
      break;
    case "WECHAT_MOMENTS":
      sections = [section("body", "朋友圈成稿", snapshot.body), section("metadata", "版本信息", jsonText(metadata))];
      break;
    case "WECHAT_CHANNELS":
      sections = [
        section("title", "标题", snapshot.title),
        section("hook", "开场 Hook", snapshot.hook),
        section("script", "视频脚本", snapshot.body),
        section("summary", "视频简介", snapshot.summary),
        section("hashtags", "Hashtags", hashtags),
      ];
      break;
    case "WECHAT_OFFICIAL":
      sections = [
        section("title", "标题", snapshot.title),
        section("summary", "摘要", snapshot.summary),
        section("body", "正文", snapshot.body),
        section("outline", "文章大纲", jsonText(metadata.outline)),
      ];
      break;
  }

  const present = sections.filter((item): item is PublishPackageSection => Boolean(item));
  return {
    platform: snapshot.platform,
    snapshot,
    sections: present,
    fullText: present.map(({ label, content }) => `${label}\n${content}`).join("\n\n"),
  };
}
