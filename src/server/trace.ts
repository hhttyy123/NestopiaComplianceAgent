import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { getDb } from './db';
const context=new AsyncLocalStorage<string>();
export const withTrace=<T>(id:string,work:()=>T)=>context.run(id,work);
export function trace(kind:string,summary:string,payload:unknown){
  const id=context.getStore();if(!id)return;
  getDb().prepare('INSERT INTO research_trace VALUES (?,?,?,?,?,?)').run(randomUUID(),id,new Date().toISOString(),kind,summary,JSON.stringify(payload));
}
export function traceFor(id:string){return getDb().prepare('SELECT * FROM research_trace WHERE run_id=? ORDER BY created_at,rowid').all(id).map(r=>({id:String(r.id),run_id:String(r.run_id),created_at:String(r.created_at),kind:String(r.kind),summary:String(r.summary),payload:JSON.parse(String(r.payload))}));}
