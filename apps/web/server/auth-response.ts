import { AUTH_SERVICE_MESSAGE } from "../lib/auth-errors";
/** Return a safe service failure without exposing database or account details. */
export async function loginResponse(handle: () => Promise<Response>): Promise<Response> {
  try {
    const response = await handle();
    if (response.status < 500) return response;
    await response.body?.cancel();
  } catch {
    // The auth handler already owns server diagnostics; never return raw errors.
  }
  return Response.json({ code: "AUTH_SERVICE_UNAVAILABLE", message: AUTH_SERVICE_MESSAGE }, { status: 503, headers: { "cache-control": "no-store" } });
}
