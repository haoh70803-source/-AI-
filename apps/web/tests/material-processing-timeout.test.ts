import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { db } from '@content-center/db';
import { expireMaterialProcessing, executionLock, markDispatchPending } from '@content-center/worker/job-recovery';
const suffix = randomUUID(), userId = 'processing-timeout-' + suffix;
let workspaceId = '';
const now = new Date(), old = new Date(now.getTime() - 20 * 60_000);
beforeAll(async () => {
  await db.user.create({ data: { id: userId, name: 'timeout fixture', email: userId + '@example.test' } });
  workspaceId = (await db.workspace.create({ data: { name: 'timeout fixture', slug: suffix, members: { create: { userId, role: 'OWNER' } } } })).id;
});
afterAll(async () => { if (workspaceId) await db.workspace.delete({ where: { id: workspaceId } }); await db.user.delete({ where: { id: userId } }); await db.$disconnect(); });
async function make(status: 'QUEUED' | 'RUNNING', type: 'PROCESS_MEDIA' | 'TRANSCRIBE' = 'PROCESS_MEDIA', date = old) {
  const source = await db.sourceItem.create({ data: { workspaceId, createdById: userId, sourceType: 'VIDEO', status: type === 'TRANSCRIBE' ? 'READY' : 'PENDING' } });
  const job = await db.ingestJob.create({ data: { workspaceId, sourceItemId: source.id, requestedById: userId, provider: 'MANUAL', providerMode: 'REAL', jobType: type, status, startedAt: status === 'RUNNING' ? date : null, updatedAt: date } });
  return { source, job };
}
it('expires queued work and settles pending source and assets within scope', async () => {
  const { source, job } = await make('QUEUED');
  await db.sourceAsset.create({ data: { workspaceId, sourceItemId: source.id, sourceProvider: 'MANUAL', assetType: 'VIDEO', status: 'DOWNLOADING' } });
  await expireMaterialProcessing({ workspaceId: 'other', sourceItemId: source.id, now });
  expect((await db.ingestJob.findUnique({ where: { id: job.id } }))!.status).toBe('QUEUED');
  await expireMaterialProcessing({ workspaceId, sourceItemId: source.id, now });
  expect(await db.ingestJob.findUnique({ where: { id: job.id } })).toMatchObject({ status: 'FAILED', errorCode: 'MATERIAL_PROCESSING_TIMEOUT' });
  expect(await db.sourceItem.findUnique({ where: { id: source.id } })).toMatchObject({ status: 'FAILED' });
  expect((await db.sourceAsset.findFirst({ where: { sourceItemId: source.id } }))!.status).toBe('FAILED');
});
it('keeps stored originals and previous transcripts when a stale transcription ends', async () => {
  const { source, job } = await make('RUNNING', 'TRANSCRIBE');
  await db.transcript.create({ data: { workspaceId, sourceItemId: source.id, provider: 'MANUAL', providerMode: 'REAL', fullText: 'previous transcript', segments: [] } });
  await expireMaterialProcessing({ workspaceId, sourceItemId: source.id, now });
  expect((await db.ingestJob.findUnique({ where: { id: job.id } }))!.status).toBe('FAILED');
  expect((await db.sourceItem.findUnique({ where: { id: source.id } }))!.status).toBe('READY');
  expect((await db.transcript.findUnique({ where: { sourceItemId: source.id } }))!.fullText).toBe('previous transcript');
});
it('does not override a live execution lock or expire fresh jobs', async () => {
  const { source, job } = await make('RUNNING');
  await db.$transaction(async tx => {
    expect(await executionLock(tx, workspaceId, job.id)).toBe(true);
    await expireMaterialProcessing({ workspaceId, sourceItemId: source.id, now });
    expect((await db.ingestJob.findUnique({ where: { id: job.id } }))!.status).toBe('RUNNING');
  });
  const fresh = await make('QUEUED', 'PROCESS_MEDIA', now);
  await expireMaterialProcessing({ workspaceId, sourceItemId: fresh.source.id, now });
  expect((await db.ingestJob.findUnique({ where: { id: fresh.job.id } }))!.status).toBe('QUEUED');
});
it('settles abandoned synchronous uploads without an ingest job', async () => {
  const source = await db.sourceItem.create({ data: { workspaceId, createdById: userId, sourceType: 'VIDEO', sourceProvider: 'LOCAL_UPLOAD', status: 'PENDING', updatedAt: old } });
  await expireMaterialProcessing({ workspaceId, sourceItemId: source.id, now });
  expect((await db.sourceItem.findUnique({ where: { id: source.id } }))!.status).toBe('FAILED');
});
it('repeated dispatch reconciliation cannot perpetually reset the queue wait deadline', async () => {
  const { job } = await make('QUEUED');
  await markDispatchPending(job.id, workspaceId);
  const first = await db.ingestJob.findUnique({ where: { id: job.id } });
  await markDispatchPending(job.id, workspaceId);
  expect((await db.ingestJob.findUnique({ where: { id: job.id } }))!.updatedAt).toEqual(first!.updatedAt);
});
