import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
export async function POST(request: Request) {
  if(process.env.DEMO_AUTO_LOGIN !== "true") return NextResponse.json({message:"免登录体验尚未开放。"},{status:404});
  const origin=request.headers.get("origin");
  if(!origin || origin!==new URL(process.env.APP_URL || request.url).origin) return NextResponse.json({message:"请求来源无效。"},{status:403});
  const password=process.env.EXPERIENCE_LOGIN_PASSWORD;
  if(!password) return NextResponse.json({message:"体验账号尚未初始化，请联系管理员。"},{status:503});
  const response=await auth.api.signInEmail({body:{email:"xsj666@experience.invalid",password},headers:request.headers,asResponse:true});
  if(!response.ok) return NextResponse.json({message:"体验账号暂不可用，请联系管理员。"},{status:503});
  const result=NextResponse.json({ok:true});
  for(const cookie of response.headers.getSetCookie()) result.headers.append("set-cookie",cookie);
  result.headers.set("cache-control","no-store");
  return result;
}
