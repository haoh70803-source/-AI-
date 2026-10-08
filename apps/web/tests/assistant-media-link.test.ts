import { describe, expect, it, vi } from "vitest";
vi.mock("server-only",()=>({}));
import { mediaLinkFromMessage } from "../server/assistant/media-link";
describe("assistant media link routing",()=>{
 it("recognizes the exact jingxuan modal_id format without tracking",()=>expect(mediaLinkFromMessage("https://www.douyin.com/jingxuan?modal_id=7684134680525851939&msclkid=test 读取这个链接然后进行转写")).toBe("https://www.douyin.com/video/7684134680525851939"));
 it("does not ingest a platform homepage or an unrelated website",()=>{expect(mediaLinkFromMessage("https://www.douyin.com/")).toBeNull();expect(mediaLinkFromMessage("https://example.com/video/123")).toBeNull();});
 it("respects an explicit request not to transcribe",()=>expect(mediaLinkFromMessage("不要转写 https://www.douyin.com/video/123")).toBeNull());
});
