import { randomUUID } from "node:crypto";
import { db } from "@content-center/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { listAccountSessions, revokeAccountSessions, sessionDevice } from "../server/account-sessions";
describe("account session ownership", () => {
  const suffix=randomUUID(); let user="", other="", current="", secondary="", foreign="";
  beforeAll(async()=>{
    user=(await db.user.create({data:{name:"Sessions",email:`sessions-${suffix}@example.test`}})).id;
    other=(await db.user.create({data:{name:"Other",email:`sessions-other-${suffix}@example.test`}})).id;
    async function session(userId:string){return (await db.session.create({data:{userId,token:randomUUID(),expiresAt:new Date(Date.now()+3600000),userAgent:"Mozilla Windows Chrome/140"}})).id;}
    current=await session(user);secondary=await session(user);foreign=await session(other);
  });
  afterAll(async()=>{await db.user.deleteMany({where:{id:{in:[user,other]}}});await db.$disconnect();});
  it("only returns own sessions without tokens or full user agents",async()=>{
    const items=await listAccountSessions(user,current);expect(items).toHaveLength(2);expect(items.find(item=>item.id===current)?.current).toBe(true);
    expect(JSON.stringify(items)).not.toContain("token");expect(JSON.stringify(items)).not.toContain("userAgent");expect(items.some(item=>item.id===foreign)).toBe(false);
  });
  it("cannot revoke another user or the current session",async()=>{
    expect((await revokeAccountSessions(user,current,foreign)).count).toBe(0);
    expect((await revokeAccountSessions(user,current,current)).count).toBe(0);
  });
  it("revokes other own sessions immediately",async()=>{
    expect((await revokeAccountSessions(user,current)).count).toBe(1);
    expect(await db.session.findUnique({where:{id:secondary}})).toBeNull();
    expect(await db.session.findUnique({where:{id:foreign}})).not.toBeNull();
    expect(await db.session.findUnique({where:{id:current}})).not.toBeNull();
  });
  it("formats device names without exposing arbitrary user-agent content",()=>{
    expect(sessionDevice("Windows Chrome/140 Edg/140")).toBe("Windows · Edge");
    expect(sessionDevice(null)).toBe("应用或其他设备");
  });
});
