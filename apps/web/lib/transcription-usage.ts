export function successfulTranscriptionDurationMs(rows: ReadonlyArray<{ success: boolean; metadata: unknown }>) {
  return rows.filter((row) => row.success).reduce((sum, row) => {
    const metadata = row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata) ? row.metadata as Record<string, unknown> : {};
    const duration = metadata.durationMs;
    return sum + (typeof duration === "number" && Number.isFinite(duration) ? duration : 0);
  }, 0);
}
