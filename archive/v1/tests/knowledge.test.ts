import { beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { DEFAULT_PACK, knowledgePackSchema, scaledLte } from '../src/domain/knowledge-pack';
import { initializeDb, getDb } from '../src/server/db';
import { activeKnowledge, publishKnowledge, validateKnowledge, verifyKnowledgeChange } from '../src/server/knowledge-service';
import { addKnowledgeChange, controlKnowledge, createProject, getReview, knowledge, runReview } from '../src/server/store';
import { fixtures } from '../src/domain/fixtures';
import { fingerprint } from '../src/domain/fingerprint';

beforeAll(async () => { mkdirSync('tmp',{recursive:true}); process.env.DATA_DIR=mkdtempSync(path.resolve('tmp/knowledge-test-')); await initializeDb(); });
const options = () => ({expectedRelease:activeKnowledge().pack.id,actor:'测试维护者',evidence:'仅用于隔离测试的模拟核实记录'});
const nextPack = (suffix:string) => ({...structuredClone(DEFAULT_PACK), id:`TEST-${suffix}`});
describe('知识验证与受控发布', () => {
  it('首版六类案例全部符合预期', () => { const v=validateKnowledge(DEFAULT_PACK,'2026-11-15'); expect(v.passed).toBe(true); expect(v.cases).toHaveLength(6); expect(v.professionalSignoff).toBe(false); });
  it('拒绝缺少边界案例、无效日期、缺少引用和未知字段', () => {
    const p=nextPack('invalid'); p.cases=p.cases.filter(c => c.category !== 'boundary'); expect(knowledgePackSchema.safeParse(p).success).toBe(false);
    expect(knowledgePackSchema.safeParse({...DEFAULT_PACK,verification:{...DEFAULT_PACK.verification,checkedAt:'2026-02-30'}}).success).toBe(false);
    expect(knowledgePackSchema.safeParse({...DEFAULT_PACK,references:{...DEFAULT_PACK.references,area:{sourceId:'missing',locator:'x'}}}).success).toBe(false);
    expect(knowledgePackSchema.safeParse({...DEFAULT_PACK,script:'ignored?'}).success).toBe(false);
  });
  it('自动规则引用的来源必须可用，过期或未来来源阻止发布', () => {
    expect(validateKnowledge(DEFAULT_PACK,'2026-12-16').passed).toBe(false);
    expect(validateKnowledge(DEFAULT_PACK,'2026-11-14').passed).toBe(false);
    const p=nextPack('inactive'); p.sources[0].status='reference'; expect(knowledgePackSchema.safeParse(p).success).toBe(false);
  });
  it('十进制边界比较不会因浮点乘法误报', () => { expect(scaledLte(0.21,4,0.28,3)).toBe(true); expect(scaledLte(0.21000000000000002,4,0.28,3)).toBe(false); expect(scaledLte(3e-8,4,4e-8,3)).toBe(true); });
  it('案例不符时拒绝整个发布，版本指针不改变', () => {
    const p=nextPack('bad-case'); p.cases[0].expectedConclusion='CONFLICT'; const previous=activeKnowledge().hash;
    expect(() => publishKnowledge(p,options())).toThrow('验证未通过'); expect(activeKnowledge().hash).toBe(previous);
    expect(getDb().prepare('SELECT 1 FROM knowledge_releases WHERE id=?').get(p.id)).toBeUndefined();
  });
  it('新版本参数用于新审查，旧结论、参数和来源保持原样', () => {
    const project=createProject({...fixtures[0],aduArea:1000}); const old=runReview(project.id,1,'old');
    const p=nextPack('ratio'); p.policy.areaNumerator=1; p.policy.areaDenominator=2;
    p.cases.find(c => c.id==='area-boundary')!.input.aduArea=800;
    publishKnowledge(p,options()); const current=runReview(project.id,1,'new');
    expect(old.result.conclusion).toBe('PRELIMINARY_PASS'); expect(current.result.conclusion).toBe('CONFLICT');
    expect(current.result.ruleSnapshot?.areaNumerator).toBe(1); expect(current.result.knowledgeHash).toBe(fingerprint(p));
    expect(getReview(old.id).result).toEqual(old.result); expect(getReview(old.id).knowledgeBlocked).toBe(true);
    expect(runReview(project.id,1,'old')).toEqual(old);
  });
  it('拒绝覆盖历史版本和过时发布请求', () => {
    expect(() => publishKnowledge(activeKnowledge().pack,options())).toThrow('版本编号已存在');
    expect(() => publishKnowledge(nextPack('stale'),{...options(),expectedRelease:DEFAULT_PACK.id})).toThrow('当前版本已改变');
    expect(() => getDb().prepare('UPDATE knowledge_releases SET evidence=? WHERE id=?').run('overwrite',DEFAULT_PACK.id)).toThrow('immutable');
  });
  it('建议先核实后关联发布，发布记录保留且不能重复发布', () => {
    const project=createProject(fixtures[0]), report=runReview(project.id,1,'proposal');
    const change=addKnowledgeChange(report.id,'测试人员','建议核对参数和来源'); const p=nextPack('proposal');
    expect(() => publishKnowledge(p,{...options(),changeId:change.id})).toThrow('须先核实');
    verifyKnowledgeChange(change.id,{actor:'模拟复核人',evidence:'模拟依据编号'});
    expect(knowledge().changes[0].status).toBe('已核实');
    controlKnowledge(true,'测试停用','测试维护者'); publishKnowledge(p,{...options(),changeId:change.id});
    expect(knowledge().changes[0].status).toBe('已发布'); expect(knowledge().changes[0].events).toHaveLength(2); expect(knowledge().blocked).toBe(true);
    expect(() => publishKnowledge(nextPack('repeat'),{...options(),changeId:change.id})).toThrow('不能重复发布');
    controlKnowledge(false,'测试结束','测试维护者');
  });
});
