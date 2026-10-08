import {afterEach,describe,it,expect} from "vitest";
import {runFreeTask} from "./free-runtime";
const original=process.env.FREE_WORKER_MODE;
afterEach(()=>{if(original===undefined)delete process.env.FREE_WORKER_MODE;else process.env.FREE_WORKER_MODE=original});
describe("free runtime serialization",()=>{
 it("holds the next task until the active task finishes",async()=>{process.env.FREE_WORKER_MODE="true";const order:string[]=[];let finish!:()=>void;const gate=new Promise<void>(resolve=>{finish=resolve});const first=runFreeTask(async()=>{order.push("first");await gate;order.push("done")});const second=runFreeTask(async()=>{order.push("second")});await Promise.resolve();await Promise.resolve();expect(order).toEqual(["first"]);finish();await Promise.all([first,second]);expect(order).toEqual(["first","done","second"]);});
 it("releases the next task even after an error",async()=>{process.env.FREE_WORKER_MODE="true";await expect(runFreeTask(async()=>{throw Error("failed")})).rejects.toThrow("failed");await expect(runFreeTask(async()=>"ok")).resolves.toBe("ok");});
});
