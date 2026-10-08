import { registerInternalUser } from "@/server/internal-signup";

export async function POST(request: Request) {
  return registerInternalUser(request);
}
