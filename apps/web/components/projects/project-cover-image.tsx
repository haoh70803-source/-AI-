"use client";

import { useState } from "react";

export function ProjectCoverImage({ src, fallback }: { src: string | null; fallback: string }) {
  const [failed, setFailed] = useState(false);
  const value = !src || failed ? fallback : src;
  return <img src={value} alt="" loading="lazy" className={!src || failed ? "is-fallback" : ""} onError={() => { if (value !== fallback) setFailed(true); }} />;
}
