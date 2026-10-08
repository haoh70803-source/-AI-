import type { DossierWork } from "./benchmark-dossier-math";
import { median } from "./benchmark-dossier-math";

export type WorkRecommendation = { workId: string; title: string; readable: boolean; reason: string; priority: number };

/** Rank the whole available library; the display may fold it, but research has no quota. */
export function recommendWorkResearch(works: DossierWork[]): WorkRecommendation[] {
  const pending = works.filter(work => !work.deepResearched);
  if (!pending.length) return [];
  const studiedTopics = new Set(works.filter(work => work.deepResearched && work.topic).map(work => work.topic));
  const metric: "views" | "likes" = works.filter(work => work.views !== null).length >= works.filter(work => work.counts.likes !== null).length ? "views" : "likes";
  const value = (work: DossierWork) => metric === "views" ? work.views : work.counts.likes;
  const values = works.flatMap(work => value(work) === null ? [] : [value(work)!]);
  const baseline = median(values);
  const available = pending.filter(work => work.readable);
  const high = [...available].filter(work => value(work) !== null && baseline !== null && value(work)! > baseline)
    .sort((a, b) => value(b)! - value(a)!)[0];
  const typical = [...available].filter(work => value(work) !== null && baseline !== null && value(work)! <= baseline)
    .sort((a, b) => Math.abs(value(a)! - baseline!) - Math.abs(value(b)! - baseline!))[0];
  const latest = [...available].filter(work => work.publishedAt).sort((a, b) => b.publishedAt!.localeCompare(a.publishedAt!))[0];
  const firstTopic = new Set<string>();
  return pending.map(work => {
    const reasons: string[] = []; let priority = work.readable ? 20 : 0;
    if (work.id === high?.id) { reasons.push("当前样本的高表现代表，适合核对它实际用了什么方法"); priority += 8; }
    if (work.id === typical?.id && work.id !== high?.id) { reasons.push("普通表现对照，帮助寻找反例"); priority += 7; }
    if (work.id === latest?.id) { reasons.push("近期作品，可检查表达是否变化"); priority += 6; }
    if (work.topic && !studiedTopics.has(work.topic) && !firstTopic.has(work.topic)) {
      reasons.push(`尚未深拆的内容方向：${work.topic}`); priority += 5; firstTopic.add(work.topic);
    }
    if (work.readable && !reasons.length) { reasons.push(work.researchStatus === "CURRENT" ? "已有快速理解和正文，可继续看内容决策" : "已保存正文，可以直接深拆"); priority += 2; }
    if (!work.readable) reasons.push(work.sourceItemId ? "先在资料页取得可读正文，再研究结构" : "先收录原作品，再取得可读正文");
    return { workId: work.id, title: work.title, readable: work.readable, reason: reasons.join("；"), priority };
  }).sort((a, b) => b.priority - a.priority || a.title.localeCompare(b.title));
}
