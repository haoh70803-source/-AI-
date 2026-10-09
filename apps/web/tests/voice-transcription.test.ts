import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ status: vi.fn(), credentials: vi.fn(), transcribe: vi.fn(), upload: vi.fn(), remove: vi.fn(), signed: vi.fn(), resolve: vi.fn() }));
vi.mock("@content-center/integrations", async original => ({ ...await original<typeof import("@content-center/integrations")>(), IntegrationService: class { getIntegrationStatus = mocks.status; getDecryptedIntegrationConfig = mocks.credentials; } }));
vi.mock("@content-center/providers", async original => ({ ...await original<typeof import("@content-center/providers")>(), DoubaoTranscriptionProvider: class { transcribe = mocks.transcribe; }, DoubaoRecordingFileTranscriptionProvider: class { transcribe = mocks.transcribe; }, DoubaoStreamingTranscriptionProvider: class { transcribe = mocks.transcribe; }, resolvePublicAddress: mocks.resolve, getStorageProvider: () => ({ upload: mocks.upload, delete: mocks.remove, getSignedUrl: mocks.signed }) }));
import { db } from "@content-center/db";
import { DoubaoError } from "@content-center/providers";
import { prepareVoiceTranscription, cleanupExpiredAsrAudio } from "@content-center/worker/transcription";
const userId = "voice-provider-" + randomUUID(); let workspaceId = "";
beforeAll(async () => {
  await db.user.create({ data: { id: userId, email: userId + "@example.test", name: "Voice fixture" } });
  workspaceId = (await db.workspace.create({ data: { name: "Voice fixture", slug: userId, members: { create: { userId, role: "OWNER" } } } })).id;
});
afterAll(async () => { if (workspaceId) await db.workspace.delete({ where: { id: workspaceId } }); await db.user.delete({ where: { id: userId } }); await db.$disconnect(); });
beforeEach(() => {
  vi.resetAllMocks(); mocks.status.mockImplementation(async (_workspace, provider) => provider === "TRANSCRIPTION" ? { status: "CONFIGURED", publicConfig: { source: "DOUBAO" } } : { status: "CONFIGURED" });
  mocks.credentials.mockResolvedValue({ apiKey: "fake-never-sent", protocol: "RECORDING_FILE_2_0" });
  mocks.signed.mockResolvedValue({ data: { url: "https://fixture.example/scoped-audio.mp3" } }); mocks.transcribe.mockResolvedValue({ data: { fullText: " 临时语音 " } });
});
const audio = { audio: { mode: "BINARY_DATA" as const, data: new Uint8Array([1, 2, 3]) }, contentType: "audio/mpeg" };
it("uses streaming credentials for cloud dictation without uploading temporary public media",async()=>{
  mocks.credentials.mockResolvedValue({apiKey:"fake-never-sent",protocol:"STREAMING_2_0",resourceId:"volc.seedasr.sauc.duration"});
  const transcribe=await prepareVoiceTranscription(workspaceId);expect(await transcribe(audio,userId,1234)).toBe("临时语音");
  expect(mocks.transcribe).toHaveBeenCalledWith(audio);expect(mocks.upload).not.toHaveBeenCalled();expect(mocks.signed).not.toHaveBeenCalled();
  expect(await db.apiUsage.findFirst({where:{workspaceId,userId},orderBy:{createdAt:"desc"}})).toMatchObject({operation:"TRANSCRIBE_STREAMING_2_0",success:true});
});
it("uses scoped temporary media for recording-file API, then removes it and records real usage", async () => {
  const transcribe = await prepareVoiceTranscription(workspaceId); expect(await transcribe(audio, userId, 1234)).toBe("临时语音");
  const uploaded = mocks.upload.mock.calls[0]![0]; expect(uploaded.assetScope.workspaceId).toBe(workspaceId);
  expect(mocks.signed.mock.calls[0]![2]).toMatchObject({ purpose: "doubao", assetScope: uploaded.assetScope });
  expect(mocks.transcribe).toHaveBeenCalledWith({ audio: { mode: "REMOTE_URL", url: "https://fixture.example/scoped-audio.mp3" }, contentType: "audio/mpeg" });
  expect(mocks.remove).toHaveBeenCalledWith(uploaded.key, uploaded.assetScope);
  expect(await db.sourceItem.count({ where: { workspaceId, sourceProvider: "VOICE_INPUT" } })).toBe(0);
  expect(await db.apiUsage.findFirst({ where: { workspaceId, userId }, orderBy: { createdAt: "desc" } })).toMatchObject({ operation: "TRANSCRIBE_RECORDING_FILE_2_0", success: true, metadata: expect.objectContaining({ durationMs: 1234, purpose: "VOICE_INPUT" }) });
});
it("keeps failed deletion inventoried and the existing cleaner retries without exposing it in the library", async () => {
  mocks.remove.mockRejectedValue(new Error("temporary storage unavailable")); const transcribe = await prepareVoiceTranscription(workspaceId);
  expect(await transcribe(audio, userId, 1000)).toBe("临时语音");
  expect(await db.sourceItem.findFirst({ where: { workspaceId, sourceProvider: "VOICE_INPUT" } })).toMatchObject({ status: "ARCHIVED" });
  mocks.remove.mockResolvedValue({}); expect((await cleanupExpiredAsrAudio(Date.now(), workspaceId)).cleaned).toBe(1);
  expect(await db.sourceItem.count({ where: { workspaceId, sourceProvider: "VOICE_INPUT" } })).toBe(0);
});
it("cleans media after timeout and logs the failed call without automatic retry", async () => {
  mocks.transcribe.mockRejectedValue(new DoubaoError("DOUBAO_TIMEOUT", "timeout", false)); const transcribe = await prepareVoiceTranscription(workspaceId);
  await expect(transcribe(audio, userId, 1000)).rejects.toMatchObject({ code: "DOUBAO_TIMEOUT" }); expect(mocks.transcribe).toHaveBeenCalledOnce();
  expect(await db.sourceItem.count({ where: { workspaceId, sourceProvider: "VOICE_INPUT" } })).toBe(0);
  expect(await db.apiUsage.findFirst({ where: { workspaceId, userId }, orderBy: { createdAt: "desc" } })).toMatchObject({ success: false });
});
it("flash dictation uses binary audio without creating a stored recording", async () => {
  mocks.credentials.mockResolvedValue({ apiKey: "fake-never-sent", protocol: "FLASH" }); const transcribe = await prepareVoiceTranscription(workspaceId);
  expect(await transcribe(audio, userId, 1000)).toBe("临时语音"); expect(mocks.upload).not.toHaveBeenCalled(); expect(mocks.transcribe).toHaveBeenCalledWith(audio);
});

it("recovers an interrupted upload but keeps an active temporary recording", async () => {
  async function seed(age: number) {
    const source = await db.sourceItem.create({ data: { workspaceId, createdById: userId, sourceType: "AUDIO", sourceProvider: "VOICE_INPUT", status: "ARCHIVED" } });
    await db.sourceAsset.create({ data: { workspaceId, sourceItemId: source.id, assetType: "AUDIO", sourceProvider: "VOICE_INPUT", status: "DOWNLOADING", storageKey: `voice-fixture/${source.id}`, storedAt: new Date(Date.now() - age) } });
    return source.id;
  }
  const stale = await seed(11 * 60000), fresh = await seed(0);
  expect((await cleanupExpiredAsrAudio(Date.now(), workspaceId)).cleaned).toBe(1);
  expect(await db.sourceItem.findUnique({ where: { id: stale } })).toBeNull();
  expect(await db.sourceItem.findUnique({ where: { id: fresh } })).not.toBeNull();
  await db.sourceItem.delete({ where: { id: fresh } });
});
