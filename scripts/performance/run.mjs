// Run from the repo root: node scripts/performance/run.mjs
// All audio, cache files and SQLite databases are created under benchmarks/.
import { mkdir, writeFile, readFile, copyFile, stat, utimes } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { performance, monitorEventLoopDelay } from 'node:perf_hooks';
import { Worker, isMainThread, parentPort } from 'node:worker_threads';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { pcm16Candidate } from './pcm16-candidate.mjs';
import ffmpegPath from 'ffmpeg-static';

const generated = path.resolve('benchmarks/performance/generated.mjs');
if (isMainThread) {
  await mkdir(path.dirname(generated), { recursive: true });
  const bun = process.platform === 'win32' ? path.join(process.env.APPDATA, 'npm/node_modules/bun/bin/bun.exe') : 'bun';
  const build = spawnSync(bun, ['build', 'scripts/performance/production.ts', '--target=node', '--external=better-sqlite3', '--external=drizzle-orm', '--external=music-metadata', '--external=ffmpeg-static', '--external=uuid', `--outfile=${generated}`], { encoding: 'utf8', windowsHide: true });
  if (build.status !== 0) throw new Error(String(build.error || build.stderr || build.stdout));
}
const production = await import(`file:///${generated.replaceAll('\\', '/')}`);
const { generateWaveform, getWaveformPeaks, withGenerationSlot, extractMetadata, ScanRunner, RealFileSystemSeam, createDatabaseConnection, SqliteAudioFileRepository } = production;
if (!isMainThread) {
  parentPort.on('message', async (file) => {
    try { parentPort.postMessage({ result: await generateWaveform(file) }); }
    catch (error) { parentPort.postMessage({ error: String(error) }); }
  });
  parentPort.postMessage({ ready: true });
}

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
function summary(samples) {
  const sorted = [...samples].sort((a,b) => a-b);
  return { median: sorted[Math.floor(sorted.length/2)], min: sorted[0], max: sorted.at(-1), samples };
}
async function measured(work) {
  const delay = monitorEventLoopDelay({ resolution: 1 });
  delay.enable();
  await sleep(10);
  const cpu = process.cpuUsage();
  const start = performance.now();
  const value = await work();
  const ms = performance.now()-start;
  const used = process.cpuUsage(cpu);
  await sleep(5);
  delay.disable();
  return { ms, cpuMs: (used.user+used.system)/1000, loopP95Ms: delay.percentile(95)/1e6, loopMaxMs: delay.max/1e6, rssMiB: process.memoryUsage().rss/2**20, value };
}
async function repeat(work, count=5) {
  const runs=[];
  for(let i=0;i<count;i++) { const timing=await measured(()=>work(i)); delete timing.value; runs.push(timing); }
  return { elapsedMs: summary(runs.map(r=>r.ms)), runs };
}
async function wav(file, seconds) {
  const rate=48000, frames=Math.floor(rate*seconds), bytes=frames*4;
  const header=Buffer.alloc(44);
  header.write('RIFF'); header.writeUInt32LE(36+bytes,4); header.write('WAVEfmt ',8);
  header.writeUInt32LE(16,16); header.writeUInt16LE(1,20); header.writeUInt16LE(2,22);
  header.writeUInt32LE(rate,24); header.writeUInt32LE(rate*4,28); header.writeUInt16LE(4,32); header.writeUInt16LE(16,34);
  header.write('data',36);header.writeUInt32LE(bytes,40);
  const pcm=Buffer.alloc(bytes);
  for(let frame=0;frame<frames;frame++) { const sample=Math.round(24000*Math.sin(frame*0.071)*(.5+.5*Math.sin(frame*0.00003)));pcm.writeInt16LE(sample,frame*4);pcm.writeInt16LE(-sample,frame*4+2); }
  await writeFile(file,Buffer.concat([header,pcm]));
}
async function mapLimit(items,limit,fn) {
  let next=0;
  await Promise.all(Array.from({length:limit},async()=>{while(next<items.length){const i=next++;await fn(items[i]);}}));
}
if (isMainThread) await main();
async function main() {
  const root=path.resolve('benchmarks/performance',new Date().toISOString().replaceAll(':','-'));
  await mkdir(root,{recursive:true});
  const report={ date:new Date().toISOString(), node:process.version, cpu:os.cpus()[0].model, logicalCpus:os.cpus().length, platform:process.platform, root, notes:['Generated fixtures; warm OS cache, no OS cache eviction.', 'New-index scans mean empty scratch SQLite, not cold physical storage.', 'Stage service totals overlap; synchronous repository totals are additive within repository work.', 'RSS is process snapshot, not isolated per-case peak. No real library or settings accessed.'] };
  const save=()=>writeFile(path.join(root,'results.json'),JSON.stringify(report,null,2));
  console.log('Scratch:',root);
  const library=path.join(root,'library');await mkdir(library);
  const short=path.join(root,'short.wav'),long=path.join(root,'long.wav'),long2=path.join(root,'long2.wav');
  await wav(short,.1);await wav(long,300);await copyFile(long,long2);
  const files=[];
  for(let i=0;i<1000;i++){const dir=path.join(library,String(i%20));await mkdir(dir,{recursive:true});const file=path.join(dir,`clip-${String(i).padStart(5,'0')}.wav`);await copyFile(short,file);files.push(file);}
  report.fixtures={ scanFiles:1000, scanDirectories:20, scanFormat:'PCM16 stereo 48 kHz, 0.1 s', waveformSeconds:300, waveformBytes:(await stat(long)).size };
  console.log('Fixtures ready. Measuring real scanner and SQLite.');
  report.scans=[];
  for(let round=0;round<3;round++) {
    const {sqlite}=createDatabaseConnection(path.join(root,`scan-${round}.sqlite`));
    const repository=new SqliteAudioFileRepository(sqlite);
    for(const scenario of ['new-index','unchanged','one-percent-changed']) {
      if(scenario==='one-percent-changed'){for(const file of files.slice(0,10)){const s=await stat(file);await utimes(file,s.atime,new Date(s.mtimeMs+2000));}}
      const stages={};let metadataActive=0,peakActive=0,metadataDone=0,queued=0,peakOutstanding=0;
      const repo=new Proxy(repository,{get(target,key){const value=target[key];if(typeof value!=='function')return value;return(...args)=>{const start=performance.now();const result=value.apply(target,args);stages[String(key)]=(stages[String(key)]??0)+performance.now()-start;if(key==='batchUpsertFiles'){queued+=args[0].length;peakOutstanding=Math.max(peakOutstanding,queued-metadataDone);}return result;};}});
      const fs=new RealFileSystemSeam();const realStat=fs.stat.bind(fs);
      fs.stat=async(file)=>{const t=performance.now();const v=await realStat(file);stages.statServiceMs=(stages.statServiceMs??0)+performance.now()-t;return v;};
      let resolve;const completion=new Promise(r=>resolve=r);
      const scanner=new ScanRunner({fileRepo:repo,settingsRepo:{},getLibraryRoots:()=>[library],fs,metadataExtractor:{extract:async(...args)=>{metadataActive++;peakActive=Math.max(peakActive,metadataActive);const t=performance.now();try{return await extractMetadata(...args);}finally{stages.metadataServiceMs=(stages.metadataServiceMs??0)+performance.now()-t;metadataActive--;metadataDone++;}}},onComplete:()=>resolve()});
      const timing=await measured(async()=>{scanner.startScan();await completion;});
      const status=scanner.getStatus();assert.equal(status.phase,'complete');assert.equal(status.errors,0);assert.equal(status.indexed,1000);assert.equal(status.metadataProcessed,scenario==='new-index'?1000:scenario==='unchanged'?0:10);
      delete timing.value;report.scans.push({round,scenario,...timing,stages,peakActive,peakOutstanding,status});
      console.log('scan',round,scenario,timing.ms.toFixed(1),'ms');
    }
    sqlite.close();
  }
  await save();
  report.metadataConcurrency={};
  for(const concurrency of [1,4,16,32,64]) report.metadataConcurrency[concurrency]=await repeat(()=>mapLimit(files,concurrency,file=>extractMetadata(file,{fullParse:true})),3);
  console.log('Metadata sweep complete. Measuring waveforms.');await save();
  const baseline=await generateWaveform(long);assert.equal(baseline.supported,true);assert.equal(baseline.peaks.length,512);
  assert.deepEqual(await pcm16Candidate(long),baseline);
  assert.deepEqual(await pcm16Candidate(short),await generateWaveform(short));
  report.waveformPcm16Candidate=await repeat(()=>pcm16Candidate(long));
  report.waveformMain=await repeat(()=>generateWaveform(long));
  report.waveformPaired=[];
  for(let i=0;i<5;i++){
    const order=i%2?['candidate','current']:['current','candidate'];
    const pair={};for(const mode of order){const result=await measured(()=>mode==='candidate'?pcm16Candidate(long):generateWaveform(long));assert.deepEqual(result.value,baseline);delete result.value;pair[mode]=result;}report.waveformPaired.push(pair);
  }
  const startWorker=performance.now();
  const worker=new Worker(new URL(import.meta.url));
  await new Promise((resolve,reject)=>{worker.once('message',resolve);worker.once('error',reject);});
  report.workerStartupMs=performance.now()-startWorker;
  const workerCall=(file)=>new Promise((resolve,reject)=>{worker.once('message',message=>message.error?reject(Error(message.error)):resolve(message.result));worker.postMessage(file);});
  const workerResult=await workerCall(long);assert.deepEqual(workerResult,baseline);
  report.waveformWorker=await repeat(()=>workerCall(long));await worker.terminate();
  report.compressed={};
  for(const format of ['mp3','flac']) {
    const file=path.join(root,`minute.${format}`);
    const conversion=spawnSync(ffmpegPath,['-hide_banner','-loglevel','error','-i',long,'-t','60',file],{encoding:'utf8',windowsHide:true});
    if(conversion.status!==0)throw Error(conversion.stderr);
    const peaks=await generateWaveform(file);assert.equal(peaks.supported,true);
    report.compressed[format]={seconds:60,bytes:(await stat(file)).size,waveform:await repeat(()=>generateWaveform(file),3),metadata:await repeat(()=>extractMetadata(file,{fullParse:true}),3)};
  }
  const cache=path.join(root,'cache');await getWaveformPeaks(short,cache);
  report.cacheIdle=await repeat(()=>getWaveformPeaks(short,cache));
  report.cacheWithRealGenerations=[];
  for(let i=0;i<3;i++) {
    const cacheDir=path.join(root,`cache-real-${i}`);await getWaveformPeaks(short,cacheDir);
    const a=getWaveformPeaks(long,cacheDir),b=getWaveformPeaks(long2,cacheDir);
    await sleep(20);
    const timing=await measured(()=>getWaveformPeaks(short,cacheDir));delete timing.value;
    await Promise.all([a,b]);report.cacheWithRealGenerations.push(timing);
  }
  // Controlled admission comparison: the same real semaphore is held for 250 ms.
  // Candidate hit-only path preserves cache validation, but is not a full replacement.
  async function cacheHitOutsideSlot(){const s=await stat(short);const key=createHash('sha256').update(short).digest('hex');const entry=JSON.parse(await readFile(path.join(cache,`${key}.json`),'utf8'));assert.equal(entry.identity,`2:${s.mtimeMs}:${s.size}`);assert.equal(typeof entry.supported,'boolean');assert.equal(entry.peaks.length,512);assert(entry.peaks.every(p=>Number.isFinite(p)&&p>=0&&p<=1));return entry;}
  report.cacheControlled={};
  for(const [name,fn] of [['current',()=>getWaveformPeaks(short,cache)],['candidate',cacheHitOutsideSlot]]) {
    report.cacheControlled[name]=await repeat(async()=>{await fn();});
    const samples=[];
    for(let i=0;i<5;i++){const a=withGenerationSlot(()=>sleep(250)),b=withGenerationSlot(()=>sleep(250));const t=performance.now();await fn();samples.push(performance.now()-t);await Promise.all([a,b]);}
    report.cacheControlled[name].occupiedMs=summary(samples);
  }
  console.log('Waveforms and cache complete. Measuring 100k-row browsing.');await save();
  const {sqlite}=createDatabaseConnection(path.join(root,'queries.sqlite'));
  const repository=new SqliteAudioFileRepository(sqlite);
  const insert=sqlite.prepare('INSERT INTO files(id,path,filename,library_root,format,duration,mtime_ms) VALUES(?,?,?,?,?,?,?)');
  sqlite.transaction(()=>{for(let i=0;i<100000;i++)insert.run(String(i).padStart(8,'0'),`/fixture/${i}.wav`,`clip-${String((i*7919)%100000).padStart(8,'0')}.wav`,'/fixture','wav',i%300,1);})();
  const queries={ first:{limit:100,offset:0},deep:{limit:100,offset:90000},search:{limit:100,query:'123'},duration:{limit:100,sortKey:'duration',sortDir:'asc'} };
  const expected=Object.fromEntries(Object.entries(queries).map(([name,options])=>[name,repository.getFiles(options).map(f=>f.id)]));
  report.queries={};
  const sql='SELECT id,filename FROM files WHERE removed_at IS NULL ORDER BY filename ASC,id ASC LIMIT 100 OFFSET 90000';
  for(const stage of ['baseline','analyzed-baseline','composite-index']) {
    if(stage==='analyzed-baseline')sqlite.exec('ANALYZE;');
    if(stage==='composite-index')sqlite.exec('CREATE INDEX bench_active_filename ON files(filename,id) WHERE removed_at IS NULL; CREATE INDEX bench_active_duration ON files((duration IS NULL),duration,filename,id) WHERE removed_at IS NULL; ANALYZE;');
    report.queries[stage]={plan:sqlite.prepare(`EXPLAIN QUERY PLAN ${sql}`).all()};
    for(const [name,options] of Object.entries(queries)){assert.deepEqual(repository.getFiles(options).map(f=>f.id),expected[name]);report.queries[stage][name]=await repeat(()=>repository.getFiles(options));}
    report.queries[stage].count=await repeat(()=>repository.getFileCount());
  }
  // Same projection as repository browse; cursor acquisition excluded.
  const cursor=sqlite.prepare('SELECT filename,id FROM files WHERE removed_at IS NULL ORDER BY filename,id LIMIT 1 OFFSET 89999').get();
  const columns='id,path,filename,library_root,directory,format,duration,sample_rate,bit_depth,channels,file_size,mtime_ms,is_favorite,removed_at,created_at';
  const keyset=sqlite.prepare(`SELECT ${columns} FROM files WHERE removed_at IS NULL AND (filename,id) > (?,?) ORDER BY filename,id LIMIT 100`);
  assert.deepEqual(keyset.all(cursor.filename,cursor.id).map(f=>f.id),expected.deep);
  report.queries.keyset=await repeat(()=>keyset.all(cursor.filename,cursor.id));
  const offset=sqlite.prepare(`SELECT ${columns} FROM files WHERE removed_at IS NULL ORDER BY filename,id LIMIT 100 OFFSET 90000`);
  report.queries.offsetSameProjection=await repeat(()=>offset.all());
  report.queries.keysetPlan=sqlite.prepare('EXPLAIN QUERY PLAN SELECT id,filename FROM files WHERE removed_at IS NULL AND (filename,id) > (?,?) ORDER BY filename,id LIMIT 100').all(cursor.filename,cursor.id);
  sqlite.close();await save();
  await writeFile('benchmarks/performance/latest.json',JSON.stringify(report,null,2));
  const supplemental=spawnSync(process.execPath,['scripts/performance/scan-scale.mjs'],{encoding:'utf8',windowsHide:true});
  if(supplemental.status!==0)throw Error(supplemental.stderr);
  console.log('DONE',path.join(root,'results.json'));
}
