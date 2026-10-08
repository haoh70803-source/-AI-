import { db } from "@content-center/db";
import { hashPassword } from "better-auth/crypto";
import { createLocalAccountIssuer } from "@better-auth/core/db";
async function main(){
 const password=process.env.EXPERIENCE_LOGIN_PASSWORD;
 if(!password || password.length<6) throw new Error("EXPERIENCE_PASSWORD_REQUIRED");
 const email="xsj666@experience.invalid";
 if(await db.user.findUnique({where:{email}})){console.info("EXPERIENCE_ACCOUNT_ALREADY_EXISTS");return;}
 const owner=process.env.EXPERIENCE_OWNER_EMAIL ? await db.user.findUnique({where:{email:process.env.EXPERIENCE_OWNER_EMAIL}}) : await db.user.findFirst({where:{systemRole:"SYSTEM_ADMIN",disabledAt:null},orderBy:{createdAt:"asc"}});
 if(!owner) throw new Error("EXPERIENCE_OWNER_REQUIRED");
 const hashed=await hashPassword(password);
 await db.$transaction(async tx=>{
  const user=await tx.user.create({data:{name:"鑫世界体验账号",email}});
  await tx.account.create({data:{userId:user.id,accountId:user.id,providerId:"credential",issuer:createLocalAccountIssuer("credential"),password:hashed}});
  await tx.workspace.create({data:{name:"鑫世界公开体验空间",slug:"xsj-shared-experience",members:{create:[{userId:owner.id,role:"OWNER"},{userId:user.id,role:"EDITOR"}]}}});
 });
 console.info("EXPERIENCE_ACCOUNT_CREATED");
}
main().catch(()=>{console.error("EXPERIENCE_BOOTSTRAP_FAILED: check owner account and password environment variables");process.exitCode=1;}).finally(()=>db.$disconnect());
