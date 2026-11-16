import { getDb } from './db';
import { AppError, getReview } from './store';
import { generateExplanation } from './deepseek';
import type { AiExplanation } from '../domain/ai';

const running = new Map<string,Promise<AiExplanation>>();
export function savedExplanation(reviewId:string): AiExplanation | null {
  const row=getDb().prepare('SELECT payload FROM ai_explanations WHERE review_id=?').get(reviewId);
  return row ? JSON.parse(String(row.payload)) as AiExplanation : null;
}
export async function explainReview(reviewId:string): Promise<AiExplanation> {
  const report=getReview(reviewId);
  if (report.stale || report.knowledgeBlocked) throw new AppError(409,'REVIEW_OUTDATED','请先重新预审，使用当前资料与知识版本后再生成AI解释');
  const saved=savedExplanation(reviewId);
  if (saved?.status === 'GENERATED') return saved;
  const pending=running.get(reviewId); if (pending) return pending;
  if (running.size>=2) throw new AppError(429,'AI_BUSY','已有AI解释正在生成，请稍后重试');
  const task=(async () => {
    const result=await generateExplanation(report);
    // Async network work never holds a database transaction. Recheck freshness
    // because project data or knowledge may change while awaiting the provider.
    const latest=getReview(reviewId);
    if (latest.stale || latest.knowledgeBlocked) throw new AppError(409,'REVIEW_OUTDATED','等待AI期间资料或规则已变化，请重新预审');
    getDb().prepare('INSERT INTO ai_explanations VALUES (?,?,?) ON CONFLICT(review_id) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at').run(reviewId,JSON.stringify(result),result.generatedAt);
    return result;
  })();
  running.set(reviewId,task);
  try { return await task; } finally { running.delete(reviewId); }
}
