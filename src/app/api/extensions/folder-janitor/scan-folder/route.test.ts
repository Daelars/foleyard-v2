import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { NextRequest } from "next/server";
import { expect, it, vi } from "vitest";
import { SqliteAudioFileRepository } from "@/lib/database/file-repository";
import { initializeDatabaseSchema } from "@/lib/database/migrations";
const mocks=vi.hoisted(()=>({roots:[] as string[],getFiles:vi.fn(),execute:vi.fn()}));
vi.mock("@/lib/db",()=>({getLibraryRoots:()=>mocks.roots,getFiles:mocks.getFiles}));
vi.mock("@/lib/extensions/host",()=>({createAppExtensionHost:()=>({execute:mocks.execute})}));
import { POST } from "./route";
it("passes every indexed file in a 501-file folder to the Janitor",async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),"foleyard-janitor-page-"));const db=new Database(":memory:");
  try {initializeDatabaseSchema(db);const insert=db.prepare("INSERT INTO files (id,path,filename,library_root) VALUES (?,?,?,?)");for(let i=0;i<501;i++)insert.run(String(i),path.join(root,i+".wav"),i+".wav",root);
    const repository=new SqliteAudioFileRepository(db);mocks.roots=[root];mocks.getFiles.mockImplementation(options=>repository.getFiles(options));mocks.execute.mockResolvedValue({ok:true,type:"value",value:{ok:true}});
    const response=await POST(new NextRequest("http://localhost/api/extensions/folder-janitor/scan-folder",{method:"POST",body:JSON.stringify({folderPath:root})}));expect(response.status).toBe(200);expect(mocks.execute.mock.calls[0][0].input.files).toHaveLength(501);
  }finally{db.close();await fs.rm(root,{recursive:true,force:true});}
});
