import "server-only";
import path from "node:path";
import { NewsStore } from "./store";
import { NewsSync } from "./sync";
import { createPublicNewsTransport } from "./transport";
type Runtime = { store: NewsStore; sync: NewsSync; timer?: NodeJS.Timeout };
const globalNews = globalThis as typeof globalThis & { __xinPublicNews?: Runtime };
export function newsRuntime() {
  if (!globalNews.__xinPublicNews) {
    const profile = process.env.LOCAL_RELEASE_PROFILE;
    if (!process.env.AIHOT_NEWS_CACHE_ROOT && profile !== "daily" && profile !== "review") throw Error("NEWS_CACHE_CONFIGURATION_REQUIRED");
    const root = process.env.AIHOT_NEWS_CACHE_ROOT || path.resolve(process.cwd(), "../../output/research-news-private", profile || "review");
    const store = new NewsStore(root);
    globalNews.__xinPublicNews = { store, sync: new NewsSync(store, createPublicNewsTransport(process.env.AIHOT_PUBLIC_NEWS_ENABLED === "true")) };
  }
  return globalNews.__xinPublicNews;
}
export function startNewsScheduler() {
  if (process.env.AIHOT_PUBLIC_NEWS_ENABLED !== "true") return;
  const runtime = newsRuntime();
  if (runtime.timer) return;
  const tick = () => { void runtime.sync.run().catch(() => undefined); };
  tick(); // Resume after sleep/restart once; persisted due time prevents catch-up bursts.
  runtime.timer = setInterval(tick, 60000); runtime.timer.unref();
}
