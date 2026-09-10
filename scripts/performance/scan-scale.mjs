// Supplemental scratch-database measurements. Run after run.mjs.
import { readFile, writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import path from 'node:path';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
const report=JSON.parse(await readFile('benchmarks/performance/latest.json','utf8'));
const scratch=path.resolve(report.root);
assert(scratch.startsWith(path.resolve('benchmarks/performance')+path.sep));
const {createDatabaseConnection,SqliteAudioFileRepository}=await import(pathToFileURL(path.resolve('benchmarks/performance/generated.mjs')));
const {sqlite}=createDatabaseConnection(path.join(scratch,'queries.sqlite'));
const repo=new SqliteAudioFileRepository(sqlite);
const measure=(fn)=>{const samples=[];for(let i=0;i<5;i++){const t=performance.now();fn(i);samples.push(performance.now()-t);}return {samples,median:[...samples].sort((a,b)=>a-b)[2]};};
report.scanScale={rows:100000};
report.scanScale.loadAllRecords=measure(()=>assert.equal(repo.getAllFilesIncludingRemoved().length,100000));
report.scanScale.loadRemovalFields=measure(()=>assert.equal(repo.getScanCleanupRows().length,100000));
const records=Array.from({length:10000},(_,i)=>({path:`/fixture/${i}.wav`,codec:'PCM',duration:i%300,sampleRate:48000,bitDepth:16,channels:2,fileSize:19244}));
report.scanScale.metadataWrite10000={};
report.scanScale.touch10000ByIndex={};
const touch=records.map(record=>({path:record.path,libraryRoot:'/fixture'}));
const touchPaths=records.map(record=>record.path);
for(const mode of ['without-sort-indexes','filename-only','with-sort-indexes']){
 if(mode==='without-sort-indexes')sqlite.exec('DROP INDEX IF EXISTS bench_active_filename; DROP INDEX IF EXISTS bench_active_duration;');
 if(mode==='filename-only')sqlite.exec('CREATE INDEX bench_active_filename ON files(filename,id) WHERE removed_at IS NULL;');
 if(mode==='with-sort-indexes')sqlite.exec('CREATE INDEX bench_active_duration ON files((duration IS NULL),duration,filename,id) WHERE removed_at IS NULL;');
 repo.batchUpdateFileMetadata(records,new Date().toISOString());
 report.scanScale.metadataWrite10000[mode]=measure(i=>{for(const record of records)record.duration+=1;repo.batchUpdateFileMetadata(records,new Date(Date.now()+i*1000).toISOString());});
 report.scanScale.touch10000ByIndex[mode]=measure(i=>repo.batchTouchFiles(touch,new Date(Date.now()+i*1000).toISOString()));
}
// Fixture rows are active and ownership is unchanged. The production
// timestamp-only touch preserves both timestamps without rewriting
// removed_at or library_root.
report.scanScale.unchangedTouchCandidate=measure(i=>repo.batchTouchActiveFiles(touchPaths,new Date(Date.now()+i*1000).toISOString()));
sqlite.close();
await writeFile(path.join(scratch,'results.json'),JSON.stringify(report,null,2));
await writeFile('benchmarks/performance/latest.json',JSON.stringify(report,null,2));
console.log(JSON.stringify(report.scanScale,null,2));
