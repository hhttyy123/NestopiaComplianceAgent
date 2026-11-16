import { dimensions,permitGroups,timelineDays,type Evaluation } from '../domain/evaluation';
import type { Evidence,ResearchRun } from '../domain/research';
import { ResearchError } from './provider';
import type {ProjectDetails} from '../domain/project';
import {validateFactBindings,validateDurationText} from './quality';
export function validateAssessment(e:Pick<Evaluation,'checks'|'permits'>,findings:NonNullable<ResearchRun['analysis']>['findings'],sources:Evidence[],details?:ProjectDetails){
 const fail=(message:string)=>{throw new ResearchError('INVALID_EVALUATION',message,{findings:findings.map((f,index)=>({index,category:f.category,topic:f.topic,citations:f.citations})),instruction:'findingIndexes只能取这里存在的编号；checks与permits必须各覆盖全部固定key一次。事实不足用NEEDS_INPUT，许可适用性不足用VERIFY。'});};
 if(new Set(e.checks.map(c=>c.key)).size!==dimensions.length||new Set(e.permits.map(p=>p.key)).size!==permitGroups.length)fail('评价与许可必须完整覆盖固定维度，不得重复');
 const indexes=(ids:number[])=>{if(ids.some(i=>!findings[i]))fail('评价引用的findingIndexes越界');};
 const official=(ids:number[])=>ids.some(i=>findings[i].citations.some(c=>sources.some(s=>s.sourceKind!=='CASE'&&s.paragraphs.some(p=>p.id===c.paragraphId))));
 for(const c of e.checks){indexes(c.findingIndexes);if(c.status!=='NEEDS_INPUT'&&!official(c.findingIndexes))fail(c.key+'合格、不合格或不适用结论需要官方依据');if((c.status==='PASS'||c.status==='FAIL')&&!c.observed)fail(c.key+'必须提供用户已提交的实际条件，法规要求本身不代表已符合');if(c.status==='FAIL'&&(!c.clause||!c.reason))fail(c.key+'不合格必须列条款与理由');if(c.status==='NEEDS_INPUT'&&!c.reason)fail(c.key+'需明确待补资料');}
 for(const p of e.permits){indexes(p.findingIndexes);if(p.required!=='VERIFY'&&!official(p.findingIndexes))fail(p.key+'许可适用性需要官方依据');if(p.after.includes(p.key))fail('许可不能依赖自身');}
 const visited=new Set<string>(),active=new Set<string>();function visit(key:string){if(active.has(key))fail('许可依赖成环');if(visited.has(key))return;active.add(key);for(const id of e.permits.find(p=>p.key===key)!.after)visit(id);active.delete(key);visited.add(key);}for(const p of e.permits)visit(p.key);
 if(details)validateFactBindings(e,details,findings);
}
export function validateTimeline(timeline:Evaluation['timeline'],permits:Evaluation['permits'],findings:NonNullable<ResearchRun['analysis']>['findings'],sources:Evidence[]){
 const e={timeline,permits};const fail=(message:string)=>{throw new ResearchError('INVALID_EVALUATION',message,{findings:findings.map((f,index)=>({index,category:f.category,topic:f.topic,citations:f.citations})),instruction:'findingIndexes只能取这里存在的编号；时间案例和有数值阶段只能取TIMELINE且citations非空的编号。如没有，cases置空、阶段改UNAVAILABLE/null。'});};const indexes=(ids:number[])=>{if(ids.some(i=>!findings[i]))fail('流程引用的findingIndexes越界');};
 for(const c of e.timeline.cases){indexes(c.findingIndexes);if(!c.findingIndexes.some(i=>findings[i].category==='TIMELINE'&&findings[i].citations.length))fail('真实案例需要时间原文引用');}
 for(const s of e.timeline.stages){indexes(s.findingIndexes);if(s.basis==='UNAVAILABLE'){if(s.minDays!==null||s.maxDays!==null)fail('无依据阶段不得填写时间');}else{if(s.minDays===null||s.maxDays===null||!s.reason||!s.findingIndexes.some(i=>findings[i].category==='TIMELINE'&&findings[i].citations.length))fail('阶段估算须有时间引用和推算说明');if(s.basis==='OFFICIAL'&&s.findingIndexes.every(i=>findings[i].citations.every(c=>!sources.some(source=>source.sourceKind==='REGULATION'&&source.paragraphs.some(p=>p.id===c.paragraphId)))))fail('官方时长不得仅引用案例');validateDurationText(s);}}
 for(const p of e.permits.filter(p=>p.required==='YES'))if(!e.timeline.stages.some(s=>s.permitKeys.includes(p.key)))fail(p.key+'所需许可未纳入流程');
 try{timelineDays(e.timeline);}catch(error){fail(error instanceof Error?error.message:'流程错误');}
}

export function validateEvaluation(e:Evaluation,findings:NonNullable<ResearchRun['analysis']>['findings'],sources:Evidence[]){validateAssessment(e,findings,sources);validateTimeline(e.timeline,e.permits,findings,sources);}
