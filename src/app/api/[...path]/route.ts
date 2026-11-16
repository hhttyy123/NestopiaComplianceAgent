import { NextRequest,NextResponse } from 'next/server';
import { z } from 'zod';
import { initializeDb,getDb } from '@/server/db';
import { startInvestigation,recoverInterrupted } from '@/server/investigation';
import { readRun,listRuns,feedback,feedbackFor,deleteRun,restoreRun } from '@/server/research-store';
import { researchInput } from '@/domain/research';
import { ResearchError } from '@/server/provider';
import { accessPolicy } from '@/server/access';
import { projectDetailsSchema } from '@/domain/project';
export const runtime='nodejs';
export const dynamic='force-dynamic';
let recovered=false;
async function handle(req:NextRequest){
  const requestId=crypto.randomUUID();const json=(value:unknown,status=200)=>NextResponse.json(value,{status,headers:{'Cache-Control':'no-store','X-Request-Id':requestId}});
  try{
    const denied=accessPolicy(req);if(denied)return json({message:denied.message},denied.status);
    if(req.nextUrl.pathname==='/api/developer')return json({message:'接口不存在'},404);
    await initializeDb();if(!recovered){recoverInterrupted();recovered=true;}
    const [resource,id,action]=req.nextUrl.pathname.replace(/^\/api\//,'').split('/');
    if(req.method==='GET'){
      if(resource==='health')return json({ok:true,version:'research-v2',aiConfigured:!!process.env.DEEPSEEK_API_KEY?.trim()});
      if(resource==='investigations'&&!id)return json(listRuns().map(r=>({id:r.id,input:r.input,status:r.status,phase:r.phase,createdAt:r.createdAt})));
      if(resource==='investigations'&&id){const {checkpoint,quality,...run}=readRun(id);return json({...run,analysis:run.status==='COMPLETE'?run.analysis:undefined,feedback:feedbackFor(id)});}
      if(resource==='sources'&&id){const row=getDb().prepare('SELECT payload FROM research_source_versions WHERE hash=?').get(id);return row?json(JSON.parse(String(row.payload))):json({message:'来源版本不存在'},404);}
      return json({message:'接口不存在'},404);
    }
    if(!req.headers.get('content-type')?.includes('application/json'))return json({message:'需要JSON请求'},400);
    if(Number(req.headers.get('content-length')||0)>65536)return json({message:'输入过长'},413);
    const raw=await req.text();if(raw.length>65536)return json({message:'输入过长'},413);const body=JSON.parse(raw);
    if(req.method==='DELETE'&&resource==='investigations'&&id&&!action)return json(deleteRun(id));
    if(req.method==='POST'&&resource==='investigations'&&id&&action==='restore')return json(restoreRun(id));
    if(req.method==='POST'&&resource==='investigations'&&!id){const data=z.object({input:researchInput,requestKey:z.string().uuid()}).strict().parse(body);if(!data.input.details)return json({message:'请使用结构化表单提交Montgomery County新建独立ADU项目'},400);projectDetailsSchema.parse(data.input.details);return json(startInvestigation(data.input,data.requestKey),202);}
    if(req.method==='POST'&&resource==='investigations'&&id&&action==='materials'){const run=readRun(id),data=z.object({checked:z.array(z.string().max(300)).max(108)}).strict().parse(body);const allowed=new Set(run.analysis?.evaluation?.permits.flatMap(p=>p.materials.map(m=>p.key+':'+m))||[]);if(data.checked.some(k=>!allowed.has(k)))return json({message:'材料不属于当前报告'},400);run.checkedMaterials=[...new Set(data.checked)];const {saveRun}=await import('@/server/research-store');saveRun(run);return json({checked:run.checkedMaterials});}
    if(req.method==='POST'&&resource==='investigations'&&id&&action==='feedback')return json(feedback(id,body),201);
    return json({message:'接口不存在'},404);
  }catch(error){if(error instanceof z.ZodError)return json({message:error.issues.map(i=>`${i.path.join('.')}: ${i.message}`).join('；')},400);if(error instanceof SyntaxError)return json({message:'无效JSON'},400);if(error instanceof ResearchError)return json({message:error.message,code:error.code},error.code==='NOT_FOUND'?404:error.code==='INVALID_INPUT'?400:error.code==='REQUEST_CONFLICT'?409:error.code==='BUSY'?429:502);return json({message:'操作未完成，请检查记录或重试',requestId},500);}
}
export {handle as GET,handle as POST,handle as DELETE};
