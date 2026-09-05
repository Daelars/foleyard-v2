import { expect, it } from "vitest";
import { mapConcurrent } from "./map-concurrent";
it("bounds active work and preserves input order",async()=>{
  let active=0,peak=0;const values=Array.from({length:25},(_,index)=>index);
  const result=await mapConcurrent(values,4,async value=>{peak=Math.max(peak,++active);await new Promise(resolve=>setTimeout(resolve,value%3));active--;return value*2;});
  expect(peak).toBe(4);expect(result).toEqual(values.map(value=>value*2));
});
