import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth-form";

export default function RegisterPage() {
  if (process.env.INTERNAL_SIGNUP_ENABLED !== "true") redirect("/login");
  return <AuthForm mode="register" allowRegistration />;
}
