import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { AUTH_REAUTH_MESSAGE } from "@/lib/auth-errors";

export default async function LoginPage({searchParams}:{searchParams:Promise<{manual?:string;reason?:string}>}) {
  const params = await searchParams;
  if(process.env.DEMO_AUTO_LOGIN === "true" && params.manual !== "1") redirect("/experience");
  return <AuthForm mode="login" allowRegistration={process.env.INTERNAL_SIGNUP_ENABLED === "true"} notice={params.reason === "reauth" ? AUTH_REAUTH_MESSAGE : undefined} />;
}
