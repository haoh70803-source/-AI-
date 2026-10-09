import { createServer, type Server } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import { attachDoubaoStreamFixture } from "../../../../scripts/testing/doubao-stream-fixture";
import { decodeDoubaoStreamPacket, DoubaoStreamingClient } from "./streaming-client";

let server: Server | undefined, fixture: ReturnType<typeof attachDoubaoStreamFixture> | undefined;
const originalOrigin = process.env.PROVIDER_TEST_ORIGIN;
afterEach(async () => { fixture?.close(); if (server) await new Promise<void>(done => server!.close(() => done())); server = undefined; vi.unstubAllEnvs(); if (originalOrigin) process.env.PROVIDER_TEST_ORIGIN = originalOrigin; else delete process.env.PROVIDER_TEST_ORIGIN; });
async function setup(mode?: Parameters<typeof attachDoubaoStreamFixture>[1], options?: ConstructorParameters<typeof DoubaoStreamingClient>[1]) {
  server = createServer(); fixture = attachDoubaoStreamFixture(server, mode);
  await new Promise<void>(done => server!.listen(0, "127.0.0.1", done)); const address = server.address(); if (!address || typeof address === "string") throw Error("TEST_BIND_FAILED");
  const origin = `http://127.0.0.1:${address.port}`; vi.stubEnv("PROVIDER_TEST_ORIGIN", origin); vi.stubEnv("ENVIRONMENT_ID", "LOCAL_TEST");
  return new DoubaoStreamingClient({authMode:"API_KEY",apiKey:"fixture-key",resourceId:"volc.seedasr.sauc.duration",baseUrl:origin},{packetIntervalMs:0,overallTimeoutMs:1000,...options});
}
const input = { audio: { mode: "BINARY_DATA" as const, data: Buffer.alloc(4000, 42) }, contentType: "audio/mpeg" };
describe("Doubao streaming recognition", () => {
  it("authenticates, tolerates empty initialization, sends exact bytes and waits for a final cumulative result",async()=>{
    const complete=vi.fn(); const client=await setup({onComplete:complete});
    await expect(client.recognize(input)).resolves.toMatchObject({result:{text:"流式识别测试文字"}});
    expect(complete).toHaveBeenCalledOnce(); const call=complete.mock.calls[0]![0]; expect(call.audio).toEqual(input.audio.data);
    expect(call.headers).toMatchObject({"x-api-key":"fixture-key","x-api-resource-id":"volc.seedasr.sauc.duration"});
    expect(call.config.request).toMatchObject({result_type:"full",show_utterances:true});expect(client.getLastRequestMetadata()).toMatchObject({providerRequestId:"fixture-stream-log",statusCode:"20000000"});
  });
  it("rejects a connection that closes with only a partial result",async()=>{const client=await setup({mode:"CLOSE"});await expect(client.recognize(input)).rejects.toMatchObject({code:"DOUBAO_SERVER_ERROR"});});
  it("rejects a final result received before all audio is sent",async()=>{const client=await setup({mode:"EARLY_FINISH"},{packetIntervalMs:20});await expect(client.recognize(input)).rejects.toMatchObject({code:"DOUBAO_INVALID_RESPONSE"});});
  it("classifies forbidden handshake without exposing secrets",async()=>{const client=await setup({mode:"FORBIDDEN"});await expect(client.recognize(input)).rejects.toMatchObject({code:"DOUBAO_PERMISSION_DENIED",details:{httpStatus:403,logId:"fixture-forbidden-log"}});});
  it("classifies a server error frame",async()=>{const client=await setup({mode:"ERROR"});await expect(client.recognize(input)).rejects.toMatchObject({code:"DOUBAO_PERMISSION_DENIED"});});
  it("bounds waiting for the final response",async()=>{const client=await setup({mode:"SILENT"},{overallTimeoutMs:50});await expect(client.recognize(input)).rejects.toMatchObject({code:"DOUBAO_TIMEOUT"});});
  it("supports caller cancellation",async()=>{const control=new AbortController();const client=await setup({mode:"SILENT"},{signal:control.signal});const result=client.recognize(input);setTimeout(()=>control.abort(),30);await expect(result).rejects.toMatchObject({code:"DOUBAO_TIMEOUT",retryable:false});});
  it("rejects malformed response frames",async()=>{const client=await setup({mode:"MALFORMED"});await expect(client.recognize(input)).rejects.toMatchObject({code:"DOUBAO_INVALID_RESPONSE"});});
  it("rejects empty recognition results",async()=>{const client=await setup({text:""});await expect(client.recognize(input)).rejects.toMatchObject({code:"DOUBAO_EMPTY_TRANSCRIPT"});});
  it("enforces the offline external-call boundary",async()=>{const client=await setup();vi.stubEnv("EXTERNAL_CALLS_DISABLED","true");await expect(client.recognize(input)).rejects.toThrow("LOCAL_REVIEW_EXTERNAL_CALL_BLOCKED");});
  it("rejects truncated binary frames",()=>{expect(()=>decodeDoubaoStreamPacket(Buffer.from([0x11,0x93]))).toThrow();});
});
