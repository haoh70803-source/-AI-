import { db } from '@content-center/db';
import { syncFeishu } from './service';
import { feishuExternalCallsAllowed, feishuWikiSyncEnabled } from '@content-center/integrations';
const globalState = globalThis as typeof globalThis & {
    feishuTimer?: ReturnType<typeof setInterval>;
    feishuRunning?: boolean;
};
export function startFeishuScheduler() {
    if (!feishuExternalCallsAllowed()) return;
    if (globalState.feishuTimer)
        return;
    async function tick() { if (!feishuExternalCallsAllowed() || globalState.feishuRunning)
        return; globalState.feishuRunning = true; try {
        const connections = await db.feishuConnection.findMany({ where: { enabled: true, workspace: { disabledAt: null }, ...(feishuWikiSyncEnabled() ? { OR: [{ autoSync: true }, { subscriptions: { some: { state: 'ACTIVE', syncRequestedAt: { not: null } } } }] } : { autoSync: true }) }, select: { workspaceId: true }, take: 100 });
        for (const c of connections) {
            try {
                await syncFeishu(c.workspaceId);
            }
            catch {
                console.error('FEISHU_SCHEDULED_SYNC_FAILED');
            }
        }
    }
    catch {
        console.error('FEISHU_SCHEDULER_UNAVAILABLE');
    }
    finally {
        globalState.feishuRunning = false;
    } }
    globalState.feishuTimer = setInterval(() => void tick(), 30000);
    globalState.feishuTimer.unref();
}
