import { parseModelJson } from '../src/server/provider';
import { dimensions,permitGroups,timelineDays,timelineLabel,type Evaluation } from '../src/domain/evaluation';
import { validateEvaluation } from '../src/server/evaluation';
import { beforeAll,afterEach,it,expect,vi } from 'vitest';
import { mkdirSync,mkdtempSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { initializeDb,getDb } from '../src/server/db';
import { officialUrl,fetchEvidence,search } from '../src/server/evidence';
import { startInvestigation,waitInvestigation,validateAnalysis,recoverInterrupted } from '../src/server/investigation';
import { feedback,experiences,readRun,deleteRun,restoreRun,listRuns } from '../src/server/research-store';
import type { ResearchRun,Evidence } from '../src/domain/research';
import { projectDetailsSchema,projectStrings,mapsUrl } from '../src/domain/project';
import { researchInput } from '../src/domain/research';

import {bindFacts} from '../src/server/quality';
import { traceFor } from '../src/server/trace';
const input={product:'test-product',location:'test-location',facts:'Unverified facts for automated transport tests',refresh:false};
const paragraph='Official text retained verbatim for the isolated transport verification. No actual legal claim is made here.';
const source:Evidence={id:'hash',url:'https://agency.gov/page',title:'Title',hash:'hash',fetchedAt:new Date().toISOString(),checkedAt:new Date().toISOString(),reused:false,paragraphs:[{id:'paragraph',text:paragraph}]};
const analysis={summary:'无法确认',jurisdiction:'未确认',findings:[{topic:'条件',status:'CONDITIONAL',advice:'以待核实事实为前提',citations:[{paragraphId:'paragraph',quote:paragraph}]}],missing:['地块信息'],nextSteps:['补齐资料'],timing:'没有可靠时间依据'};
beforeAll(async()=>{mkdirSync('tmp',{recursive:true});process.env.DATA_DIR=mkdtempSync(path.resolve('tmp/research-test-'));await initializeDb();});
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();});
function blank():ResearchRun{return {id:randomUUID(),requestKey:randomUUID(),input,status:'RUNNING',phase:'test',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),evidence:[],queries:[],warnings:[],metrics:{searchRequests:0,fetchRequests:0,queryHits:0,sourceHits:0},experienceIds:[],model:'test',version:'test'};}
it('阻止非官方、非HTTPS、凭据和内部地址',()=>{for(const url of ['http://agency.gov','https://127.0.0.1/','https://localhost/','https://agency.gov.evil.com/','https://user:pw@agency.gov/','https://agency.gov:8443/'])expect(officialUrl(url)).toBe(false);expect(officialUrl('https://agency.gov/page')).toBe(true);expect(officialUrl('https://county.gov.uk/page')).toBe(true);});
it('引用必须匹配已获取的逐字原文，非未知事项必须有依据',()=>{expect(validateAnalysis(analysis,[source]).findings).toHaveLength(1);expect(()=>validateAnalysis({...analysis,findings:[{...analysis.findings[0],citations:[{paragraphId:'missing',quote:paragraph}]}]},[source])).toThrow();expect(()=>validateAnalysis({...analysis,findings:[{...analysis.findings[0],citations:[{paragraphId:'paragraph',quote:'Invented legal requirement not in the original'}]}]},[source])).toThrow();expect(()=>validateAnalysis({...analysis,findings:[{...analysis.findings[0],citations:[]}]},[source])).toThrow();});
it('查询与原文复用、强制刷新及不可变版本',async()=>{vi.stubEnv('DEEPSEEK_API_KEY','transport-test-key');const fetcher=vi.fn(async(url:string)=>new Response(JSON.stringify(url.endsWith('/search')?{results:[{url:source.url,title:'Official'}]}:{title:'Official',content:paragraph}),{status:200}));vi.stubGlobal('fetch',fetcher);const r=blank();await search('cache test',false,r);await search('cache test',false,r);expect(r.metrics.searchRequests).toBe(1);expect(r.metrics.queryHits).toBe(1);const a=await fetchEvidence(source.url,false,r);const b=await fetchEvidence(source.url,false,r);expect(b.hash).toBe(a.hash);expect(b.reused).toBe(true);await fetchEvidence(source.url,true,r);expect(r.metrics.fetchRequests).toBe(2);expect(getDb().prepare('SELECT payload FROM research_source_versions WHERE hash=?').get(a.hash)).toBeTruthy();});
it('模型规划、检索、原文获取、分析、反馈及经验复用完整执行',async()=>{vi.stubEnv('DEEPSEEK_API_KEY','transport-test-key');vi.stubGlobal('fetch',vi.fn(async(url:string,init:RequestInit)=>{const body=JSON.parse(String(init.body));if(url.endsWith('/search'))return new Response(JSON.stringify({results:[{url:'https://department.gov/requirements',title:'Requirements'}]}));if(url.endsWith('/fetch'))return new Response(JSON.stringify({title:'Requirements',content:paragraph}));const user=JSON.parse(body.messages[1].content);const value=user.evidence?{...analysis,findings:[{...analysis.findings[0],citations:[{paragraphId:user.evidence[0].paragraphs[0].id,quote:paragraph}]}]}:{jurisdiction:'unknown',queries:['transport requirement search','transport permit search'],missing:['parcel'],issues:['requirements']};return new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify(value)}}]}));}));const key=randomUUID();const r=startInvestigation(input,key);expect(startInvestigation(input,key).id).toBe(r.id);expect(()=>startInvestigation({...input,facts:'different'},key)).toThrow();const done=await waitInvestigation(r.id);expect(done.status).toBe('COMPLETE');expect(done.evidence).toHaveLength(1);expect(done.plan?.queries).toHaveLength(2);feedback(done.id,{kind:'CORRECTION',text:'Prior advice needs reassessment'});expect(experiences(input.product,input.location)[0].feedback[0].kind).toBe('CORRECTION');const next=await waitInvestigation(startInvestigation(input,randomUUID()).id);expect(next.status).toBe('COMPLETE');expect(next.experienceIds).toContain(done.id);expect(next.metrics.sourceHits).toBeGreaterThan(0);expect(next.metrics.queryHits).toBe(5);});
it('网络失败保存失败状态，不生成替代结论',async()=>{vi.stubEnv('DEEPSEEK_API_KEY','transport-test-key');vi.stubGlobal('fetch',vi.fn(async()=>{throw new Error('credential must not leak');}));const r=await waitInvestigation(startInvestigation(input,randomUUID()).id);expect(r.status).toBe('FAILED');expect(r.analysis).toBeUndefined();expect(r.error).not.toContain('credential');});
it('服务中断可恢复为明确失败',()=>{const r=blank();getDb().prepare('INSERT INTO research_runs VALUES (?,?,?,?,?)').run(r.id,r.requestKey,'hash',JSON.stringify(r),r.createdAt);recoverInterrupted();expect(readRun(r.id).status).toBe('FAILED');});
const details=()=>projectDetailsSchema.parse({product:'ADU（附属住宅）',method:'新建独立建筑',country:'United States',state:'Maryland',county:'Montgomery County',unit:'IMPERIAL',purpose:'尚未确定',water:'UNKNOWN',sewer:'UNKNOWN',flood:'UNKNOWN',historic:'UNKNOWN',hoa:'UNKNOWN',existingHome:'UNKNOWN'});
it('结构化输入由服务端统一生成事实，未知保留，零退界不等同未填',()=>{const d={...details(),sideSetback:0,area:800};const r=researchInput.parse({...input,details:d});expect(r.product).toContain('ADU');expect(r.location).toContain('Montgomery County');expect(r.facts).toContain('高度：未知');expect(r.facts).toContain('侧退界：0 英尺');expect(r.facts).toContain('800 平方英尺');expect(r.facts).toContain('官方办理周期');expect(()=>projectDetailsSchema.parse({...d,area:-1})).toThrow();expect(()=>projectDetailsSchema.parse({...d,state:'invented state'})).toThrow();expect(()=>projectDetailsSchema.parse({...d,product:'其他'})).toThrow();expect(mapsUrl('A & B, Maryland')).toContain('query=A%20%26%20B%2C%20Maryland');});
it('实际提示词、返回、证据筛选和校验持久化，开发者能读到；追问保留父报告',async()=>{
  vi.stubEnv('DEEPSEEK_API_KEY','never-store-this-service-key');
  vi.stubGlobal('fetch',vi.fn(async(url:string,init:RequestInit)=>{if(url.endsWith('/search'))return new Response(JSON.stringify({results:[{url:'https://brief.gov/requirements',title:'Official'},{url:'https://untrusted.example/law',title:'Rejected'}]}));if(url.endsWith('/fetch'))return new Response(JSON.stringify({title:'Requirements',content:paragraph}));const request=JSON.parse(String(init.body)),user=JSON.parse(request.messages[1].content);const value=user.stage==='review'?reviewValue(user.report):user.stage==='timeline'?unresolvedEvaluation().timeline:user.evidence?{...analysis,evaluation:unresolvedEvaluation(),answers:['BUILDABILITY','PERMITS','TIMELINE'].map((category,index)=>({category,answer:'先补充适用条件，再确定方案',basis:'INPUT_REQUIRED',conditions:['补充地块'],findingIndexes:[index]})),findings:['BUILDABILITY','PERMITS','TIMELINE'].map(category=>({...analysis.findings[0],category,citations:[{paragraphId:user.evidence[0].paragraphs[0].id,quote:paragraph}]}))}:{jurisdiction:'unknown',queries:['brief transport requirements','brief transport timeline'],missing:['parcel'],issues:['build','permits','timeline']};return new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify(value),reasoning_content:'must-not-store-hidden-reasoning'}}]}));}));
  const d=details(),first=await waitInvestigation(startInvestigation({...projectStrings(d),details:d,refresh:false},randomUUID()).id);expect(first.status).toBe('COMPLETE');
  const events=traceFor(first.id);expect(events.some(e=>e.kind==='PROVIDER_REQUEST'&&e.payload.body.messages)).toBe(true);expect(events.some(e=>e.kind==='SOURCE_FILTER'&&e.payload.rejected.length===1)).toBe(true);expect(events.some(e=>e.kind==='VALIDATION')).toBe(true);const serialized=JSON.stringify(events);expect(serialized).not.toContain('never-store-this-service-key');expect(serialized).not.toContain('must-not-store-hidden-reasoning');
  feedback(first.id,{kind:'CORRECTION',text:'Recheck the prior advice'});const nextD={...d,question:'确认材料清单'},next=await waitInvestigation(startInvestigation({...projectStrings(nextD),details:nextD,parentId:first.id,refresh:false},randomUUID()).id);expect(next.status).toBe('COMPLETE');expect(next.input.parentId).toBe(first.id);expect(readRun(first.id).input.details?.question).toBe('');const prior=traceFor(next.id).find(e=>e.kind==='EXPERIENCE')!.payload.prior.find((p:{id:string})=>p.id===first.id);expect(prior.nextSteps).toEqual([]);
  expect(getDb().prepare('SELECT COUNT(*) AS n FROM research_trace').get()?.n).toBeGreaterThan(0);expect(()=>startInvestigation({...input,parentId:randomUUID()},randomUUID())).toThrow('调查记录不存在');
});
it('不连续引文被拦截并把具体原文传给修复步骤',async()=>{
  vi.stubEnv('DEEPSEEK_API_KEY','isolated-key');
  const text='First continuous sentence describes an explicit requirement. The intervening sentence must not be omitted. Last continuous sentence describes a separate requirement.';
  let repaired=false;
  vi.stubGlobal('fetch',vi.fn(async(url:string,init:RequestInit)=>{
    if(url.endsWith('/search'))return new Response(JSON.stringify({results:[{url:'https://repair.gov/requirements',title:'Official'}]}));
    if(url.endsWith('/fetch'))return new Response(JSON.stringify({title:'Requirements',content:text}));
    const user=JSON.parse(JSON.parse(String(init.body)).messages[1].content);if(!user.evidence)return new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify({jurisdiction:'unknown',queries:['repair continuous quote one','repair continuous quote two'],missing:[],issues:['requirement']})}}]}));
    if(user.validationErrors){expect(user.validationErrors.details.original).toBe(text);expect(user.validationErrors.details.rejectedQuote).not.toBe(text);repaired=true;}
    const quote=user.validationErrors?'Last continuous sentence describes a separate requirement.':'First continuous sentence describes an explicit requirement. Last continuous sentence describes a separate requirement.';
    return new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify({...analysis,findings:[{...analysis.findings[0],citations:[{paragraphId:user.evidence[0].paragraphs[0].id,quote}]}]})}}]}));
  }));
  const r=await waitInvestigation(startInvestigation({...input,product:'repair-test'},randomUUID()).id);expect(r.status).toBe('COMPLETE');expect(repaired).toBe(true);expect(traceFor(r.id).some(e=>e.kind==='VALIDATION_ERROR')).toBe(true);
});

it('直接回答的类别、依据索引及引用约束可检验',()=>{
 const findings=['BUILDABILITY','PERMITS','TIMELINE'].map(category=>({...analysis.findings[0],category}));
 const answers=['BUILDABILITY','PERMITS','TIMELINE'].map((category,index)=>({category,answer:'根据所列依据推进',basis:'EVIDENCE',conditions:[],findingIndexes:[index]}));
 expect(validateAnalysis({...analysis,findings,answers},[source]).answers).toHaveLength(3);
 expect(()=>validateAnalysis({...analysis,findings,answers:[answers[0],answers[0],answers[2]]},[source])).toThrow('类别重复');
 expect(()=>validateAnalysis({...analysis,findings,answers:answers.map(a=>({...a,findingIndexes:[99]}))},[source])).toThrow('不匹配');
 expect(()=>validateAnalysis({...analysis,findings:findings.map(f=>({...f,status:'UNKNOWN',citations:[]})),answers},[source])).toThrow('缺少引用');
});
it('删除可恢复、删除后不读取或复用，正在运行不能删除',()=>{
 const running=blank();getDb().prepare('INSERT INTO research_runs VALUES (?,?,?,?,?)').run(running.id,running.requestKey,'hash',JSON.stringify(running),running.createdAt);
 expect(()=>deleteRun(running.id)).toThrow('调查完成后');
 const r={...blank(),status:'COMPLETE' as const,analysis};getDb().prepare('INSERT INTO research_runs VALUES (?,?,?,?,?)').run(r.id,r.requestKey,'hash',JSON.stringify(r),r.createdAt);
 deleteRun(r.id);expect(()=>readRun(r.id)).toThrow('已删除');expect(listRuns().some(v=>v.id===r.id)).toBe(false);expect(experiences(input.product,input.location).some(v=>v.id===r.id)).toBe(false);
 restoreRun(r.id);expect(readRun(r.id).analysis).toEqual(analysis);expect(listRuns().some(v=>v.id===r.id)).toBe(true);
});

function unresolvedEvaluation():Evaluation{return {checks:dimensions.map(([key])=>({key,status:'NEEDS_INPUT',observed:'',reason:'补充适用资料',clause:'',findingIndexes:[],limits:[]})),permits:permitGroups.map(([key])=>({key,required:'VERIFY',name:'核实所需许可',department:'',materials:[],after:[],findingIndexes:[]})),timeline:{cases:[],assumptions:[],stages:[{id:'prepare',name:'准备资料',permitKeys:[],after:[],minDays:null,maxDays:null,basis:'UNAVAILABLE',reason:'无时间依据',findingIndexes:[]}]}};}
it('固定评价维度、合格依据及流程最长路径校验',()=>{
 const e=unresolvedEvaluation();expect(()=>validateEvaluation(e,analysis.findings as never,[source])).not.toThrow();
 e.checks[0].status='PASS';expect(()=>validateEvaluation(e,analysis.findings as never,[source])).toThrow('官方依据');e.checks[0].status='NEEDS_INPUT';
 const stage={...e.timeline.stages[0],minDays:7,maxDays:14,basis:'ESTIMATE' as const};e.timeline.stages=[{...stage,id:'a'},{...stage,id:'b',after:['a']},{...stage,id:'c',after:['a']},{...stage,id:'d',after:['b','c']}];expect(timelineDays(e.timeline)).toEqual([21,42]);expect(timelineLabel(e.timeline)).toBe('预计 3–6 周');
 e.timeline.stages[0].after=['d'];expect(()=>timelineDays(e.timeline)).toThrow('成环');
});

it('仅补齐完整值后的JSON闭合符，不补造截断字符串或缺失字段',()=>{expect(parseModelJson('{"value":[{"name":"intact"}]')).toEqual({value:[{name:'intact'}]});expect(()=>parseModelJson('{"value":"truncated')).toThrow();expect(()=>parseModelJson('{"value":')).toThrow();expect(()=>parseModelJson('{"value":[]}]}')).toThrow();});

it('评价阶段单独修复，不重做证据分析或搜索',async()=>{
 vi.stubEnv('DEEPSEEK_API_KEY','isolated-stage-key');const calls:Record<string,number>={};
 vi.stubGlobal('fetch',vi.fn(async(url:string,init:RequestInit)=>{if(url.endsWith('/search'))return new Response(JSON.stringify({results:[{url:'https://stage.gov/requirements',title:'Official'}]}));if(url.endsWith('/fetch'))return new Response(JSON.stringify({title:'Official',content:paragraph}));const user=JSON.parse(JSON.parse(String(init.body)).messages[1].content);calls[user.stage]=(calls[user.stage]||0)+1;let value:unknown;
 if(user.stage==='plan')value={jurisdiction:'unknown',queries:['stage isolation requirements','stage isolation permits'],missing:[],issues:['review']};
 else if(user.stage==='evidence')value={...analysis,findings:['BUILDABILITY','PERMITS','TIMELINE'].map(category=>({...analysis.findings[0],category,citations:[{paragraphId:user.evidence[0].paragraphs[0].id,quote:paragraph}]}))};
 else if(user.stage==='assessment'){const e=unresolvedEvaluation();if(calls.assessment===1)e.checks[1]={...e.checks[0]};value={checks:e.checks,permits:e.permits};}
 else if(user.stage==='review')value=reviewValue(user.report);else value=unresolvedEvaluation().timeline;
 return new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify(value)}}]}));}));
 const d=details(),r=await waitInvestigation(startInvestigation({...projectStrings(d),details:d,refresh:true},randomUUID()).id);expect(r.status).toBe('COMPLETE');expect(calls).toEqual({plan:1,evidence:1,assessment:2,timeline:1,review:1});expect(r.metrics.searchRequests).toBe(5);expect(r.analysis?.evaluation?.checks).toHaveLength(20);
});

function reviewValue(report:any){return {reviewedFindings:report.findings.map((_:unknown,i:number)=>i),reviewedChecks:report.evaluation.checks.map((c:any)=>c.key),reviewedPermits:report.evaluation.permits.map((p:any)=>p.key),reviewedStages:report.evaluation.timeline.stages.map((s:any)=>s.id),reviewedCases:report.evaluation.timeline.cases.map((_:unknown,i:number)=>i),issues:[]};}

it('同县不同地址可以复用检查结构，纠错报告不再沿用建议',()=>{
 const d=details(),r=blank();r.input=researchInput.parse({...projectStrings(d),details:{...d,street:'First address'}});r.status='COMPLETE';r.analysis={...analysis,evaluation:unresolvedEvaluation()} as ResearchRun['analysis'];getDb().prepare('INSERT INTO research_runs VALUES (?,?,?,?,?)').run(r.id,r.requestKey,'hash',JSON.stringify(r),r.createdAt);
 const other={...d,street:'Second address'};expect(experiences(r.input.product,'Second address',other).map(e=>e.id)).toContain(r.id);feedback(r.id,{kind:'CORRECTION',text:'Recheck the underlying advice'});const corrected=experiences(r.input.product,'Second address',other).find(e=>e.id===r.id)!;expect(corrected.answerStructure.evaluation).toBeUndefined();expect(corrected.nextSteps).toEqual([]);
});
it('材料勾选由API校验并落库，不允许写入报告以外材料',async()=>{
 const {POST,GET}=await import('../src/app/api/[...path]/route');const {NextRequest}=await import('next/server');const r=blank();r.status='COMPLETE';const e=unresolvedEvaluation();e.permits[0].materials=['Site plan'];r.analysis={...analysis,evaluation:e} as ResearchRun['analysis'];getDb().prepare('INSERT INTO research_runs VALUES (?,?,?,?,?)').run(r.id,r.requestKey,'hash',JSON.stringify(r),r.createdAt);
 const request=(checked:string[])=>new NextRequest('http://localhost/api/investigations/'+r.id+'/materials',{method:'POST',headers:{host:'localhost','content-type':'application/json'},body:JSON.stringify({checked})});expect((await POST(request(['PLANNING:Site plan']))).status).toBe(200);expect(readRun(r.id).checkedMaterials).toEqual(['PLANNING:Site plan']);expect((await POST(request(['FAKE:material']))).status).toBe(400);const response=await GET(new NextRequest('http://localhost/api/investigations/'+r.id,{headers:{host:'localhost'}}));expect((await response.json()).checkedMaterials).toEqual(['PLANNING:Site plan']);
});
it('当前版本中断任务从已存评价恢复，不重复规划与抓取',async()=>{
 const {promptVersion}=await import('../src/server/prompts');vi.stubEnv('DEEPSEEK_API_KEY','restart-transport-key');const d=details(),r=blank();r.version=promptVersion;r.input=researchInput.parse({...projectStrings(d),details:d});r.plan={jurisdiction:'county',queries:['resume test query one','resume test query two'],missing:[],issues:['resume']};r.evidence=[{...source,sourceKind:'REGULATION'}];const base={...analysis,findings:['BUILDABILITY','PERMITS','TIMELINE'].map(category=>({...analysis.findings[0],category}))} as NonNullable<ResearchRun['checkpoint']>['base'];const ev=bindFacts(unresolvedEvaluation(),d);r.checkpoint={base,assessment:{checks:ev.checks,permits:ev.permits}};getDb().prepare('INSERT INTO research_runs VALUES (?,?,?,?,?)').run(r.id,r.requestKey,'hash',JSON.stringify(r),r.createdAt);const stages:string[]=[];
 vi.stubGlobal('fetch',vi.fn(async(url:string,init:RequestInit)=>{expect(url).not.toMatch(/\/(search|fetch)$/);const user=JSON.parse(JSON.parse(String(init.body)).messages[1].content);stages.push(user.stage);const value=user.stage==='review'?reviewValue(user.report):unresolvedEvaluation().timeline;return new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify(value)}}]}));}));recoverInterrupted();const restored=await waitInvestigation(r.id);expect(restored.status,restored.error).toBe('COMPLETE');expect(stages).toEqual(['timeline','review']);expect(restored.checkpoint).toBeUndefined();
});

it('运行中或失败的未复核草稿不能通过报告API泄露',async()=>{
 const {GET}=await import('../src/app/api/[...path]/route');const {NextRequest}=await import('next/server');const r=blank();r.status='FAILED';r.analysis=analysis as ResearchRun['analysis'];getDb().prepare('INSERT INTO research_runs VALUES (?,?,?,?,?)').run(r.id,r.requestKey,'hash',JSON.stringify(r),r.createdAt);const response=await GET(new NextRequest('http://localhost/api/investigations/'+r.id,{headers:{host:'localhost'}}));expect((await response.json()).analysis).toBeUndefined();
});
it('引用错误批量返回，避免每轮只修复第一个问题',()=>{
 try{validateAnalysis({...analysis,findings:[{...analysis.findings[0],citations:[{paragraphId:'bad-one',quote:'First invalid quote.'},{paragraphId:'bad-two',quote:'Second invalid quote.'}]}]},[source]);throw Error('should reject');}catch(e){expect((e as {details:{errors:unknown[]}}).details.errors).toHaveLength(2);}
});
