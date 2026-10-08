const TRACKING_PARAMETERS = new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "fbclid",
  "gclid",
]);

export function normalizeSourceUrl(input: string, canonicalUrl?: string | null): string {
  const candidate = canonicalUrl?.trim() || input.trim();
  const url = new URL(candidate);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Only HTTP and HTTPS URLs are supported");
  }
  if (url.username || url.password) throw new Error("Credentials in URLs are not supported");

  url.hash = "";
  url.hostname = url.hostname.toLowerCase();
  for (const key of [...url.searchParams.keys()]) {
    if (TRACKING_PARAMETERS.has(key.toLowerCase())) url.searchParams.delete(key);
  }
  return url.toString();
}
