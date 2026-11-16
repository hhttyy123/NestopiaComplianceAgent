import { loadEnvConfig } from '@next/env';
import { mkdirSync,mkdtempSync,writeFileSync,readFileSync } from 'node:fs';
import path from 'node:path';
import { initializeDb } from '../src/server/db';
import { startInvestigation,waitInvestigation } from '../src/server/investigation';
import { randomUUID } from 'node:crypto';
import { traceFor } from '../src/server/trace';
loadEnvConfig(process.cwd());
async function main(){
  const args=process.argv.slice(2),flags:Record<string,string>={};for(let i=0;i<args.length;i+=2){if(!['--product','--location','--facts','--input'].includes(args[i])||!args[i+1])throw new Error('需要--product、--location、--facts或--input JSON文件');flags[args[i].slice(2)]=args[i+1];}
  if(!flags.input&&(!flags.product||!flags.location||!flags.facts))throw new Error('必须提供真实调查产品、位置和已知事实');
  const input=flags.input?JSON.parse(readFileSync(flags.input,'utf8')):flags;
  mkdirSync('tmp',{recursive:true});const dir=mkdtempSync(path.resolve('tmp/research-live-'));process.env.DATA_DIR=dir;await initializeDb();
  const records=[];for(let i=0;i<2;i++){const r=startInvestigation({...input,refresh:false},randomUUID());const completed=await waitInvestigation(r.id);records.push({...completed,trace:traceFor(r.id)});console.log(JSON.stringify({round:i+1,id:r.id,status:completed.status,error:completed.error,sources:completed.evidence.length,metrics:completed.metrics,experienceIds:completed.experienceIds,categories:completed.analysis?.findings.map(f=>f.category),traceEvents:traceFor(r.id).length},null,2));if(completed.status!=='COMPLETE'){process.exitCode=1;break;}}
  writeFileSync(path.join(dir,'acceptance.json'),JSON.stringify(records,null,2));console.log(`验收记录：${dir}`);
}
main().catch(e=>{console.error(e instanceof Error?e.message:'验收未完成');process.exitCode=1;});
