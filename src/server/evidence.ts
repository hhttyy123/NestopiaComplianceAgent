import { z } from 'zod';
import { getDb } from './db';
import { digest } from './research-store';
import { provider,ResearchError } from './provider';
import type { Evidence,ResearchRun } from '../domain/research';
import { trace } from './trace';
import {readOfficialPdf} from './pdf-source';
import {decisionParagraphs} from './source-catalog';
export function officialUrl(raw:string){try{const u=new URL(raw);if(u.protocol!=='https:'||u.username||u.password||u.port||u.hash)return false;const h=u.hostname.toLowerCase();return h.endsWith('.gov')||h.endsWith('.gov.uk')||h.endsWith('.gc.ca')||h==='montgomeryplanning.org'||h.endsWith('.montgomeryplanning.org')||h==='codelibrary.amlegal.com'&&u.pathname.startsWith('/codes/montgomerycounty/');}catch{return false;}}
const fresh=(date:string,hours:number)=>{const age=Date.now()-Date.parse(date);return Number.isFinite(age)&&age>=0&&age<hours*3600000;};
export function caseUrl(raw:string){if(officialUrl(raw))return true;try{const u=new URL(raw),h=u.hostname.toLowerCase();return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&!u.hash&&/^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(h)&&/\.(com|org|net|edu|ca|us|house|ai|co|news)$/.test(h)&&!/(^|\.)(localhost|local|internal|test|invalid)(\.|$)/.test(h);}catch{return false;}}
export async function search(query:string,refresh:boolean,run:ResearchRun,kind:'REGULATION'|'CASE'='REGULATION'){
  const cacheKey=kind==='CASE'?'CASE-v2:'+query:query;const allowed=kind==='CASE'?caseUrl:officialUrl;
  const cached=getDb().prepare('SELECT payload,checked_at FROM research_queries WHERE query=?').get(cacheKey);
  if(!refresh&&cached&&fresh(String(cached.checked_at),6)){run.metrics.queryHits++;trace('QUERY_CACHE','复用查询',{query,checkedAt:cached.checked_at,results:JSON.parse(String(cached.payload))});return JSON.parse(String(cached.payload)) as {url:string;title:string}[];}
  const result=z.object({results:z.array(z.object({url:z.string(),title:z.string()}))}).parse(await provider('/v1/tools/search',{query,count:8,need_content:false}));run.metrics.searchRequests++;
  const normalized=result.results.map(r=>{try{const u=new URL(r.url);u.hash='';const match=u.pathname.match(/\/311\/.*Solutions\.aspx/i);if(match)u.pathname='/311/Solutions.aspx';return {...r,url:u.href};}catch{return r;}});const urls=[...new Map(normalized.filter(r=>allowed(r.url)).map(r=>[r.url,r])).values()];trace('SOURCE_FILTER','来源筛选',{query,accepted:urls,rejected:normalized.filter(r=>!allowed(r.url))});getDb().prepare('INSERT INTO research_queries VALUES (?,?,?) ON CONFLICT(query) DO UPDATE SET payload=excluded.payload,checked_at=excluded.checked_at').run(cacheKey,JSON.stringify(urls),new Date().toISOString());return urls;
}
export async function fetchEvidence(url:string,refresh:boolean,run:ResearchRun,kind:'REGULATION'|'CASE'='REGULATION'):Promise<Evidence>{
  if(!(kind==='CASE'?caseUrl(url):officialUrl(url)))throw new ResearchError('SOURCE_NOT_ALLOWED','来源未通过官方域名策略');
  const failed=getDb().prepare('SELECT code,checked_at FROM research_source_failures WHERE url=?').get(url);if(!refresh&&failed&&fresh(String(failed.checked_at),1/12)){trace('SOURCE_UNAVAILABLE','跳过5分钟内不可读的来源',{url,code:failed.code});throw new ResearchError('SOURCE_UNAVAILABLE','该原文近期不可读，继续其他来源');}
  const cached=getDb().prepare('SELECT payload,checked_at FROM research_sources WHERE url=?').get(url);
  if(!refresh&&cached&&JSON.parse(String(cached.payload)).extractionVersion===2&&fresh(String(cached.checked_at),24)){run.metrics.sourceHits++;trace('SOURCE_CACHE','复用原文',{url,checkedAt:cached.checked_at,hash:JSON.parse(String(cached.payload)).hash});return {...JSON.parse(String(cached.payload)),reused:true,sourceKind:kind};}
  let response:unknown;trace('SOURCE_FETCH','获取原文',{url,method:/\.pdf(?:$|[?#])/i.test(url)&&officialUrl(url)?'官方PDF直读':'DeepSeek Fetch'});try{response=/\.pdf(?:$|[?#])/i.test(url)&&officialUrl(url)?await readOfficialPdf(url,officialUrl):await provider('/v1/tools/fetch',{url});}catch(error){if(error instanceof ResearchError&&['PROVIDER_404','PROVIDER_410','PROVIDER_504','PROVIDER_502','PROVIDER_NETWORK','PDF_NETWORK','PDF_HTTP','PDF_FORMAT','PDF_EXTRACT'].includes(error.code))getDb().prepare('INSERT INTO research_source_failures VALUES (?,?,?) ON CONFLICT(url) DO UPDATE SET code=excluded.code,checked_at=excluded.checked_at').run(url,error.code,new Date().toISOString());throw error;}const raw=z.object({rawLayoutContent:z.string().optional(),title:z.string(),content:z.string().min(100).max(2000000),extraction:z.string().optional(),binaryHash:z.string().optional(),originalFile:z.string().optional(),resolvedUrl:z.string().optional()}).parse(response);run.metrics.fetchRequests++;
  getDb().prepare('DELETE FROM research_source_failures WHERE url=?').run(url);
  const hash=digest({url,content:raw.content}),now=new Date().toISOString();const prior=getDb().prepare('SELECT payload FROM research_source_versions WHERE hash=?').get(hash);
  const paragraphs=raw.content.split(/\n\s*\n/).flatMap(p=>{const text=p.trim();if(text.length<40)return [];const result=[];for(let i=0;i<text.length;i+=1600)result.push({id:'',text:text.slice(i,i+1600)});return result;}).map((p,i)=>({...p,id:`${hash.slice(0,16)}-p${i+1}`}));
  if(!paragraphs.length)throw new ResearchError('SOURCE_EMPTY','原文没有可用段落');
  const item:Evidence={extractionVersion:2,sourceKind:kind,id:hash.slice(0,16),url,title:raw.title,hash,fetchedAt:prior?JSON.parse(String(prior.payload)).fetchedAt:now,checkedAt:now,reused:false,paragraphs};
  getDb().transaction(()=>{getDb().prepare('INSERT OR IGNORE INTO research_source_versions VALUES (?,?,?)').run(hash,JSON.stringify({...item,rawContent:raw.content,rawLayoutContent:raw.rawLayoutContent,extraction:raw.extraction||'DeepSeek Fetch Markdown',binaryHash:raw.binaryHash,originalFile:raw.originalFile,resolvedUrl:raw.resolvedUrl}),now);getDb().prepare('INSERT INTO research_sources VALUES (?,?,?) ON CONFLICT(url) DO UPDATE SET payload=excluded.payload,checked_at=excluded.checked_at').run(url,JSON.stringify(item),now);})();trace('SOURCE_SAVED','原文版本已保存',{url,hash,paragraphs:paragraphs.length,table:'research_source_versions',field:'payload.rawContent'});return item;
}
export function selectParagraphs(source:Evidence,queries:string[]){
 const words=[...queries.join(' ').toLowerCase().split(/[^a-z0-9]+/).filter(w=>w.length>3),'effective','amended','repealed','ordinance','permit','days','decision','order','denied'];
 const ranked=source.paragraphs.map((p,index)=>({p,index,score:words.reduce((n,w)=>n+(p.text.toLowerCase().includes(w)?1:0),0)})).sort((a,b)=>b.score-a.score||a.index-b.index);
 // Preserve document identity and final orders/effective-date pages before ranking the middle.
 const must=new Set([0,1,...source.paragraphs.map((_,i)=>i).slice(source.sourceKind==='CASE'?-4:-2)]);
 if(source.sourceKind==='CASE')for(const p of decisionParagraphs(source.paragraphs))must.add(source.paragraphs.indexOf(p));
 const chosen=ranked.filter(p=>must.has(p.index));for(const p of ranked){if(chosen.length>=14)break;if(!must.has(p.index))chosen.push(p);}
 return chosen.sort((a,b)=>a.index-b.index).map(x=>x.p);
}
