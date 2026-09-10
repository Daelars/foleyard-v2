// Experiment only: canonical 44-byte-header PCM16 stereo WAV on little-endian hosts.
// Deliberately narrow. Production adoption must retain the general RIFF parser.
import { open } from 'node:fs/promises';
import { setImmediate } from 'node:timers/promises';
import os from 'node:os';
import assert from 'node:assert/strict';
export async function pcm16Candidate(filePath) {
  assert.equal(os.endianness(),'LE');
  const file=await open(filePath,'r');
  try {
    const header=Buffer.alloc(44);await file.read(header,0,44,0);
    assert.equal(header.toString('ascii',0,4),'RIFF');assert.equal(header.toString('ascii',36,40),'data');
    assert.equal(header.readUInt16LE(20),1);assert.equal(header.readUInt16LE(22),2);assert.equal(header.readUInt16LE(34),16);
    const frames=header.readUInt32LE(40)/4;
    const peaks=Array(512).fill(0),counts=Array(512).fill(0);
    const buffer=Buffer.alloc(65536);let frame=0,bin=0;
    while(frame<frames) {
      const wanted=Math.min(buffer.length,(frames-frame)*4);
      const {bytesRead}=await file.read(buffer,0,wanted,44+frame*4);assert.equal(bytesRead,wanted);
      const samples=new Int16Array(buffer.buffer,buffer.byteOffset,bytesRead/2);
      let offset=0;
      while(offset<samples.length) {
        const end=Math.min(frame+(samples.length-offset)/2,Math.ceil((bin+1)*frames/512));
        for(;frame<end;frame++) {
          // Keep summation order identical to production for exact parity.
          peaks[bin]+=Math.abs(samples[offset++])/32768;
          peaks[bin]+=Math.abs(samples[offset++])/32768;
          counts[bin]+=2;
        }
        if(frame>=Math.ceil((bin+1)*frames/512))bin++;
      }
      await setImmediate();
    }
    for(let i=0;i<512;i++)peaks[i]=counts[i]?peaks[i]/counts[i]:0;
    const maximum=Math.max(...peaks,.001);
    return {supported:true,peaks:peaks.map(value=>value/maximum)};
  } finally { await file.close(); }
}
