import { randomUUID, createHash } from "node:crypto";
import Redis from "ioredis";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { reserveExperienceUsage, closeExperienceLimitConnection } from "./experience-limits";
const original = { enabled: process.env.EXPERIENCE_LIMITS_ENABLED, site: process.env.EXPERIENCE_SITE_ID };
const sites: string[] = [];
const connection = new Redis(process.env.REDIS_URL!);
beforeEach(() => { process.env.EXPERIENCE_LIMITS_ENABLED = "true"; const site = `limit-test-${randomUUID()}`; process.env.EXPERIENCE_SITE_ID = site; sites.push(createHash("sha256").update(site).digest("hex").slice(0,16)); });
afterAll(async () => { for (const site of sites) { const keys = await connection.keys(`experience:${site}:*`); if (keys.length) await connection.del(...keys); } await connection.quit(); await closeExperienceLimitConnection(); if(original.enabled===undefined) delete process.env.EXPERIENCE_LIMITS_ENABLED; else process.env.EXPERIENCE_LIMITS_ENABLED=original.enabled; if(original.site===undefined) delete process.env.EXPERIENCE_SITE_ID; else process.env.EXPERIENCE_SITE_ID=original.site; });
describe("experience limits with real Redis", () => {
 it("allows exactly five simultaneous generations and releases capacity", async () => {
  const results = await Promise.allSettled(Array.from({length:6},(_,i)=>reserveExperienceUsage({workspaceId:"test",userId:`user${i}`,operation:"AI"})));
  expect(results.filter(x=>x.status==="fulfilled")).toHaveLength(5);
  expect(results.filter(x=>x.status==="rejected")).toHaveLength(1);
  for (const item of results) if(item.status==="fulfilled") await item.value();
  const release = await reserveExperienceUsage({workspaceId:"test",userId:"next",operation:"AI"}); await release();
 });
 it("enforces visitor quotas independently", async () => {
  const input = {workspaceId:"test",userId:"visitor",operation:"UPLOAD" as const,amount:10,quotaOnly:true};
  await reserveExperienceUsage(input);
  await expect(reserveExperienceUsage({...input,amount:1})).rejects.toThrow("三天内 10 次");
  await reserveExperienceUsage({...input,userId:"another",amount:1});
 });
 it("enforces the site cap across different visitors", async () => {
  for(let i=0;i<5;i++) await reserveExperienceUsage({workspaceId:"test",userId:`visitor${i}`,operation:"UPLOAD",amount:10,quotaOnly:true});
  await expect(reserveExperienceUsage({workspaceId:"another",userId:"another",operation:"UPLOAD",quotaOnly:true})).rejects.toThrow("全站");
 });
});
