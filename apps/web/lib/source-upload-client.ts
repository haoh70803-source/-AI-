export type SourceUploadResult = {
  name: string;
  status: "QUEUED" | "DUPLICATE" | "FAILED" | "READY";
  stage?: "UPLOADING" | "UPLOADED" | "READING" | "TRANSCRIBING" | "READY" | "FAILED";
  uploadProgress?: number;
  processingStatus?: "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED" | "CANCELLED";
  currentStage?: "QUEUED" | "READING" | "TRANSCRIBING" | "READY" | "FAILED";
  userSafeMessage?: string;
  sourceItemId?: string;
  jobId?: string;
  message?: string;
  errorCode?: string;
  contentState?: "READING" | "READY";
};

export function sourceUploadStatusLabel(result: Pick<SourceUploadResult, "status" | "stage" | "processingStatus">) {
  if (result.status === "DUPLICATE") return "已存在";
  if (result.status === "FAILED") return "上传失败";
  if (result.stage === "UPLOADING") return "上传中";
  if (result.stage === "TRANSCRIBING") return "正在转写";
  if (result.stage === "READING") return "正在读取";
  if (result.stage === "READY") return "已准备好";
  if (result.status === "READY" || result.processingStatus === "SUCCEEDED") return "已准备好";
  if (result.processingStatus === "FAILED" || result.processingStatus === "CANCELLED") return "上传成功 · 读取失败";
  return "已上传，正在读取";
}

function uploadSourceFile(file: File, onProgress: (progress: number) => void) {
  return new Promise<SourceUploadResult>((resolve) => {
    const formData = new FormData();
    formData.append("files", file, file.name);
    const request = new XMLHttpRequest();
    request.timeout = 4 * 60_000;
    request.addEventListener("timeout", () => resolve({ name: file.name, status: "FAILED", stage: "FAILED", errorCode: "UPLOAD_TIMEOUT", message: "上传时间过长，已停止等待。请重新上传或重试。" }));
    request.open("POST", "/api/source-items/upload");
    request.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable) onProgress(Math.min(100, Math.round((event.loaded / event.total) * 100)));
    });
    request.addEventListener("load", () => {
      let body: { results?: SourceUploadResult[]; message?: string; error?: string } = {};
      try { body = JSON.parse(request.responseText) as typeof body; } catch { /* handled below */ }
      if (body.results?.[0]) {
        resolve(body.results[0]);
        return;
      }
      resolve({ name: file.name, status: "FAILED", stage: "FAILED", message: body.message || body.error || "上传失败，请重试。" });
    });
    request.addEventListener("error", () => resolve({ name: file.name, status: "FAILED", stage: "FAILED", message: "上传失败，请检查网络后重试。" }));
    request.addEventListener("abort", () => resolve({ name: file.name, status: "FAILED", stage: "FAILED", message: "上传已取消。" }));
    request.send(formData);
  });
}

export async function uploadSourceFiles(files: File[], onProgress?: (index: number, progress: number) => void) {
  if (files.length > 10) throw new Error("一次最多添加 10 个文件。");
  const results: SourceUploadResult[] = new Array(files.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(2, files.length) }, async () => {
    while (next < files.length) {
      const index = next++;
      results[index] = await uploadSourceFile(files[index]!, progress => onProgress?.(index, progress));
    }
  }));
  return results;
}
