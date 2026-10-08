import {describe,it,expect,vi,beforeEach} from "vitest";
vi.mock("server-only",()=>({}));
const mocks=vi.hoisted(()=>({context:vi.fn(),add:vi.fn()}));
vi.mock("@/server/api-access",()=>({getApiWorkspaceContext:mocks.context,apiError:(error:string,status:number,message?:string)=>Response.json({error,message},{status})}));
vi.mock("@/server/discovery/service",()=>({addBenchmark:mocks.add,listBenchmarks:vi.fn()}));
vi.mock("@/server/experience-account",()=>import("../server/experience-account"));
vi.mock("@/server/discovery/schemas",()=>import("../server/discovery/schemas"));
vi.mock("@/server/discovery/api",()=>({discoveryApiError:()=>Response.json({error:"failed"},{status:400})}));
import {canAddResearchAccount} from "../server/experience-account";
import {POST} from "../app/api/discovery/benchmarks/route";
const account={externalId:"test-account",platform:"DOUYIN",name:"权限测试账号",avatarUrl:null,bio:null,followers:null,likes:null,originalUrl:null,sourceProvider:"REDFOX"};
beforeEach(()=>{vi.clearAllMocks();mocks.add.mockResolvedValue({id:"saved-account"});});
describe("experience research creation",()=>{
 it("allows demo editor without granting general administrator permissions",()=>{expect(canAddResearchAccount("EDITOR",{email:"xsj666@experience.invalid"})).toBe(true);expect(canAddResearchAccount("EDITOR",{email:"another@example.test"})).toBe(false);expect(canAddResearchAccount("VIEWER",{email:"xsj666@experience.invalid"})).toBe(false);});
 it("creates in authenticated workspace rather than a submitted workspace",async()=>{mocks.context.mockResolvedValue({role:"EDITOR",workspace:{id:"demo-space"},session:{user:{id:"demo-user",email:"xsj666@experience.invalid"}}});const response=await POST(new Request("http://localhost/api/discovery/benchmarks",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({account})}));expect(response.status).toBe(201);expect(mocks.add).toHaveBeenCalledWith({workspaceId:"demo-space",userId:"demo-user",account});});
 it("rejects viewers before performing creation",async()=>{mocks.context.mockResolvedValue({role:"VIEWER",workspace:{id:"demo-space"},session:{user:{id:"demo-user",email:"xsj666@experience.invalid"}}});const response=await POST(new Request("http://localhost/api/discovery/benchmarks",{method:"POST",body:"{}"}));expect(response.status).toBe(403);expect(mocks.add).not.toHaveBeenCalled();});
});
