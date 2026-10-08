import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { NewsItem, DailyIndex, DailyReport } from "./contracts";
export type NewsState = {
  version: 1; items: Record<string, NewsItem>; removed: string[]; cursor: string | null;
  dailies: DailyIndex; reports: Record<string, DailyReport>;
  etags: Record<string, string>; lastSuccess: string | null; lastAttempt: string | null;
  nextAttempt: number; failures: number; error: string | null;
};
export const emptyNewsState = (): NewsState => ({ version: 1, items: {}, removed: [], cursor: null, dailies: [], reports: {}, etags: {}, lastSuccess: null, lastAttempt: null, nextAttempt: 0, failures: 0, error: null });
export class NewsStore {
  constructor(readonly root: string) { if (!path.isAbsolute(root)) throw Error("NEWS_CACHE_ROOT_MUST_BE_ABSOLUTE"); }
  async read(): Promise<NewsState> {
    try { const stat = await fs.stat(path.join(this.root, "state.json")); if (stat.size > 32 * 1024 * 1024) throw Error("NEWS_CACHE_LIMIT");
      const state = JSON.parse(await fs.readFile(path.join(this.root, "state.json"), "utf8")) as NewsState;
      if (state.version !== 1 || !state.items || !Array.isArray(state.dailies)) throw Error("NEWS_CACHE_INVALID");
      return state;
    } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return emptyNewsState(); throw error; }
  }
  private async atomic(name: string, value: unknown) {
    await fs.mkdir(this.root, { recursive: true }); const data = JSON.stringify(value);
    if (Buffer.byteLength(data) > 32 * 1024 * 1024) throw Error("NEWS_CACHE_LIMIT");
    const temporary = path.join(this.root, name + "." + randomUUID() + ".tmp");
    try { await fs.writeFile(temporary, data, { flag: "wx", mode: 0o600 }); await fs.rename(temporary, path.join(this.root, name)); }
    finally { await fs.unlink(temporary).catch(() => undefined); }
  }
  write(state: NewsState) { return this.atomic("state.json", state); }
  async paused() {
    try { return JSON.parse(await fs.readFile(path.join(this.root, "control.json"), "utf8")).paused === true; }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return false; throw error; }
  }
  setPaused(paused: boolean) { return this.atomic("control.json", { paused }); }
  async lock(): Promise<(() => Promise<void>) | null> {
    await fs.mkdir(this.root, { recursive: true }); const file = path.join(this.root, "sync.lock"); const nonce = randomUUID();
    for (let attempt = 0; attempt < 2; attempt++) {
      try { const handle = await fs.open(file, "wx", 0o600); await handle.writeFile(JSON.stringify({ pid: process.pid, nonce })); await handle.close();
        return async () => { try { const current = JSON.parse(await fs.readFile(file, "utf8")); if (current.nonce === nonce) await fs.unlink(file); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; } };
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        try { const owner = JSON.parse(await fs.readFile(file, "utf8")); if (!Number.isInteger(owner.pid) || owner.pid < 1) return null;
          try { process.kill(owner.pid, 0); return null; } catch (probe) { if ((probe as NodeJS.ErrnoException).code !== "ESRCH") return null; }
          const current = JSON.parse(await fs.readFile(file, "utf8")); if (current.nonce === owner.nonce) await fs.unlink(file);
        } catch { return null; }
      }
    }
    return null;
  }
}
