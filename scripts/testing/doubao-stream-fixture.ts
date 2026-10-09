import { createHash } from "node:crypto";
import type { Server } from "node:http";
import type { Socket } from "node:net";
import { gunzipSync, gzipSync } from "node:zlib";

// Local-only protocol fixture. It implements masked client frames independently
// from the production codec, and never sends fixture audio to an external host.
export function attachDoubaoStreamFixture(server: Server, options: {
  mode?: "SUCCESS" | "CLOSE" | "SILENT" | "ERROR" | "MALFORMED" | "FORBIDDEN" | "EARLY_FINISH";
  text?: string;
  onComplete?: (input: { headers: Record<string, string | string[] | undefined>; audio: Buffer; config: unknown }) => void;
} = {}) {
  const sockets = new Set<Socket>();
  server.on("upgrade", (request, rawSocket, head) => {
    const socket = rawSocket as Socket; sockets.add(socket); socket.on("close", () => sockets.delete(socket)); socket.on("error", () => {});
    if (options.mode === "FORBIDDEN") { socket.end("HTTP/1.1 403 Forbidden\r\nX-Tt-Logid: fixture-forbidden-log\r\nX-Api-Status-Code: 45000030\r\nContent-Length: 0\r\n\r\n"); return; }
    const accept = createHash("sha1").update(String(request.headers["sec-websocket-key"]) + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").digest("base64");
    socket.write("HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: " + accept + "\r\nX-Tt-Logid: fixture-stream-log\r\n\r\n");
    let pending = Buffer.from(head), config: unknown; const chunks: Buffer[] = [];
    const send = (last: boolean, payload: unknown, code?: number) => {
      const body = gzipSync(Buffer.from(JSON.stringify(payload))), packet = Buffer.alloc(12 + body.length);
      packet.set([0x11, code ? 0xf0 : last ? 0x93 : 0x91, 0x11, 0]);
      if (code) packet.writeUInt32BE(code, 4); else packet.writeInt32BE(last ? -1 : 1, 4);
      packet.writeUInt32BE(body.length, 8); packet.set(body, 12);
      const frame = Buffer.alloc(packet.length < 126 ? 2 : 4); frame[0] = 0x82;
      if (packet.length < 126) frame[1] = packet.length; else { frame[1] = 126; frame.writeUInt16BE(packet.length, 2); }
      socket.write(Buffer.concat([frame, packet]));
    };
    const consume = () => {
      while (pending.length >= 2) {
        let size = pending[1]! & 127, offset = 2;
        if (size === 126) { if (pending.length < 4) return; size = pending.readUInt16BE(2); offset = 4; }
        if (size === 127) { socket.destroy(); return; }
        const masked = Boolean(pending[1]! & 128), mask = pending.subarray(offset, offset + 4); if (masked) offset += 4;
        if (pending.length < offset + size) return;
        const opcode = pending[0]! & 15, payload = Buffer.from(pending.subarray(offset, offset + size)); pending = pending.subarray(offset + size);
        if (opcode === 8) { socket.end(); return; }
        if (opcode !== 2) continue;
        if (masked) for (let n = 0; n < payload.length; n++) payload[n] = payload[n]! ^ mask[n % 4]!;
        const kind = payload[1]! >> 4, last = Boolean(payload[1]! & 2), bytes = gunzipSync(payload.subarray(8));
        if (kind === 1) { config = JSON.parse(bytes.toString()); if (options.mode === "EARLY_FINISH") send(true,{result:{text:"提前结束",utterances:[]}}); else if (options.mode !== "SILENT") send(false, { result: {} }); continue; }
        chunks.push(bytes);
        if (!last) continue;
        options.onComplete?.({ headers: request.headers, audio: Buffer.concat(chunks), config });
        if (options.mode === "SILENT") continue;
        if (options.mode === "ERROR") { send(false, {}, 45000030); continue; }
        if (options.mode === "MALFORMED") { socket.write(Buffer.from([0x82, 0x02, 0, 0])); continue; }
        const text = options.text ?? "流式识别测试文字";
        send(options.mode !== "CLOSE", { audio_info: { duration: 1000 }, result: { text, utterances: [{ start_time: 0, end_time: 1000, text }] } });
        if (options.mode === "CLOSE") setTimeout(() => socket.destroy(), 10);
      }
    };
    socket.on("data", bytes => { pending = Buffer.concat([pending, Buffer.from(bytes)]); try { consume(); } catch { socket.destroy(); } });
    if (pending.length) consume();
  });
  return { close: () => { for (const socket of sockets) socket.destroy(); } };
}
