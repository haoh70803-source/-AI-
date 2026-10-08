"use client";
import { FileText } from "lucide-react";
import { useState } from "react";

export function AssetThumbnail({ src }: { src: string }) {
  const [failed, setFailed] = useState(false);
  return failed ? <span className="asset-thumbnail-fallback" aria-label="暂无封面"><FileText size={30} strokeWidth={1.2} /></span> : <img src={src} alt="" loading="lazy" onError={() => setFailed(true)} />;
}
