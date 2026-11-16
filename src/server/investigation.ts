import {bindFacts,reviewAnalysis,applyReview} from './quality';
import {discoverySources,isAdministrativeCase,decisionParagraphs} from './source-catalog';
import { evaluationSchema } from '../domain/evaluation';
import { structuredOutput } from './structured-output';
import { validateEvaluation,validateAssessment,validateTimeline } from './evaluation';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { researchInput,analysisSchema,answerStructureVersion,type ResearchRun,type Evidence } from '../domain/research';
import { getDb } from './db';
import { digest,saveRun,readRun,listRuns,experiences } from './research-store';
import { search,fetchEvidence,selectParagraphs } from './evidence';
import { modelJson,ResearchError } from './provider';
import { trace,withTrace } from './trace';
import { planningPrompt,analysisPrompt,evaluationInstructions,releaseInstructions,promptVersion } from './prompts';
const pending=new Map<string,Promise<void>>();
export function validateAnalysis(raw:unknown,evidence:Evidence[]){const result=analysisSchema.parse(raw);if(result.answers){const seen=new Set<string>();for(const answer of result.answers){if(seen.has(answer.category))throw new ResearchError('INVALID_ANSWER','核心回答类别重复');seen.add(answer.category);for(const index of answer.findingIndexes){const finding=result.findings[index];if(!finding)throw new ResearchError('INVALID_ANSWER','核心回答引用事项不匹配',{answer,index,findings:result.findings.map((f,index)=>({index,category:f.category,topic:f.topic})),instruction:'重新按当前findings的零起始位置生成findingIndexes，不得沿用重排前的编号。'});}if(!answer.findingIndexes.some(i=>result.findings[i].category===answer.category))throw new ResearchError('INVALID_ANSWER','核心回答没有引用本类别事项',{answer,findings:result.findings.map((f,index)=>({index,category:f.category,topic:f.topic})),instruction:'findingIndexes必须至少包含本类别的事项索引，可另含其他类别作为辅助依据。重新按当前findings的零起始位置生成编号。'});if(answer.basis==='ESTIMATE'&&(!answer.answer.includes('预估')||!answer.conditions.length))throw new ResearchError('INVALID_ANSWER','预估必须注明预估并列出计算前提');if(answer.basis!=='INPUT_REQUIRED'&&!answer.findingIndexes.some(i=>result.findings[i].citations.length))throw new ResearchError('INVALID_ANSWER','结论或预估缺少引用依据');}}if(result.evaluation)validateEvaluation(result.evaluation,result.findings,evidence);const paragraphs=new Map(evidence.flatMap(e=>e.paragraphs.map(p=>[p.id,p.text] as const)));const normalize=(s:string)=>s.replace(/\s+/g,' ').trim();const problems:{code:string;message:string;topic:string;paragraphId?:string;rejectedQuote?:string;original?:string|null}[]=[];
 for(const item of result.findings){if(item.status!=='UNKNOWN'&&!item.citations.length)problems.push({code:'UNCITED_FINDING',message:'建议缺少原文引用',topic:item.topic});
 for(const cite of item.citations){const original=paragraphs.get(cite.paragraphId);if(item.category!=='TIMELINE'&&item.category!=='OTHER'&&evidence.some(e=>e.sourceKind==='CASE'&&e.paragraphs.some(p=>p.id===cite.paragraphId)))problems.push({code:'CASE_AS_LAW',message:'案例不能用于法规与许可判断',topic:item.topic,paragraphId:cite.paragraphId,rejectedQuote:cite.quote,original:original||null});
 if(!original||!normalize(original).includes(normalize(cite.quote)))problems.push({code:'INVALID_CITATION',message:'引用与获取的原文不匹配',topic:item.topic,paragraphId:cite.paragraphId,rejectedQuote:cite.quote,original:original||null});}}
 if(problems.length)throw new ResearchError(problems[0].code,problems[0].message,{...problems[0],errors:problems.slice(0,24),instruction:'一次修复errors里的全部问题。quote必须是original的连续片段；paragraphId不存在时使用evidence中真实ID，不得自己编序号。缺适用法规时UNKNOWN且移除错误引用，禁止用历史个案或初检报告当现行法规。'});return result;}

export function startInvestigation(raw:unknown,requestKey:string){
  const input=researchInput.parse(raw),hash=digest(input);
  if(input.parentId)readRun(input.parentId);const row=getDb().prepare('SELECT payload,input_hash FROM research_runs WHERE request_key=?').get(requestKey);
  if(row){if(row.input_hash!==hash)throw new ResearchError('REQUEST_CONFLICT','重复请求标识对应的输入不同');return JSON.parse(String(row.payload)) as ResearchRun;}
  if(pending.size>=2)throw new ResearchError('BUSY','已有两个调查正在处理，请稍后重试');
  const now=new Date().toISOString();const run:ResearchRun={id:randomUUID(),requestKey,input,status:'RUNNING',phase:'理解项目',createdAt:now,updatedAt:now,evidence:[],queries:[],warnings:[],metrics:{searchRequests:0,fetchRequests:0,queryHits:0,sourceHits:0},experienceIds:[],model:process.env.DEEPSEEK_MODEL?.trim()||'deepseek-flash',version:promptVersion,answerStructureVersion};
  getDb().prepare('INSERT INTO research_runs VALUES (?,?,?,?,?)').run(run.id,requestKey,hash,JSON.stringify(run),now);const task=withTrace(run.id,()=>execute(run)).finally(()=>pending.delete(run.id));pending.set(run.id,task);return run;
}
async function execute(run:ResearchRun){try{
  trace('INPUT','项目输入已保存',{input:run.input,promptVersion});
  const prior=experiences(run.input.product,run.input.location,run.input.details);run.experienceIds=prior.map(p=>p.id);trace('EXPERIENCE','本次实际使用的经验',{prior,parentId:run.input.parentId});
  const previous=listRuns().find(r=>r.status==='COMPLETE'&&r.version===promptVersion&&r.plan&&r.input.product===run.input.product&&r.input.location===run.input.location&&r.input.facts===run.input.facts&&Date.now()-Date.parse(r.createdAt)<6*3600000);
  const planSchema=z.object({jurisdiction:z.string().min(1),queries:z.array(z.string().min(5).max(128)).min(2).max(5),missing:z.array(z.string()),issues:z.array(z.string()).min(1)});
  const reusePlan=!!(!run.input.refresh&&previous?.plan&&planSchema.safeParse(previous.plan).success);
  const plan=run.checkpoint?.base&&run.plan?run.plan:reusePlan&&previous?.plan?{...previous.plan,queries:[...previous.plan.queries]}:await structuredOutput('plan',planSchema,planningPrompt+releaseInstructions,{project:run.input,prior,date:new Date().toISOString().slice(0,10)});
  trace('PLAN',reusePlan?'复用检索计划':'生成检索计划',{plan,reused:reusePlan});
  run.plan=plan;if(!run.checkpoint?.base)run.queries=[...plan.queries];
  if(!run.checkpoint?.base){run.phase='检索官方资料';saveRun(run);const urls=new Map<string,string>([...(run.input.details?.referenceUrls||[]),...discoverySources].map(url=>[url,'待核实官方来源入口']));
  for(const query of plan.queries){try{for(const item of await search(query,run.input.refresh,run))urls.set(item.url,item.title);}catch(e){run.warnings.push(e instanceof ResearchError?e.message:'部分检索失败');}}
  run.phase='获取并保存原文';saveRun(run);
  for(const url of [...urls.keys()].slice(0,20)){if(run.evidence.filter(e=>e.sourceKind!=='CASE').length>=10)break;if(run.evidence.some(e=>e.url===url))continue;try{run.evidence.push(await fetchEvidence(url,run.input.refresh,run,isAdministrativeCase(url)?'CASE':'REGULATION'));}catch{run.warnings.push(`无法获取原文：${url}`);}saveRun(run);}
  run.phase='检索真实审批案例';saveRun(run);
  const place=(run.input.details?[run.input.details.county,run.input.details.state].join(' '):run.input.location).slice(0,65);const product='ADU';
  const caseQueries=[`${place} ${product} permit timeline case study`,`${place} ${product} permit application approval dates decision`,`${place} detached ADU official average permitting days DHCA DPS`].map(q=>q.slice(0,128));
  const cases=new Map<string,string>();for(const query of caseQueries){run.queries.push(query);try{for(const item of await search(query,run.input.refresh,run,'CASE'))cases.set(item.url,item.title);}catch{run.warnings.push('部分案例检索失败');}}
  for(const url of [...cases.keys()].filter(url=>!run.evidence.some(e=>e.url===url)).sort((a,b)=>Number(/case study|real client|case studies|approved/i.test(cases.get(b)||''))-Number(/case study|real client|case studies|approved/i.test(cases.get(a)||''))).slice(0,7)){if(run.evidence.filter(e=>e.sourceKind==='CASE').length>=4)break;try{run.evidence.push(await fetchEvidence(url,run.input.refresh,run,'CASE'));}catch{run.warnings.push('案例原文未能获取：'+url);}saveRun(run);}
  }
  if(!run.evidence.some(e=>e.sourceKind==='REGULATION'))throw new ResearchError('NO_EVIDENCE','未获取可核验的官方原文，未生成建议。请补充位置或调整信息');
  const selected=run.evidence.map(e=>({...e,paragraphs:selectParagraphs(e,plan.queries)}));trace('EVIDENCE_SELECTED','实际送入分析的原文段落',{sources:selected.map(e=>({hash:e.hash,url:e.url,paragraphs:e.paragraphs}))});run.phase='分析适用性并校验引用';saveRun(run);
  const caseDecisions=run.evidence.filter(e=>(run.input.details?.referenceUrls||[]).includes(e.url)&&isAdministrativeCase(e.url)).flatMap(e=>decisionParagraphs(e.paragraphs).map(p=>({url:e.url,...p})));const context={project:run.input,plan,evidence:selected,caseDecisions,prior,date:new Date().toISOString().slice(0,10)};
  const baseSchema=analysisSchema.omit({answers:true,evaluation:true});
  const base=run.checkpoint?.base||await structuredOutput('evidence',baseSchema,analysisPrompt+releaseInstructions+' 本阶段必须把可用于流程估算的官方时长与已提供真实案例的时间事实列为TIMELINE findings并逐字引用，不能只列官方周期未知而忽略案例；后续阶段只能引用这些findings。',context,v=>{validateAnalysis(v,selected);for(const decision of caseDecisions)if(!v.findings.some(f=>f.category==='OTHER'&&f.citations.some(c=>c.paragraphId===decision.id)))throw new ResearchError('MISSING_CASE_OUTCOME','须在OTHER中逐字引用用户所附决定书的最终命令并说明结果',{decision,instruction:'同一决定的多个最终命令段可以合并到同一finding引用，不得只列初检、邮编差异或旧申请。'});if(run.input.details)for(const category of ['BUILDABILITY','PERMITS','TIMELINE'])if(!v.findings.some(f=>f.category===category))throw new ResearchError('MISSING_CATEGORY','必须覆盖建筑、许可与时间');});
  run.checkpoint={...run.checkpoint,base};saveRun(run);
  if(run.input.details){run.phase='生成建筑评价与许可清单';saveRun(run);const indexedFindings=base.findings.map((f,index)=>({index,...f}));
   const assessment=run.checkpoint?.assessment||await structuredOutput('assessment',evaluationSchema.omit({timeline:true}),evaluationInstructions+releaseInstructions,{...context,findings:indexedFindings},v=>{bindFacts(v,run.input.details!);validateAssessment(v,base.findings,selected,run.input.details);});
   run.checkpoint={base,assessment};saveRun(run);
   run.phase='估算许可流程';saveRun(run);
   const timeline=await structuredOutput('timeline',evaluationSchema.shape.timeline,evaluationInstructions+releaseInstructions+' 本阶段唯一时间依据是usableTimingFindings，索引是该字段内的index，不是数组位置。cases和有数字的阶段必须引用其中的index；没有可用条目时cases为空、阶段UNAVAILABLE且minDays和maxDays为null，不得引用其他事项冒充时间依据。',{project:run.input,findings:indexedFindings,usableTimingFindings:indexedFindings.filter(f=>f.category==='TIMELINE'&&f.citations.length),permits:assessment.permits},v=>validateTimeline(v,assessment.permits,base.findings,selected));
   run.analysis={...base,evaluation:{...assessment,timeline}};
   run.phase='复核事实、条文与时间依据';saveRun(run);const review=await reviewAnalysis(run.analysis,run.input,selected);run.quality={checkedAt:new Date().toISOString(),issues:review.issues};run.analysis=applyReview(run.analysis,review);validateAnalysis(run.analysis,selected);validateAssessment(run.analysis.evaluation!,base.findings,selected,run.input.details);trace('QUALITY_REVIEW','独立证据复核与风险降级已保存',{review});
  }else run.analysis=base;
  trace('VALIDATION','全部阶段结构与引用校验通过',{findings:run.analysis.findings.length,analysis:run.analysis});
  trace('COMPLETE','调查结果已保存',{metrics:run.metrics,experienceIds:run.experienceIds});delete run.checkpoint;run.status='COMPLETE';run.phase='检查完成';run.warnings.push('原文经官方PDF直读或DeepSeek Fetch获取并存档；逐字引用校验不证明法律解释正确。','历史调查仅提示问题，不自动成为可信法规。');saveRun(run);
}catch(error){delete run.analysis;delete run.quality;run.status='FAILED';run.phase='调查未完成';run.error=error instanceof ResearchError?`${error.code}：${error.message}`:error instanceof z.ZodError?'外部结果结构校验失败：'+error.issues.map(i=>i.path.join('.')+': '+i.message).join('；'):'执行失败，已保留取得的证据，请重新发起';trace('FAILED','调查失败',{error:run.error});saveRun(run);}}
export async function waitInvestigation(id:string){await pending.get(id);return readRun(id);}
export function recoverInterrupted(){for(const row of getDb().prepare('SELECT payload FROM research_runs').all()){const r=JSON.parse(String(row.payload)) as ResearchRun;if(r.status==='RUNNING'&&!pending.has(r.id)){if(r.version===promptVersion&&pending.size<2){r.phase='恢复检查进度';saveRun(r);const task=withTrace(r.id,()=>execute(r)).finally(()=>pending.delete(r.id));pending.set(r.id,task);}else{r.status='FAILED';r.phase='执行中断';r.error='该检查使用旧版本或恢复容量已满，证据已保留，请重新发起';saveRun(r);}}}}
