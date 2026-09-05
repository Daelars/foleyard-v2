import Database from "better-sqlite3";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initializeDatabaseSchema } from "@/lib/database/migrations";
import { SqliteTagRepository } from "@/lib/database/tag-repository";
import { SqliteCollectionRepository } from "@/lib/database/collection-repository";
const state=vi.hoisted(()=>({tags:null as SqliteTagRepository|null,collections:null as SqliteCollectionRepository|null}));
vi.mock("@/lib/db",()=>({getAllTags:()=>state.tags!.getAllTags(),getAllCollections:()=>state.collections!.getAllCollections(),getFileById:()=>null,createTag:(name:string)=>state.tags!.createTag(name),createCollection:(name:string)=>state.collections!.createCollection(name)}));
import { POST as tag } from "./tags/route";
import { POST as collection } from "./collections/route";
let db:Database;
beforeEach(()=>{db=new Database(":memory:");initializeDatabaseSchema(db);state.tags=new SqliteTagRepository(db);state.collections=new SqliteCollectionRepository(db);vi.spyOn(console,"error").mockImplementation(()=>{});});
afterEach(()=>{db.close();vi.restoreAllMocks();});
const request=(body:unknown)=>new NextRequest("http://localhost/api/test",{method:"POST",body:JSON.stringify(body)});
describe.each([["tag",tag],["collection",collection]] as const)("%s mutation errors",(_name,post)=>{
  it("returns 409 and logs a duplicate name",async()=>{expect((await post(request({name:"Impacts"}))).status).toBe(200);const response=await post(request({name:"Impacts"}));expect(response.status).toBe(409);expect((await response.json()).error).toMatch(/already exists/i);expect(console.error).toHaveBeenCalled();});
  it("rejects non-string names",async()=>{expect((await post(request({name:42}))).status).toBe(400);});
  it("rejects missing attachments with a readable 4xx",async()=>{const response=await post(request({fileId:"missing",tagId:"missing",collectionId:"missing"}));expect(response.status).toBe(404);expect((await response.json()).error).toMatch(/does not exist/i);});
});
