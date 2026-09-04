import { afterEach, expect, it, vi } from "vitest";
import { createMetadataQueue } from "../metadata-queue";
import type { MetadataSeam } from "../types";
afterEach(()=>vi.useRealTimers());
it("drains a backlog beyond 30 seconds while tasks continue completing",async()=>{
  vi.useFakeTimers();
  const results:unknown[]=[];
  const extractor:MetadataSeam={extract:async()=>{await new Promise(resolve=>setTimeout(resolve,10000));return {filename:"hit.wav",format:"wav",codec:"pcm",duration:1,sampleRate:48000,bitDepth:16,channels:1,fileSize:100};}};
  const queue=createMetadataQueue(1,record=>results.push(record),extractor,()=>{});
  for(let i=0;i<4;i++)queue.enqueue({filePath:String(i),filename:"hit.wav",fileSize:100,format:"wav"});
  const settled=queue.onIdle().then(()=>"complete",()=>"failed");
  await vi.advanceTimersByTimeAsync(41000);
  expect(await settled).toBe("complete");expect(results).toHaveLength(4);
});
it("reports a stalled task without polling every millisecond",async()=>{
  vi.useFakeTimers();const queue=createMetadataQueue(1,()=>{}, {extract:()=>new Promise(()=>{})},()=>{});
  queue.enqueue({filePath:"stalled",filename:"hit.wav",fileSize:100,format:"wav"});
  const idle=queue.onIdle(100).then(()=>"complete",error=>error.message);
  await vi.advanceTimersByTimeAsync(101);expect(await idle).toMatch(/stall|timed out/i);queue.cancel();
});
