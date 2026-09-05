import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { EventEmitter } from "node:events";
import https from "node:https";
import { afterEach, describe, expect, it, vi } from "vitest";
const require=createRequire(import.meta.url);
const {downloadWithRedirects,verifyDigest}=require("../../scripts/postinstall.cjs") as {downloadWithRedirects(url:string):Promise<Buffer>;verifyDigest(buffer:Buffer,digest:string):void};
afterEach(()=>vi.restoreAllMocks());
describe("native binary integrity",()=>{
  it("rejects a checksum mismatch",()=>expect(()=>verifyDigest(Buffer.from("tampered"),"sha256:"+"0".repeat(64))).toThrow(/checksum mismatch/));
  it("accepts the published checksum",()=>{const data=Buffer.from("native bytes");expect(()=>verifyDigest(data,"sha256:"+createHash("sha256").update(data).digest("hex"))).not.toThrow();});
  it("rejects missing digests",()=>expect(()=>verifyDigest(Buffer.from("native"),"")).toThrow(/digest/));
  it("refuses plain HTTP before sending a request",async()=>{const get=vi.spyOn(https,"get");await expect(downloadWithRedirects("http://example.com/binary")).rejects.toThrow(/non-HTTPS/);expect(get).not.toHaveBeenCalled();});
  it("refuses an HTTPS redirect to HTTP",async()=>{
    const get=vi.spyOn(https,"get").mockImplementation(((_url:unknown,_options:unknown,callback:(res:unknown)=>void)=>{
      const req=Object.assign(new EventEmitter(),{setTimeout:()=>{},destroy:()=>{}});
      queueMicrotask(()=>callback({statusCode:302,headers:{location:"http://example.com/binary"},resume:()=>{}}));return req;
    }) as unknown as typeof https.get);
    await expect(downloadWithRedirects("https://example.com/binary")).rejects.toThrow(/non-HTTPS/);expect(get).toHaveBeenCalledOnce();
  });
});
