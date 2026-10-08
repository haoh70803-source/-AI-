import type { BenchmarkCreatorDetailDTO } from "./benchmark-creator-read-model";

export const profileSectionLabels: Record<string, string> = {
  PROFILE: "账号定位", CONTENT_MIX: "内容方向", TOPIC_STYLE: "选题规律", CONTENT_STYLE: "表达与信任",
  RECURRING_VIEWPOINT: "反复表达的观点", LEARN: "可以迁移的方法", AVOID: "不要照搬的部分",
  POSITIONING: "账号定位", AUDIENCE: "内容面向的受众", THEME: "高频主题", TOPIC_PATTERN: "选题特点",
  VIDEO_STYLE: "内容形式", EVIDENCE_STYLE: "说服方式", ATTENTION_TRUST: "关注与信任", METHOD_TENDENCY: "方法倾向",
};

export function buildBenchmarkReport(profile: BenchmarkCreatorDetailDTO) {
  const result = profile.creatorProfile;
  const lines = [`# ${profile.account.name} · 对标研究`, "", `账号 ID：${profile.account.id}`, `平台：${profile.account.platform}`,
    result ? `画像版本：${result.version} · ${result.createdAt} · 研究 ID：${result.studyId}` : "尚未生成账号画像。", "",
    "> 本报告只描述已选内容，不代表账号全部历史。外部创作者的经历、成果及观点不能作为我们的亲历事实。互动数据不等于因果证明，缺失数据不补造。", ""];
  if (result) {
    lines.push(result.message, "");
    for (const section of result.sections) {
      lines.push(`## ${profileSectionLabels[section.code] ?? section.code}`, "", section.text, "",
        `判断范围：${section.status === "CLEAR" ? "样本内较明确" : "仍需观察"}`, "",
        ...section.sources.map((source) => `- 依据：${source.title} — /library/${source.id}`), "");
    }
  }
  if (profile.accountResearch) for (const group of profile.accountResearch.groups) {
    lines.push(`## ${group.title}`, "");
    for (const item of group.items) lines.push(`### ${item.name}`, item.summary, ...item.sources.map((source) => `- 依据：${source.title} — /library/${source.id}`), "");
  }
  if (profile.performance) {
    const labels = { likes: "点赞", comments: "评论", favorites: "收藏", shares: "分享" };
    lines.push("## 已发现作品表现（导出时快照，非画像版本的输入）", "", `覆盖 ${profile.performance.count} 条作品，不代表账号全量历史。`, "");
    for (const total of profile.performance.totals) lines.push(`- ${labels[total.metric]}合计：${total.value ?? "未知"}；有数据 ${total.covered}/${profile.performance.count} 条。`);
    lines.push("", "### 按点赞排序的高表现作品", "");
    for (const item of [...profile.performance.items].filter((item) => item.counts.likes !== null).sort((a, b) => b.counts.likes! - a.counts.likes! || a.id.localeCompare(b.id)).slice(0, 10)) {
      lines.push(`- ${item.title} · 点赞 ${item.counts.likes} · 采集于 ${item.observedAt} · ${item.url}`);
    }
    lines.push("");
  }
  lines.push("## 创作迁移检查", "", "- 选择适合自己目标和受众的方法，而不是模仿人设。", "- 替换为自己的事实、案例和素材；保留外部来源。", "- 用自己的作品验证效果，不承诺复刻流量或变现。", "");
  if (profile.topicDistribution?.length) {
    const count = profile.topicDistribution.reduce((sum, item) => sum + item.count, 0);
    lines.push("## 选题分布（当前画像代表样本）", "");
    for (const item of profile.topicDistribution) lines.push(`- ${item.topic}：${item.count}/${count} 条`, ...item.sources.map((source) => `  - ${source.title} — /library/${source.id}`));
    lines.push("");
  }
  if (profile.copywriting.length) {
    lines.push("## 作品文案拆解", "");
    for (const item of profile.copywriting) lines.push(`### ${item.sourceTitle}`, `核心主张：${item.core}`, `开头：${item.opening}`, `正文推进：${item.progression.join(" → ")}`, `可借鉴：${item.reusable.join("；")}`, `不要照搬：${item.avoid.join("；")}`, `原文与依据：/library/${item.sourceItemId}`, "");
  }
  return lines.join("\n");
}
