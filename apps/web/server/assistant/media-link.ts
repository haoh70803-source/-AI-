import "server-only";
import { ExperienceLimitError } from "@content-center/worker/experience-limits";
import { setTimeout as pause } from "node:timers/promises";
import { db } from "@content-center/db";
import { extractRedFoxContentUrl } from "@content-center/providers";
import { requestSourceTranscription, TranscriptionAlreadyRunningError } from "@content-center/worker/transcription";
import { createSourceAndJob } from "../source-service";
import { addProjectSource } from "../project-service";
import { getMaterialReadableContent } from "../material-detail/readable-content";
export type MediaLinkAction = { status: "READY" | "PENDING" | "FAILED"; sourceId?: string; message: string };
export function mediaLinkFromMessage(message: string): string | null {
  if (/(?:不要|不用|禁止)(?:抓取|采集|转写|转录|读取)/u.test(message)) return null;
  try {
    const {url} = extractRedFoxContentUrl(message);
    const parsed = new URL(url);
    const modal = parsed.searchParams.get("modal_id");
    if (["douyin.com","www.douyin.com"].includes(parsed.hostname) && /^\d+$/.test(modal || "")) return `https://www.douyin.com/video/${modal}`;
    parsed.searchParams.delete("msclkid");
    return parsed.toString();
  } catch { return null; }
}
export async function prepareMediaLink(input: { workspaceId: string; userId: string; projectId: string; url: string; signal?: AbortSignal; onProgress: (message: string) => void }): Promise<MediaLinkAction> {
  const membership = await db.workspaceMember.findFirst({where:{workspaceId:input.workspaceId,userId:input.userId,disabledAt:null,role:{in:["OWNER","ADMIN","EDITOR"]},workspace:{disabledAt:null},user:{disabledAt:null}}});
  const project = await db.contentProject.findFirst({where:{id:input.projectId,workspaceId:input.workspaceId,status:{not:"ARCHIVED"}}});
  if (!membership || !project) return {status:"FAILED",message:"当前账号无权采集到此项目。"};
  let sourceId: string | undefined;
  try {
    input.signal?.throwIfAborted();
    input.onProgress("正在通过红狐采集作品链接");
    const existing = await db.sourceItem.findFirst({where:{workspaceId:input.workspaceId,status:{not:"ARCHIVED"},OR:[{canonicalUrl:input.url},{sourceUrl:input.url}]},orderBy:{createdAt:"desc"},select:{id:true}});
    sourceId = existing?.id;
    if (!sourceId) sourceId = (await createSourceAndJob({workspaceId:input.workspaceId,userId:input.userId,autoTranscribe:true,source:{kind:"REDFOX",url:input.url}})).sourceItem.id;
    if (!await db.projectSource.findFirst({where:{projectId:input.projectId,sourceItemId:sourceId}})) {
      try { await addProjectSource({...input,sourceItemId:sourceId,role:"REFERENCE"}); }
      catch (error) { if (!await db.projectSource.findFirst({where:{projectId:input.projectId,sourceItemId:sourceId}})) throw error; }
    }
    const ingest = await db.ingestJob.findFirst({where:{workspaceId:input.workspaceId,sourceItemId:sourceId,jobType:{not:"TRANSCRIBE"}},orderBy:{createdAt:"desc"}});
    if (ingest && ["QUEUED","RUNNING"].includes(ingest.status)) await db.ingestJob.update({where:{id:ingest.id},data:{metadata:{...(ingest.metadata && typeof ingest.metadata === "object" && !Array.isArray(ingest.metadata) ? ingest.metadata : {}),autoTranscribe:true}}});
    let requested = false;
    const deadline = Date.now() + 120_000;
    while (Date.now() < deadline) {
      input.signal?.throwIfAborted();
      const source = await db.sourceItem.findFirst({where:{id:sourceId,workspaceId:input.workspaceId,status:{not:"ARCHIVED"}},include:{transcript:true,assets:{where:{assetType:{in:["VIDEO","AUDIO"]},status:"STORED",storageKey:{not:null}},take:1},ingestJobs:{orderBy:{createdAt:"desc"},take:3}}});
      if (!source) return {status:"FAILED",sourceId,message:"资料已被移除，已停止处理。"};
      if (source.transcript?.fullText?.trim() || !["VIDEO","AUDIO"].includes(source.sourceType) && (await getMaterialReadableContent({...input,sourceItemId:sourceId}))?.contentText) return {status:"READY",sourceId,message:"已取得真实正文，请根据此资料回应用户；若要求转写，直接给出文字稿，不得自行补写视频没有的内容。"};
      const active = source.ingestJobs.find(job => ["QUEUED","RUNNING"].includes(job.status));
      const failed = source.ingestJobs.find(job => job.status === "FAILED" || job.status === "CANCELLED");
      if (!active && failed && (!source.assets.length || requested || failed.jobType === "TRANSCRIBE")) return {status:"FAILED",sourceId,message:`处理失败：${failed.errorMessage || failed.errorCode || "采集或转写服务未返回结果"}。请打开资料查看状态或重试。不得声称已经转写。`};
      if (source.assets.length && !requested) {
        input.onProgress("视频已保存，正在调用当前转写服务");
        try { await requestSourceTranscription({workspaceId:input.workspaceId,requestedById:input.userId,sourceItemId:sourceId,mediaAssetId:source.assets[0]!.id}); }
        catch (error) { if (!(error instanceof TranscriptionAlreadyRunningError)) throw error; }
        requested = true;
      }
      input.onProgress(requested ? "正在转写视频，完成后会读取文字稿" : "正在获取并保存视频文件");
      await pause(2000, undefined, {signal:input.signal});
    }
    return {status:"PENDING",sourceId,message:"后台仍在采集或转写，已保存到项目资料。此次尚未取得正文，不能编写逐字稿。请告知用户可打开资料查看进度，稍后发送“继续转写”读取结果。"};
  } catch (error) {
    if (input.signal?.aborted) throw error;
    if (error instanceof ExperienceLimitError) return {status:"FAILED",sourceId,message:error.message};
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
    const message = code === "REDFOX_NOT_CONFIGURED" ? "红狐服务尚未配置。" : code === "REDFOX_DISABLED" ? "红狐服务已停用。" : code.startsWith("DOUBAO") ? "豆包转写配置不可用，请管理员检查服务配置。" : code.startsWith("LOCAL_ASR") ? "本机转写服务暂不可用，请检查转写设置。" : "作品采集或转写未能完成，请打开资料查看状态。";
    return {status:"FAILED",sourceId,message};
  }
}
