"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

const POLL_INTERVAL_MS = 2_500;
const BACKGROUND_INTERVAL_MS = 5_000;
const HARD_REFRESH_AFTER_MS = 10_000;

export type SourceProcessingSnapshot = {
  busy: boolean;
  fingerprint: string;
  transcriptionStatus: string | null;
  hasTranscript: boolean;
  transcriptUpdatedAt: string | null;
  transcription: {
    status: string;
    progress: number;
    stage: string | null;
    errorMessage: string | null;
  } | null;
};

export function SourceProcessingPoller({ sourceId, active, onSnapshot }: {
  sourceId: string;
  active: boolean;
  onSnapshot?: (snapshot: SourceProcessingSnapshot) => void;
}) {
  const router = useRouter();
  const callback = useRef(onSnapshot);
  useEffect(() => { callback.current = onSnapshot; }, [onSnapshot]);

  useEffect(() => {
    if (!active) return;
    let stopped = false;
    let inFlight = false;
    let timer: number | undefined;
    let controller: AbortController | undefined;
    let fingerprint: string | null = null;
    let terminalSince: number | null = null;

    const schedule = () => {
      if (!stopped) timer = window.setTimeout(() => void poll(), document.visibilityState === "hidden" ? BACKGROUND_INTERVAL_MS : POLL_INTERVAL_MS);
    };
    const poll = async () => {
      if (stopped || inFlight) return;
      inFlight = true;
      controller = new AbortController();
      try {
        const response = await fetch(`/api/source-items/${sourceId}/processing`, {
          cache: "no-store", signal: controller.signal,
        });
        if (!response.ok) return;
        const snapshot = await response.json() as SourceProcessingSnapshot;
        callback.current?.(snapshot);
        const changed = fingerprint !== null && fingerprint !== snapshot.fingerprint;
        fingerprint = snapshot.fingerprint;
        if (snapshot.busy) {
          terminalSince = null;
          if (changed) router.refresh();
        } else {
          terminalSince ??= Date.now();
          router.refresh();
          // A route refresh can be dropped while the tab is in the background.
          // Continue polling until the server-rendered view catches up.
          if (Date.now() - terminalSince >= HARD_REFRESH_AFTER_MS) {
            stopped = true;
            window.location.reload();
          }
        }
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          // A temporary network error must not freeze the displayed state.
        }
      } finally {
        inFlight = false;
        if (!stopped) schedule();
      }
    };
    const onVisibilityChange = () => {
      if (document.visibilityState !== "visible" || stopped || inFlight) return;
      if (timer !== undefined) window.clearTimeout(timer);
      void poll();
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    void poll();
    return () => {
      stopped = true;
      controller?.abort();
      if (timer !== undefined) window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [active, router, sourceId]);

  return null;
}
