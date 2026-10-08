/** Review and the approved daily cutover both reject external calls at the server boundary. */
export function isLocalReviewOffline() {
  return process.env.ENVIRONMENT_ID === "LOCAL_REVIEW" || process.env.LOCAL_REVIEW_OFFLINE === "true" || process.env.EXTERNAL_CALLS_DISABLED === "true";
}

export function assertReviewExternalAllowed() {
  if (isLocalReviewOffline()) throw new Error("LOCAL_REVIEW_EXTERNAL_CALL_BLOCKED");
}
