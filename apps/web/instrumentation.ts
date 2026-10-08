export async function register() {
  if(process.env.NEXT_RUNTIME === "nodejs" && process.env.NEXT_PHASE !== "phase-production-build") {
    const {startFeishuScheduler} = await import("./server/feishu/runtime");
    startFeishuScheduler();
  }
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.AIHOT_PUBLIC_NEWS_ENABLED === "true") {
    const { startNewsScheduler } = await import("./server/research/news/runtime");
    startNewsScheduler();
  }
  if (process.env.NEXT_RUNTIME === "nodejs" && (process.env.WORKER_MODE === "embedded" || process.env.FREE_WORKER_MODE === "true")) {
    const { startEmbeddedWorker } = await import("./server/embedded-worker");
    await startEmbeddedWorker();
  }
}
