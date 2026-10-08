import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { db } from "@content-center/db";
import { auth } from "../lib/auth";

const origin = "http://localhost:3020";
const scope = { materialIds: [], benchmarkAccountIds: [], trendKeys: [], notes: "", useCreatorProfile: false, useOwnArtifacts: false };
const createdUsers: string[] = [], createdWorkspaces: string[] = [];
type Fixture = { userId: string; workspaceId: string; projectId: string; sourceId: string; assetId: string; sessionId: string; runId: string; artifactId: string; messageId: string; cookie: string };
let a: Fixture, b: Fixture;
const evidence: Array<{ check: string; method: string; status: number }> = [];
let jobsBefore = 0, usagesBefore = 0;
async function fixture(label: string): Promise<Fixture> {
  const email = 'account-http-' + randomUUID() + '@example.test';
  const password = 'disposable-fixture-' + randomUUID();
  const registration = await auth.api.signUpEmail({ body: { name: 'Disposable HTTP ' + label, email, password } });
  const userId = registration.user.id; createdUsers.push(userId);
  expect((await db.user.findUniqueOrThrow({ where: { id: userId } })).systemRole).toBe("USER");
  const workspace = await db.workspace.create({ data: { name: 'Disposable HTTP ' + label, slug: 'account-http-' + randomUUID(), members: { create: { userId, role: "OWNER" } } } });
  createdWorkspaces.push(workspace.id);
  const workspaceId = workspace.id;
  const project = await db.contentProject.create({ data: { workspaceId, createdById: userId, title: 'Disposable project ' + label } });
  const source = await db.sourceItem.create({ data: { workspaceId, createdById: userId, sourceType: "AUDIO", title: 'Disposable material ' + label, rawText: 'Private fixture material ' + label, status: "READY" } });
  const asset = await db.sourceAsset.create({ data: { workspaceId, sourceItemId: source.id, assetType: "AUDIO", sourceProvider: "FIXTURE", status: "REMOTE", mimeType: "audio/wav" } });
  const session = await db.researchSession.create({ data: { workspaceId, createdById: userId, projectId: project.id, title: 'Disposable research ' + label, requestKey: randomUUID() } });
  const run = await db.researchRun.create({ data: { workspaceId, requestedById: userId, sessionId: session.id, requestKey: randomUUID(), requestHash: 'fixture-' + label, question: 'Private fixture question ' + label, version: 1, status: "COMPLETED", stage: "COMPLETED", inputScope: scope } });
  const branch = await db.draftBranch.create({ data: { workspaceId, projectId: project.id, title: 'Disposable artifact ' + label, workingTitle: 'Disposable artifact ' + label, workingBody: 'Private fixture body ' + label, version: 1, createdById: userId, updatedById: userId } });
  const artifact = await db.artifact.create({ data: { workspaceId, projectId: project.id, draftBranchId: branch.id, createdById: userId, title: 'Disposable artifact ' + label } });
  const thread = await db.assistantThread.create({ data: { workspaceId, projectId: project.id, createdById: userId } });
  const message = await db.assistantMessage.create({ data: { threadId: thread.id, role: "ASSISTANT", status: "COMPLETED", content: 'Disposable answer ' + label } });
  const response = await auth.api.signInEmail({ body: { email, password }, asResponse: true });
  expect(response.ok).toBe(true);
  const cookie = response.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
  expect(Boolean(cookie)).toBe(true);
  return { userId, workspaceId, projectId: project.id, sourceId: source.id, assetId: asset.id, sessionId: session.id, runId: run.id, artifactId: artifact.id, messageId: message.id, cookie };
}
async function request(who: Fixture, check: string, path: string, method = "GET", body?: unknown) {
  const response = await fetch(origin + path, { method, headers: { cookie: who.cookie, origin, ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined, redirect: "manual", signal: AbortSignal.timeout(90_000) });
  evidence.push({ check, method, status: response.status });
  return response;
}
beforeAll(async () => {
  if (process.env.ENVIRONMENT_ID !== "LOCAL_REVIEW" || process.env.LOCAL_REVIEW_OFFLINE !== "true" || new URL(process.env.DATABASE_URL!).port !== "55436") throw Error("REVIEW_ONLY_HTTP_FIXTURES");
  jobsBefore = await db.ingestJob.count(); usagesBefore = await db.apiUsage.count();
  a = await fixture('A'); b = await fixture('B');
}, 90_000);
afterAll(async () => {
  // Only fixture-owned scopes; no selection by names, no original-user changes.
  if (createdWorkspaces.length) await db.workspace.deleteMany({ where: { id: { in: createdWorkspaces } } });
  if (createdUsers.length) await db.user.deleteMany({ where: { id: { in: createdUsers } } });
  const cleaned = await db.user.count({ where: { id: { in: createdUsers } } }) === 0 && await db.workspace.count({ where: { id: { in: createdWorkspaces } } }) === 0;
  await writeFile(resolve(process.cwd(), '../../output/account-upgrade-private/http-isolation-evidence.json'), JSON.stringify({ origin, head: 'ae3ff087', checks: evidence, fixtureCleanupVerified: cleaned, usesRealUserPassword: false, externalCallEvidence: "HTTP rejected before enqueue; separate mocked request/exec tests assert zero calls", sideEffectCountsUnchanged: await db.ingestJob.count() === jobsBefore && await db.apiUsage.count() === usagesBefore }, null, 2));
  expect(cleaned).toBe(true);
  await db.$disconnect();
}, 90_000);
it("authenticates each disposable user and permits their own resources", async () => {
  for (const who of [a,b]) for (const path of ['/api/projects/' + who.projectId, '/api/source-items/' + who.sourceId, '/api/research/sessions/' + who.sessionId + '/runs/' + who.runId, '/api/projects/' + who.projectId + '/artifacts/' + who.artifactId]) {
    expect((await request(who, 'own-resource-readable', path)).status).toBe(200);
  }
}, 180_000);
it("denies foreign project, material, attachment, research and artifact reads and writes in both directions", async () => {
  const directions: Array<[Fixture, Fixture]> = [[a,b],[b,a]];
  for (const [who,foreign] of directions) {
    const cases: Array<[string,string,string,unknown?]> = [
      ['project-read', '/api/projects/' + foreign.projectId, 'GET'],
      ['project-write', '/api/projects/' + foreign.projectId, 'PATCH', { title: 'must-not-change' }],
      ['material-read', '/api/source-items/' + foreign.sourceId, 'GET'],
      ['material-write', '/api/source-items/' + foreign.sourceId, 'PATCH', { action: 'UPDATE', title: 'must-not-change' }],
      ['attachment-read', '/api/source-items/' + foreign.sourceId + '/assets/' + foreign.assetId + '/access', 'GET'],
      ['attachment-id-substitution', '/api/source-items/' + who.sourceId + '/assets/' + foreign.assetId + '/access?disposition=attachment', 'GET'],
      ['attachment-transcription-write', '/api/source-items/' + foreign.sourceId + '/transcribe', 'POST', {}],
      ['research-read', '/api/research/sessions/' + foreign.sessionId + '/runs/' + foreign.runId, 'GET'],
      ['research-save', '/api/research/sessions/' + foreign.sessionId + '/runs/' + foreign.runId, 'POST', {}],
      ['research-start', '/api/research/sessions/' + foreign.sessionId + '/runs', 'POST', { requestKey: randomUUID(), question: 'must-not-run', scope }],
      ['artifact-read', '/api/projects/' + foreign.projectId + '/artifacts/' + foreign.artifactId, 'GET'],
      ['artifact-write', '/api/projects/' + foreign.projectId + '/artifacts/' + foreign.artifactId + '/revisions', 'POST', { sourceMessageId: foreign.messageId, expectedVersion: 1 }],
      ['artifact-id-substitution', '/api/projects/' + who.projectId + '/artifacts/' + foreign.artifactId, 'GET'],
    ];
    for (const [check,path,method,body] of cases) expect([403,404].includes((await request(who,check,path,method,body)).status)).toBe(true);
    expect((await db.contentProject.findUniqueOrThrow({ where: { id: foreign.projectId } })).title).not.toBe('must-not-change');
    expect((await db.sourceItem.findUniqueOrThrow({ where: { id: foreign.sourceId } })).title).not.toBe('must-not-change');
    expect((await db.researchRun.findUniqueOrThrow({ where: { id: foreign.runId } })).savedAt).toBeNull();
    expect((await db.artifact.findUniqueOrThrow({ where: { id: foreign.artifactId }, include: { draftBranch: true } })).draftBranch.version).toBe(1);
  }
}, 240_000);
it("rejects real HTTP ASR initialization, transcription and F2 before jobs or provider usage", async () => {
  const paths: Array<[string,unknown]> = [
    ['/api/local-asr/models/initialize', { model: 'SENSEVOICE_SMALL' }],
    ['/api/source-items/' + a.sourceId + '/transcribe', {}],
    ['/api/discovery/benchmarks/fixture-account/comments/collect', { snapshotId: 'fixture-snapshot', offset: 0 }],
  ];
  for (const [path,body] of paths) {
    const response = await request(a, 'offline-request-blocked', path, 'POST', body);
    expect(response.status).toBe(409); expect((await response.json()).error).toBe('LOCAL_REVIEW_OFFLINE');
  }
  const display = await request(a, 'offline-asr-status', '/api/local-asr/status');
  expect(display.status).toBe(200); expect((await display.json()).errorCode).toBe('LOCAL_REVIEW_OFFLINE');
  expect(await db.ingestJob.count()).toBe(jobsBefore); expect(await db.apiUsage.count()).toBe(usagesBefore);
}, 180_000);
