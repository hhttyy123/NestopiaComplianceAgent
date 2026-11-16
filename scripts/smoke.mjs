import { spawn } from 'node:child_process';
import { mkdtempSync,mkdirSync } from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
mkdirSync('tmp',{recursive:true});const dir=mkdtempSync(path.resolve('tmp/research-http-'));
const socket=net.createServer();await new Promise(r=>socket.listen(0,'127.0.0.1',r));const port=socket.address().port;await new Promise(r=>socket.close(r));const base=`http://127.0.0.1:${port}`;let child,log='',activeAuth='';
async function start(password=''){activeAuth=password?'Basic '+Buffer.from('nestopia:'+password).toString('base64'):'';child=spawn(process.execPath,[path.resolve('node_modules/next/dist/bin/next'),'start','--hostname','127.0.0.1','--port',String(port)],{env:{...process.env,DATA_DIR:dir,DEEPSEEK_API_KEY:'',APP_ORIGIN:base,ACCESS_USER:'nestopia',ACCESS_PASSWORD:password},stdio:['ignore','pipe','pipe'],windowsHide:true});child.stdout.on('data',x=>{log+=x;});child.stderr.on('data',x=>{log+=x;});for(let i=0;i<100;i++){if(child.exitCode!==null)throw Error(log);try{if((await fetch(base+'/api/health',{headers:activeAuth?{authorization:activeAuth}:{}})).ok)return;}catch{}await new Promise(r=>setTimeout(r,150));}throw Error('Server readiness timeout: '+log);}
async function stop(){if(child?.exitCode===null){const exit=new Promise(r=>child.once('exit',r));child.kill();await exit;}}
async function call(url,method='GET',body,expected=200,extra={}){const r=await fetch(base+'/api/'+url,{method,headers:{...(activeAuth?{authorization:activeAuth}:{}),...(body?{'Content-Type':'application/json'}:{}),...extra},body:body?JSON.stringify(body):undefined});const value=await r.json();assert.equal(r.status,expected,JSON.stringify(value));return value;}
try{await start();assert.equal((await fetch(base)).status,200);assert.equal((await call('investigations')).length,0);assert.equal((await call('health')).version,'research-v2');
  await call('demo','POST',{},404);await call('projects','GET',undefined,404);
  const details={product:'ADU（附属住宅）',method:'新建独立建筑',country:'United States',state:'Maryland',county:'Montgomery County',unit:'IMPERIAL',purpose:'尚未确定',water:'UNKNOWN',sewer:'UNKNOWN',flood:'UNKNOWN',historic:'UNKNOWN',hoa:'UNKNOWN',existingHome:'UNKNOWN'};
  const input={product:'ADU',location:'Montgomery County, Maryland',facts:'Transport checks only',details,refresh:false},requestKey=randomUUID();
  await call('investigations','POST',{input,requestKey},403,{Origin:'https://untrusted.invalid'});
  await call('investigations','POST',{input:{...input,location:''},requestKey},400);
  const run=await call('investigations','POST',{input,requestKey},202);const again=await call('investigations','POST',{input,requestKey},202);assert.equal(again.id,run.id);
  await call('investigations','POST',{input:{...input,details:{...details,notes:'changed'}},requestKey},409);
  let result;for(let i=0;i<20;i++){result=await call(`investigations/${run.id}`);if(result.status!=='RUNNING')break;await new Promise(r=>setTimeout(r,100));}
  assert.equal(result.status,'FAILED');assert.match(result.error,/AI_NOT_CONFIGURED/);assert.equal(result.analysis,undefined);
  await call(`investigations/${run.id}/feedback`,'POST',{kind:'NOTE',text:'Transport verification record'},201);
  assert.equal((await fetch(base+'/api/developer')).status,404);assert.equal((await fetch(base+'/?view=developer')).status,404);const html=await (await fetch(base)).text();assert.ok(!html.includes('开发者'));assert.ok(html.includes('合规性检查'));
  await call('investigations','POST',{input:{...input,details:{...details,state:'California'}},requestKey:randomUUID()},400);
  await call(`investigations/${randomUUID()}`,'GET',undefined,404);
  await stop();await start();const restored=await call(`investigations/${run.id}`);assert.equal(restored.status,'FAILED');assert.equal(restored.feedback.length,1);
  await call(`investigations/${run.id}`,'DELETE',{},403,{Origin:'https://untrusted.invalid'});
  await call(`investigations/${run.id}`,'DELETE',{});assert.equal((await call('investigations')).length,0);await call(`investigations/${run.id}`,'GET',undefined,404);
  await stop();await start();assert.equal((await call('investigations')).length,0);await call(`investigations/${run.id}/restore`,'POST',{});assert.equal((await call(`investigations/${run.id}`)).feedback.length,1);
  assert.equal((await call('investigations')).length,1);await stop();await start('isolated-http-password-over-twenty');assert.equal((await fetch(base)).status,401);assert.equal((await fetch(base+'/api/health')).status,401);assert.equal((await call('health')).ok,true);assert.equal((await fetch(base,{headers:{authorization:'Basic '+Buffer.from('nestopia:wrong').toString('base64')}})).status,401);console.log('HTTP验收通过：主页、旧入口移除、输入验证、同源限制、幂等与冲突、明确失败、开发者彻底移除、范围限制、反馈保存及重启恢复。');console.log(`隔离数据：${dir}`);
}finally{await stop();}
