import { snapshotSchema, changesSchema, dailyIndexSchema, dailySchema } from "./contracts";
import { NewsStore, type NewsState } from "./store";
import { NewsTransportError, type PublicNewsTransport, type PublicOperation } from "./transport";
const HOUR = 60 * 60 * 1000;
export class NewsSync {
  private pending: Promise<NewsState> | null = null;
  private lastRequestAt = 0;
  constructor(readonly store: NewsStore, private transport: PublicNewsTransport, private now: () => number = Date.now) {}
  run() {
    if (this.pending) return this.pending;
    this.pending = this.perform().finally(() => { this.pending = null; });
    return this.pending;
  }
  private async get(operation: PublicOperation, query: Record<string, string> = {}, date?: string, etag?: string) {
    const wait = Math.max(0, 1100 - (Date.now() - this.lastRequestAt));
    if (wait) await new Promise(resolve => setTimeout(resolve, wait));
    this.lastRequestAt = Date.now();
    const response = await this.transport(operation, query, date, etag);
    if (response.status === 200 || response.status === 304) return response;
    const now = this.now();
    if (response.status === 429) {
      const seconds = Number(response.retryAfter); const parsed = Date.parse(response.retryAfter || "");
      const retryAt = response.retryAfter && Number.isFinite(seconds) ? now + Math.max(60, seconds) * 1000 : Number.isFinite(parsed) ? Math.max(now + 60000, parsed) : now + HOUR;
      throw new NewsTransportError("RATE_LIMITED", 429, retryAt);
    }
    throw new NewsTransportError(response.status === 409 ? "SNAPSHOT_REQUIRED" : response.status === 404 ? "DAILY_NOT_FOUND" : "UPSTREAM_" + response.status, response.status);
  }
  private keep(item: NewsState["items"][string], existing: NewsState["items"]) {
    return !!existing[item.id] || Date.parse(item.publishedAt || item.discoveredAt) >= this.now() - 7 * 86400000;
  }
  private async bootstrap(state: NewsState) {
    const collected: NewsState["items"] = {}; const allIds = new Set<string>(); const pages = new Set<string>();
    let page: string | null = null, watermark: string | null = null, complete = false;
    for (let index = 0; index < 25; index++) {
      if (await this.store.paused()) throw new NewsTransportError("PAUSED");
      const response = await this.get("snapshot", { fields: "default", limit: "500", ...(page ? { page } : {}) });
      const data = snapshotSchema.parse(response.body);
      if (data.count !== data.items.length || (watermark && watermark !== data.cursor)) throw new NewsTransportError("SNAPSHOT_INCONSISTENT", 502);
      watermark = data.cursor;
      for (const item of data.items) { allIds.add(item.id); if (this.keep(item, state.items)) collected[item.id] = item; }
      if (!data.hasMore) { complete = true; break; }
      if (!data.nextPage || pages.has(data.nextPage)) throw new NewsTransportError("SNAPSHOT_PAGE_INVALID", 502);
      page = data.nextPage; pages.add(page);
    }
    if (!complete || !watermark) throw new NewsTransportError("SNAPSHOT_PAGE_LIMIT", 502);
    // Only a COMPLETE authoritative snapshot may remove missing content.
    state.removed = [...new Set([...state.removed, ...Object.keys(state.items).filter(id => !allIds.has(id))])].filter(id => !collected[id]);
    state.items = collected; state.cursor = watermark;
  }
  private async changes(state: NewsState) {
    if (!state.cursor) { await this.bootstrap(state); return; }
    let complete = false;
    for (let index = 0; index < 25; index++) {
      if (await this.store.paused()) throw new NewsTransportError("PAUSED");
      const response = await this.get("changes", { limit: "100", cursor: state.cursor! });
      const data = changesSchema.parse(response.body);
      if (data.count !== data.changes.length || (data.hasMore && data.cursor === state.cursor)) throw new NewsTransportError("CHANGES_INCONSISTENT", 502);
      for (const change of data.changes) {
        if (change.op === "remove") { delete state.items[change.id]; if (!state.removed.includes(change.id)) state.removed.push(change.id); }
        else { if (this.keep(change.item, state.items)) state.items[change.item.id] = change.item; state.removed = state.removed.filter(id => id !== change.item.id); }
      }
      state.cursor = data.cursor;
      if (!data.hasMore) { complete = true; break; }
    }
    if (!complete) throw new NewsTransportError("CHANGES_PAGE_LIMIT", 502);
  }
  private async dailyIndex(state: NewsState) {
    const response = await this.get("dailies", { limit: "180" }, undefined, state.etags.dailies);
    if (response.status === 200) {
      const data = dailyIndexSchema.parse(response.body);
      if (data.count !== data.items.length) throw new NewsTransportError("DAILY_INDEX_INCONSISTENT", 502);
      state.dailies = data.items;
      const dates = new Set(data.items.map(item => item.date));
      for (const date of Object.keys(state.reports)) if (!dates.has(date)) { delete state.reports[date]; delete state.etags["daily:" + date]; }
      if (response.etag) state.etags.dailies = response.etag; else delete state.etags.dailies;
    }
    const latest = state.dailies[0]?.date;
    // All previously read editions are revalidated to honor corrections/withdrawals.
    for (const date of [...new Set([...(latest ? [latest] : []), ...Object.keys(state.reports)])].slice(0, 180)) {
      if (await this.store.paused()) throw new NewsTransportError("PAUSED");
      try { await this.loadDaily(state, date); }
      catch (error) { if (error instanceof NewsTransportError && error.status === 404) { delete state.reports[date]; delete state.etags["daily:" + date]; } else throw error; }
    }
  }
  private async loadDaily(state: NewsState, date: string) {
    const response = await this.get("daily", {}, date, state.etags["daily:" + date]);
    if (response.status === 200) {
      const data = dailySchema.parse(response.body);
      if (data.report.date !== date || Date.parse(data.report.windowStart) >= Date.parse(data.report.windowEnd)) throw new NewsTransportError("DAILY_WINDOW_INVALID", 502);
      state.reports[date] = data.report;
      if (response.etag) state.etags["daily:" + date] = response.etag; else delete state.etags["daily:" + date];
    } else if (!state.reports[date]) throw new NewsTransportError("DAILY_CACHE_MISSING", 502);
  }
  async daily(date: string) {
    if (this.pending) await this.pending;
    const unlock = await this.store.lock();
    if (!unlock) throw new NewsTransportError("SYNC_BUSY", 409);
    try {
      const state = await this.store.read();
      if (!state.dailies.some(item => item.date === date)) throw new NewsTransportError("DAILY_NOT_FOUND", 404);
      if (state.reports[date]) return state.reports[date];
      if (await this.store.paused()) throw new NewsTransportError("PAUSED", 409);
      if (this.now() < state.nextAttempt && state.error) throw new NewsTransportError("UPSTREAM_COOLDOWN", 429, state.nextAttempt);
      await this.loadDaily(state, date); await this.store.write(state); return state.reports[date];
    } finally { await unlock(); }
  }
  private async perform() {
    const unlock = await this.store.lock();
    if (!unlock) return this.store.read();
    try {
      const original = await this.store.read(); const now = this.now();
      if (await this.store.paused() || now < original.nextAttempt) return original;
      let committed = original;
      const state = structuredClone(original); state.lastAttempt = new Date(now).toISOString();
      try {
        try { await this.changes(state); }
        catch (error) { if (error instanceof NewsTransportError && error.code === "SNAPSHOT_REQUIRED") await this.bootstrap(state); else throw error; }
        if (await this.store.paused()) return original;
        await this.store.write(state);
        committed = structuredClone(state);
        await this.dailyIndex(state);
        if (await this.store.paused()) return original;
        state.lastSuccess = new Date(this.now()).toISOString(); state.failures = 0; state.error = null; state.nextAttempt = this.now() + HOUR;
        await this.store.write(state); return state;
      } catch (error) {
        // Roll back an incomplete page/cursor batch. A completed news batch stays
        // committed even if daily revalidation fails, so known withdrawals apply.
        const original = committed;
        original.lastAttempt = state.lastAttempt;
        original.failures = Math.min(original.failures + 1, 10);
        original.error = error instanceof NewsTransportError ? error.code : "UPSTREAM_DATA_OR_CACHE_INVALID";
        original.nextAttempt = error instanceof NewsTransportError && error.retryAt ? error.retryAt : this.now() + Math.min(HOUR, 60000 * 2 ** (original.failures - 1));
        await this.store.write(original); return original;
      }
    } finally { await unlock(); }
  }
}
