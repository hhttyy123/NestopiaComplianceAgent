import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { getDb } from './db';
import { evaluate } from '../domain/engine';
import { assessmentToday, knowledgePackSchema, sourceIsUsable, type KnowledgePack } from '../domain/knowledge-pack';
import { fingerprint } from '../domain/fingerprint';

export function activeKnowledge() {
  const row = getDb().prepare('SELECT r.* FROM knowledge_releases r JOIN knowledge_head h ON h.release_id=r.id WHERE h.singleton=1').get();
  if (!row) throw new Error('当前知识版本不存在');
  return { pack: knowledgePackSchema.parse(JSON.parse(String(row.payload))), hash: String(row.content_hash) };
}

export function validateKnowledge(raw: unknown, date = assessmentToday()) {
  const pack = knowledgePackSchema.parse(raw);
  const required = new Set([pack.primarySourceId, ...(['principal','count','area','short-rental','address','occupants'] as const).map(id => pack.references[id].sourceId)]);
  const problems: string[] = [];
  if (pack.verification.checkedAt > date) problems.push('核实日期不能在未来');
  for (const id of required) if (!sourceIsUsable(pack.sources.find(s => s.id === id), date, pack.policy.sourceReviewDays)) problems.push(`来源${id}不在有效复核窗口内`);
  const cases = pack.cases.map(test => {
    const result = evaluate(test.input, test.assessmentDate, pack.sources, false, pack);
    const differences: string[] = [];
    if (result.scope !== test.expectedScope) differences.push(`范围：期望${test.expectedScope}，实际${result.scope}`);
    if (result.conclusion !== test.expectedConclusion) differences.push(`结论：期望${test.expectedConclusion}，实际${result.conclusion}`);
    for (const [id,status] of Object.entries(test.expectedItems || {})) if (result.items.find(i => i.id === id)?.status !== status) differences.push(`事项${id}不符合预期${status}`);
    return { id:test.id, passed:!differences.length, differences };
  });
  return { pack, hash:fingerprint(pack), passed:!problems.length && cases.every(c => c.passed), problems, cases, professionalSignoff:pack.verification.level === 'professional-review' };
}

const attestation = z.object({ actor:z.string().trim().min(1).max(100), evidence:z.string().trim().min(1).max(6000) });
function events(changeId: string) {
  return getDb().prepare('SELECT kind,payload FROM knowledge_change_events WHERE change_id=? ORDER BY rowid').all(changeId);
}
function changeExists(id: string) {
  if (!getDb().prepare('SELECT 1 FROM knowledge_changes WHERE id=?').get(id)) throw new Error('知识建议不存在');
}
function appendEvent(changeId: string, kind: 'verified'|'published', payload: unknown) {
  getDb().prepare('INSERT INTO knowledge_change_events VALUES (?,?,?,?,?)').run(randomUUID(), changeId, kind, JSON.stringify(payload), new Date().toISOString());
}
export function verifyKnowledgeChange(id: string, values: { actor:string; evidence:string }) {
  const record = attestation.parse(values);
  return getDb().transaction(() => {
    changeExists(id);
    if (events(id).length) throw new Error('该建议已经核实或发布，不能覆盖历史记录');
    appendEvent(id,'verified',record);
    return { id, status:'已核实', ...record };
  })();
}

export function publishKnowledge(raw: unknown, options: { expectedRelease:string; actor:string; evidence:string; changeId?:string }) {
  const record = attestation.parse(options);
  const validation = validateKnowledge(raw);
  if (!validation.passed) throw new Error(`知识验证未通过：${[...validation.problems,...validation.cases.filter(c => !c.passed).map(c => `${c.id}: ${c.differences.join('；')}`)].join('；')}`);
  return getDb().transaction(() => {
    const active = activeKnowledge();
    if (active.pack.id !== options.expectedRelease) throw new Error('当前版本已改变，请重新导出并核对后发布');
    if (getDb().prepare('SELECT 1 FROM knowledge_releases WHERE id=?').get(validation.pack.id)) throw new Error('版本编号已存在；历史版本不可覆盖，请使用新编号');
    if (options.changeId) {
      changeExists(options.changeId);
      const history = events(options.changeId);
      if (history.length !== 1 || history[0].kind !== 'verified') throw new Error('关联建议须先核实，且不能重复发布');
    }
    const {pack, ...proof} = validation;
    getDb().prepare('INSERT INTO knowledge_releases VALUES (?,?,?,?,?,?,?)').run(pack.id,JSON.stringify(pack),validation.hash,record.actor,record.evidence,JSON.stringify(proof),new Date().toISOString());
    getDb().prepare('UPDATE knowledge_head SET release_id=? WHERE singleton=1').run(pack.id);
    if (options.changeId) appendEvent(options.changeId,'published',{ ...record, release:pack.id, hash:validation.hash });
    return { release:pack.id, hash:validation.hash, cases:validation.cases };
  })();
}

export function knowledgeChanges() {
  return getDb().prepare('SELECT payload FROM knowledge_changes ORDER BY rowid DESC').all().map(row => {
    const original = JSON.parse(String(row.payload)) as Record<string, unknown>;
    const history = events(String(original.id));
    return { ...original, status:history.some(e => e.kind === 'published') ? '已发布' : history.length ? '已核实' : '待核实', events:history.map(e => ({ kind:e.kind, ...JSON.parse(String(e.payload)) })) };
  });
}
export function knowledgeReleases() {
  return getDb().prepare('SELECT id,content_hash,published_by,evidence,published_at FROM knowledge_releases ORDER BY rowid DESC').all();
}
export function snapshots(pack: KnowledgePack) { return pack.sources.map(source => ({ ...source, hash:fingerprint(source) })); }
