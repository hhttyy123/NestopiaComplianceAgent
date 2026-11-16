import { createHash, randomUUID } from 'node:crypto';
import { getDb } from './db';
import { evaluate } from '@/domain/engine';
import { activeKnowledge, knowledgeChanges, knowledgeReleases, snapshots } from './knowledge-service';
import { assessmentToday, sourceIsUsable } from '../domain/knowledge-pack';
import { projectSchema, type Project, type ProjectInput, type Review, type ReviewNote } from '@/domain/schema';

export class AppError extends Error { constructor(public status: number, public code: string, message: string) { super(message); } }
const parse = <T>(row: unknown): T => JSON.parse((row as { payload: string }).payload);
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const sourceSnapshots = () => snapshots(activeKnowledge().pack);
export function knowledge() {
  const control = getDb().prepare('SELECT * FROM knowledge_controls ORDER BY rowid DESC LIMIT 1').get() as { blocked: number; reason: string; actor: string; created_at: string } | undefined;
  const {pack, hash} = activeKnowledge();
  return { release:pack.id, hash, coverage:pack.coverage, sources:snapshots(pack), blocked:!!control?.blocked, control, changes:knowledgeChanges(), releases:knowledgeReleases() };
}
export function getProject(id: string) {
  const row = getDb().prepare('SELECT payload FROM projects WHERE id=?').get(id);
  if (!row) throw new AppError(404, 'NOT_FOUND', '项目不存在');
  return parse<Project>(row);
}
export function createProject(input: ProjectInput): Project {
  const data = projectSchema.parse(input);
  const now = new Date().toISOString();
  const project = { ...data, id: randomUUID(), revision: 1, createdAt: now, updatedAt: now };
  getDb().prepare('INSERT INTO projects VALUES (?,?,?,?,?,?)').run(project.id, project.revision, project.name, JSON.stringify(project), now, now);
  return project;
}
export function updateProject(id: string, input: ProjectInput, revision: number) {
  const data = projectSchema.parse(input);
  return getDb().transaction(() => {
    const previous = getProject(id);
    if (previous.revision !== revision) throw new AppError(409, 'REVISION_CONFLICT', '项目已更新，请重新加载后再保存');
    const project = { ...previous, ...data, revision: previous.revision + 1, updatedAt: new Date().toISOString() };
    getDb().prepare('UPDATE projects SET revision=?,name=?,payload=?,updated_at=? WHERE id=?').run(project.revision, project.name, JSON.stringify(project), project.updatedAt, id);
    return project;
  })();
}
export function listReviews(id: string) {
  return getDb().prepare('SELECT payload FROM reviews WHERE project_id=? ORDER BY sequence DESC').all(id).map(r => parse<Review>(r));
}
export function listProjects() {
  return getDb().prepare('SELECT payload FROM projects ORDER BY updated_at DESC').all().map(r => {
    const project = parse<Project>(r);
    const latest = getDb().prepare('SELECT payload FROM reviews WHERE project_id=? ORDER BY sequence DESC LIMIT 1').get(project.id);
    const review = latest ? parse<Review>(latest) : null;
    return { ...project, latestReview: review };
  });
}
export function getReview(id: string) {
  const row = getDb().prepare('SELECT payload FROM reviews WHERE id=?').get(id);
  if (!row) throw new AppError(404, 'NOT_FOUND', '报告不存在');
  const review = parse<Review>(row);
  const current = activeKnowledge();
  const knowledgeChanged = review.result.release !== current.pack.id || (!!review.result.knowledgeHash && review.result.knowledgeHash !== current.hash);
  const required = new Set([current.pack.primarySourceId, ...(['principal','count','area','short-rental','address','occupants'] as const).map(id => current.pack.references[id].sourceId)]);
  const pastReviewWindow = [...required].some(id => !sourceIsUsable(review.result.sources.find(s => s.id === id), assessmentToday(), current.pack.policy.sourceReviewDays));
  return { ...review, notes: getDb().prepare('SELECT payload FROM notes WHERE review_id=? ORDER BY rowid DESC').all(id).map(r => parse<ReviewNote>(r)), stale: getProject(review.projectId).revision !== review.projectRevision, knowledgeBlocked: knowledge().blocked || pastReviewWindow || knowledgeChanged };
}
export function runReview(projectId: string, revision: number, requestKey: string) {
  return getDb().transaction(() => {
    const requestHash = hash({ projectId, revision });
    const existing = getDb().prepare('SELECT payload,request_hash FROM reviews WHERE project_id=? AND request_key=?').get(projectId, requestKey) as { payload: string; request_hash: string } | undefined;
    if (existing) {
      if (existing.request_hash !== requestHash) throw new AppError(409, 'REQUEST_CONFLICT', '重复请求标识与原请求不一致');
      return JSON.parse(existing.payload) as Review;
    }
    const project = getProject(projectId);
    if (project.revision !== revision) throw new AppError(409, 'REVISION_CONFLICT', '资料已变更，请加载最新项目后预审');
    const input = projectSchema.parse(Object.fromEntries(Object.entries(project).filter(([k]) => !['id','revision','createdAt','updatedAt'].includes(k))));
    const createdAt = new Date().toISOString();
    const {pack, hash:knowledgeHash} = activeKnowledge();
    const result = { ...evaluate(input, assessmentToday(), snapshots(pack), knowledge().blocked, pack), knowledgeHash };
    const count = getDb().prepare('SELECT COALESCE(MAX(sequence),0)+1 AS n FROM reviews WHERE project_id=?').get(projectId) as { n: number };
    const review: Review = { id: randomUUID(), projectId, sequence: count.n, projectRevision: revision, createdAt, input, result, executionStatus: 'COMPLETED' };
    getDb().prepare('INSERT INTO reviews VALUES (?,?,?,?,?,?,?,?)').run(review.id, projectId, review.sequence, revision, requestKey, requestHash, JSON.stringify(review), createdAt);
    const updated = { ...project, updatedAt: createdAt };
    getDb().prepare('UPDATE projects SET updated_at=?,payload=? WHERE id=?').run(createdAt, JSON.stringify(updated), projectId);
    return review;
  })();
}
export function addNote(reviewId: string, values: { itemId?: string | null; actor: string; kind: string; text: string; evidence: string }) {
  const review = getReview(reviewId);
  if (values.itemId && !review.result.items.some(i => i.id === values.itemId)) throw new AppError(400, 'INVALID_ITEM', '审查事项不属于本报告');
  const note: ReviewNote = { ...values, itemId: values.itemId || null, id: randomUUID(), reviewId, createdAt: new Date().toISOString() };
  getDb().prepare('INSERT INTO notes VALUES (?,?,?,?)').run(note.id, reviewId, JSON.stringify(note), note.createdAt);
  return note;
}
export function controlKnowledge(blocked: boolean, reason: string, actor: string) {
  getDb().prepare('INSERT INTO knowledge_controls VALUES (?,?,?,?,?)').run(randomUUID(), blocked ? 1 : 0, reason, actor, new Date().toISOString());
  return knowledge();
}
export function addKnowledgeChange(reviewId: string, actor: string, proposal: string) {
  getReview(reviewId);
  const record = { id: randomUUID(), reviewId, actor, proposal, status: '待核实', createdAt: new Date().toISOString() };
  getDb().prepare('INSERT INTO knowledge_changes VALUES (?,?,?,?)').run(record.id, reviewId, JSON.stringify(record), record.createdAt);
  return record;
}
