import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
export type LockOwner={pid:number;identity:string;token:string};
export function processIdentity(pid:number){
  if(!Number.isInteger(pid)||pid<1)return null;
  try{
    if(process.platform==='win32')return execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',`(Get-Process -Id ${pid} -ErrorAction Stop).StartTime.ToUniversalTime().Ticks`],{encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','ignore']}).trim();
    if(process.platform==='linux')return readFileSync(`/proc/${pid}/stat`,'utf8').split(') ')[1].split(' ')[19];
    return execFileSync('ps',['-p',String(pid),'-o','lstart='],{encoding:'utf8'}).trim()||null;
  }catch{return null;}
}
export function lockIsAlive(raw:string){
  try{const owner=JSON.parse(raw) as LockOwner|number;if(typeof owner==='number'){
    // Legacy locks recorded only a PID. Refuse live Node owners; unrelated
    // processes demonstrate PID reuse and must never be terminated.
    try{process.kill(owner,0);}catch{return false;}
    if(process.platform==='win32'){try{return execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',`(Get-Process -Id ${owner} -ErrorAction Stop).ProcessName`],{encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','ignore']}).trim().toLowerCase()==='node';}catch{return true;}}
    return true;
  }
  const current=processIdentity(owner.pid);if(current&&owner.identity)return current===owner.identity;
  try{process.kill(owner.pid,0);return true;}catch{return false;}
  }catch{throw new Error('数据库锁记录损坏，请先确认没有其他服务使用此数据目录');}
}
