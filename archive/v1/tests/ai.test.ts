import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { mkdirSync, mkdtempSync } from 'node:fs';
import path from 'node:path';
import { fixtures } from '../src/domain/fixtures';
import { evaluate } from '../src/domain/engine';
import type { Review } from '../src/domain/schema';
import { checkExplanation, explanationInput, generateExplanation } from '../src/server/deepseek';
import { initializeDb } from '../src/server/db';
import { createProject, getReview, runReview, updateProject } from '../src/server/store';
import { explainReview, savedExplanation } from '../src/server/ai-service';

const review:Review={id:'sample',projectId:'sample',sequence:1,projectRevision:1,createdAt:'2026-11-15',input:fixtures[1],result:evaluate(fixtures[1],'2026-11-15'),executionStatus:'COMPLETED'};
const output=(r:Review=review)=>({conclusion:r.result.conclusion,overview:'已发现面积冲突，仍需人工核实。',items:r.result.items.map(i=>({itemId:i.id,status:i.status,explanation:'根据已保存条件解释此项结果。',nextStep:'核对材料并保留证据。',sourceIds:[i.sourceId]}))});
const response=(value:unknown=output(),finish='stop')=>new Response(JSON.stringify({choices:[{finish_reason:finish,message:{content:JSON.stringify(value)}}]}),{status:200});
beforeAll(async()=>{mkdirSync('tmp',{recursive:true});process.env.DATA_DIR=mkdtempSync(path.resolve('tmp/ai-test-'));await initializeDb();});
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();});
describe('DeepSeek解释与边界',()=>{
  it('仅向官方接口发送服务端凭据和最少必要数据',async()=>{
    vi.stubEnv('DEEPSEEK_API_KEY','synthetic-test-key');vi.stubEnv('DEEPSEEK_MODEL','deepseek-flash');
    const fetcher=vi.fn(async()=>response());const result=await generateExplanation(review,fetcher);
    expect(result.status).toBe('GENERATED');const [url,options]=fetcher.mock.calls[0] as unknown as [string,RequestInit];
    expect(url).toBe('https://api.deepseek.com/chat/completions');expect(options.redirect).toBe('error');
    expect(JSON.parse(String(options.body)).model).toBe('deepseek-flash');expect(JSON.stringify(result)).not.toContain('synthetic-test-key');
    const data=JSON.stringify(explanationInput({...review,input:{...review.input,name:'PRIVATE-NAME',address:'PRIVATE-ADDRESS',confirmedBy:'PRIVATE-ACTOR'}}));
    expect(data).not.toContain(review.input.address);expect(data).not.toContain(review.input.confirmedBy);expect(data).not.toContain('PRIVATE-');
  });
  it('无密钥和范围外项目不请求模型',async()=>{
    const fetcher=vi.fn();vi.stubEnv('DEEPSEEK_API_KEY','');expect((await generateExplanation(review,fetcher)).status).toBe('FALLBACK');
    vi.stubEnv('DEEPSEEK_API_KEY','synthetic');expect((await generateExplanation({...review,result:{...review.result,scope:'UNSUPPORTED',conclusion:null}},fetcher)).status).toBe('FALLBACK');expect(fetcher).not.toHaveBeenCalled();
  });
  it('拒绝改变结论、状态、重复事项或捏造引用',()=>{
    expect(()=>checkExplanation({...output(),conclusion:'PRELIMINARY_PASS'},review)).toThrow();
    const wrongStatus=output();wrongStatus.items[0].status='CONFLICT';expect(()=>checkExplanation(wrongStatus,review)).toThrow();
    const citation=output();citation.items[0].sourceIds=['invented'];expect(()=>checkExplanation(citation,review)).toThrow();
    const duplicate=output();duplicate.items[1]=duplicate.items[0];expect(()=>checkExplanation(duplicate,review)).toThrow();
  });
  it.each([401,402,429,500])('HTTP %s安全降级且不暴露供应商响应',async(status)=>{
    vi.stubEnv('DEEPSEEK_API_KEY','synthetic');const result=await generateExplanation(review,async()=>new Response('sensitive-provider-body',{status}));expect(result.status).toBe('FALLBACK');expect(JSON.stringify(result)).not.toContain('sensitive-provider-body');expect(result.overview).toBe(review.result.summary);
  });
  it('超时、空JSON、截断与不一致输出保留规则结果',async()=>{
    vi.stubEnv('DEEPSEEK_API_KEY','synthetic');
    for(const fetcher of [async()=>{throw new Error('synthetic-secret');},async()=>response(null),async()=>response(output(),'length'),async()=>response({...output(),conclusion:'CONFLICT-WRONG'})]){
      const result=await generateExplanation(review,fetcher);expect(result.status).toBe('FALLBACK');expect(JSON.stringify(result)).not.toContain('synthetic-secret');
    }
  });
  it('成功解释保存且并发/重复请求只调用一次，原报告不改写',async()=>{
    vi.stubEnv('DEEPSEEK_API_KEY','synthetic');const p=createProject(fixtures[1]),r=runReview(p.id,1,'ai-cache');
    const fetcher=vi.fn(async()=>response(output(r)));vi.stubGlobal('fetch',fetcher);
    const [a,b]=await Promise.all([explainReview(r.id),explainReview(r.id)]);expect(a).toEqual(b);expect(a.status).toBe('GENERATED');
    expect(await explainReview(r.id)).toEqual(a);expect(fetcher).toHaveBeenCalledTimes(1);expect(savedExplanation(r.id)).toEqual(a);expect(getReview(r.id).result).toEqual(r.result);
  });
  it('失败后允许重试，等待期间资料更新则不保存解释',async()=>{
    vi.stubEnv('DEEPSEEK_API_KEY','synthetic');const p=createProject(fixtures[1]),r=runReview(p.id,1,'ai-retry');
    vi.stubGlobal('fetch',vi.fn(async()=>new Response('',{status:429})));expect((await explainReview(r.id)).status).toBe('FALLBACK');
    vi.stubGlobal('fetch',vi.fn(async()=>response(output(r))));expect((await explainReview(r.id)).status).toBe('GENERATED');
    const p2=createProject(fixtures[1]),r2=runReview(p2.id,1,'ai-stale');
    vi.stubGlobal('fetch',vi.fn(async()=>{updateProject(p2.id,fixtures[0],1);return response(output(r2));}));
    await expect(explainReview(r2.id)).rejects.toThrow('等待AI期间');expect(savedExplanation(r2.id)).toBeNull();
    await expect(explainReview(r2.id)).rejects.toThrow('请先重新预审');
  });
});
