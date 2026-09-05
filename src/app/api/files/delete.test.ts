import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks=vi.hoisted(()=>({roots:[] as string[],records:new Map<string,{path:string}>(),markFileRemoved:vi.fn()}));
vi.mock("@/lib/db",()=>({getFileById:(id:string)=>mocks.records.get(id),getLibraryRoots:()=>mocks.roots,markFileRemoved:mocks.markFileRemoved}));
import { DELETE } from "./route";
let temp:string, inside:string, outside:string;
beforeEach(async()=>{temp=await fs.mkdtemp(path.join(os.tmpdir(),"foleyard-delete-"));const root=path.join(temp,"library");await fs.mkdir(root);inside=path.join(root,"hit.wav");outside=path.join(temp,"private.wav");await Promise.all([inside,outside].map(p=>fs.writeFile(p,"audio")));mocks.roots=[root];mocks.records=new Map([["inside",{path:inside}],["outside",{path:outside}]]);mocks.markFileRemoved.mockReset();});
afterEach(async()=>{await fs.rm(temp,{recursive:true,force:true});});
const request=(body:unknown)=>new NextRequest("http://localhost/api/files",{method:"DELETE",body:JSON.stringify(body)});
describe("file deletion",()=>{
  it("unlinks only indexed files inside Library roots",async()=>{const response=await DELETE(request({fileIds:["inside","outside","unknown"],permanent:true}));const result=await response.json();expect(result.removed).toEqual(["inside"]);expect(result.failed.map((f:{id:string})=>f.id)).toEqual(["outside","unknown"]);await expect(fs.stat(inside)).rejects.toMatchObject({code:"ENOENT"});expect(await fs.readFile(outside,"utf8")).toBe("audio");expect(mocks.markFileRemoved).toHaveBeenCalledTimes(1);});
  it("soft deletion leaves disk contents intact",async()=>{await DELETE(request({fileIds:["inside"],permanent:false}));expect(await fs.readFile(inside,"utf8")).toBe("audio");expect(mocks.markFileRemoved).toHaveBeenCalledOnce();});
  it("rejects malformed ids before touching files",async()=>{expect((await DELETE(request({fileIds:["inside",3],permanent:true}))).status).toBe(400);expect(await fs.readFile(inside,"utf8")).toBe("audio");expect(mocks.markFileRemoved).not.toHaveBeenCalled();});
});
