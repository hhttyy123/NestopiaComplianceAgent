import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import assert from 'node:assert/strict';

mkdirSync('tmp', { recursive: true });
const dataDir = mkdtempSync(path.resolve('tmp/http-test-'));
const socket = net.createServer();
await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve));
const port = socket.address().port;
await new Promise(resolve => socket.close(resolve));
const base = `http://127.0.0.1:${port}`;
let child;
let output = '';
async function start() {
  child = spawn(process.execPath, [path.resolve('node_modules/next/dist/bin/next'), 'start', '--hostname', '127.0.0.1', '--port', String(port)], { env: { ...process.env, DATA_DIR: dataDir, DEEPSEEK_API_KEY:'' }, stdio: ['ignore','pipe','pipe'], windowsHide: true });
  child.stdout.on('data', chunk => { output += chunk; }); child.stderr.on('data', chunk => { output += chunk; });
  for (let i=0;i<100;i++) {
    if (child.exitCode !== null) throw new Error(`Server exited: ${output}`);
    try { const res = await fetch(`${base}/api/health`); if (res.ok) return; } catch { /* starting */ }
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  throw new Error(`Server readiness timeout: ${output}`);
}
async function stop() { if (child && child.exitCode === null) { const exited = new Promise(resolve => child.once('exit', resolve)); child.kill(); await exited; } }
async function maintenance(args) {
  const task=spawn(process.execPath,[path.resolve('node_modules/tsx/dist/cli.mjs'),path.resolve('scripts/knowledge.ts'),...args],{env:{...process.env,DATA_DIR:dataDir},stdio:['ignore','pipe','pipe'],windowsHide:true});
  let log=''; task.stdout.on('data',x=>{log+=x;}); task.stderr.on('data',x=>{log+=x;});
  const code=await new Promise((resolve,reject)=>{ task.on('error',reject); task.on('exit',resolve); });
  assert.equal(code,0,log); return log;
}
async function call(route, method='GET', body, expected=200, extra={}) {
  const res = await fetch(`${base}/api/${route}`, { method, headers: { ...(body === undefined ? {} : {'Content-Type':'application/json'}), ...extra }, body: body === undefined ? undefined : JSON.stringify(body) });
  const value = await res.json(); assert.equal(res.status, expected, `${route}: ${JSON.stringify(value)}`); return value;
}
try {
  await start();
  const home = await fetch(base); assert.equal(home.status,200); assert.match(await home.text(), /Nestopia/);
  assert.equal((await call('projects')).length,0);
  await call('demo','POST',{}); const projects = await call('projects'); assert.equal(projects.length,4);
  const p = projects.find(p=>p.latestReview.result.conclusion==='CONFLICT');
  const original = p.latestReview;
  await call(`projects/${p.id}`,'PATCH',{input:original.input,expectedRevision:99},409);
  await call(`projects/${p.id}`,'PATCH',{input:{...original.input,aduArea:1200},expectedRevision:1});
  assert.equal((await call(`reviews/${original.id}`)).stale,true);
  const r = await call(`projects/${p.id}/reviews`,'POST',{expectedRevision:2,requestKey:'http-corrected'},201);
  assert.equal(r.result.conclusion,'PRELIMINARY_PASS');
  const duplicate = await call(`projects/${p.id}/reviews`,'POST',{expectedRevision:2,requestKey:'http-corrected'},201); assert.equal(duplicate.id,r.id);
  const explanation=await call(`reviews/${r.id}/explanation`,'POST',{}); assert.equal(explanation.status,'FALLBACK');
  assert.equal((await call(`reviews/${r.id}`)).aiExplanation.status,'FALLBACK');
  await call(`reviews/${r.id}/notes`,'POST',{actor:'HTTP模拟审核人',kind:'判断纠错',itemId:'area',text:'根据模拟图纸修正录入值',evidence:'HTTP测试材料'},201);
  await call(`reviews/${r.id}/notes`,'POST',{actor:'A',kind:'判断纠错',itemId:'other',text:'x',evidence:'y'},400);
  const change=await call('knowledge-changes','POST',{reviewId:r.id,actor:'HTTP模拟维护者',proposal:'测试规则建议'},201);
  await call('knowledge-controls','POST',{blocked:true,reason:'测试停用',actor:'HTTP模拟维护者'});
  const stopped = await call(`projects/${p.id}/reviews`,'POST',{expectedRevision:2,requestKey:'http-blocked'},201); assert.equal(stopped.result.conclusion,'PROFESSIONAL_REVIEW');
  assert.equal((await call(`reviews/${original.id}`)).result.conclusion,'CONFLICT');
  await call('knowledge-controls','POST',{blocked:false,reason:'测试恢复',actor:'HTTP模拟维护者'});
  await call('projects','POST',original.input,403,{Origin:'https://untrusted.example'});
  await call('projects','POST',{...original.input,aduArea:-1},400);
  const unsupported = await call('projects','POST',{...original.input,name:'范围外模拟',state:'California'},201);
  const outside = await call(`projects/${unsupported.id}/reviews`,'POST',{expectedRevision:1,requestKey:'outside'},201); assert.equal(outside.result.scope,'UNSUPPORTED'); assert.equal(outside.result.conclusion,null);
  const beforeKnowledge=await call('knowledge');
  await stop();
  const packFile=path.join(dataDir,'maintenance-pack.json');
  await maintenance(['export','--file',packFile]);
  const pack=JSON.parse(readFileSync(packFile,'utf8')); pack.id='HTTP-TEST-r2';
  writeFileSync(packFile,JSON.stringify(pack));
  await maintenance(['validate','--file',packFile]);
  await maintenance(['verify-change','--id',change.id,'--actor','HTTP模拟核实人','--evidence','模拟核实凭据']);
  await maintenance(['publish','--file',packFile,'--expected-release',beforeKnowledge.release,'--actor','HTTP模拟发布人','--evidence','隔离验收资料','--change',change.id]);
  await start();
  assert.equal((await call(`reviews/${r.id}`)).notes.length,1);
  assert.equal((await call(`reviews/${r.id}`)).aiExplanation.status,'FALLBACK');
  assert.equal((await call(`projects/${p.id}/reviews`)).length,3);
  assert.equal((await call('knowledge')).changes.length,1);
  assert.equal((await call('knowledge')).release,pack.id);
  assert.equal((await call('knowledge')).changes[0].status,'已发布');
  const historical=await call(`reviews/${r.id}`); assert.deepEqual(historical.result,r.result); assert.equal(historical.knowledgeBlocked,true);
  await call(`reviews/${r.id}/explanation`,'POST',{},409);
  const renewed=await call(`projects/${p.id}/reviews`,'POST',{expectedRevision:2,requestKey:'new-knowledge'},201);
  assert.equal(renewed.result.release,pack.id); assert.equal(renewed.result.knowledgeHash,(await call('knowledge')).hash);
  console.log('HTTP验收通过：项目修订、预审、幂等、人工意见、规则停用、跨站拦截、范围外、知识核实与发布、新版本重审、历史保留及重启持久化。');
  console.log(`隔离测试数据：${dataDir}`);
} finally { await stop(); }
