import { z } from 'zod';

const tri = z.enum(['yes', 'no', 'unknown']);
const numeric = z.number().finite().nonnegative().max(1000000).nullable();
const evidence = z.string().trim().max(2000).default('');
export const projectSchema = z.object({
  name: z.string().trim().min(1, '请填写项目名称').max(120),
  address: z.string().trim().max(500).default(''),
  state: z.string().trim().max(80).default('Maryland'),
  county: z.string().trim().max(100).default('Montgomery County'),
  product: z.enum(['detached_adu', 'pergola', 'sunroom']),
  construction: z.enum(['new', 'conversion']).default('new'),
  isDemo: z.boolean().default(false),
  jurisdiction: tri.default('unknown'),
  jurisdictionEvidence: evidence,
  confirmedBy: z.string().trim().max(100).default(''),
  unit: z.enum(['sqft', 'sqm']).default('sqft'),
  aduArea: numeric.default(null),
  homeArea: numeric.default(null),
  measurementConfirmed: tri.default('unknown'),
  measurementEvidence: evidence,
  existingAdus: z.number().int().min(0).max(20).nullable().default(null),
  principalDetached: tri.default('unknown'),
  shortTermRental: tri.default('unknown'),
  sameAddress: tri.default('unknown'),
  adults: z.number().int().min(0).max(100).nullable().default(null),
  zone: z.string().trim().max(80).default(''),
  siteReview: evidence,
  parkingReview: evidence,
  specialReview: evidence,
  licensingReview: evidence,
  notes: z.string().trim().max(4000).default(''),
}).strict();

export type ProjectInput = z.infer<typeof projectSchema>;
export type Project = ProjectInput & { id: string; revision: number; createdAt: string; updatedAt: string };
export type ItemStatus = 'PASS' | 'CONFLICT' | 'MISSING' | 'MANUAL_REVIEW' | 'NOT_APPLICABLE';
export type Conclusion = 'PRELIMINARY_PASS' | 'CONFLICT' | 'INSUFFICIENT_INFO' | 'PROFESSIONAL_REVIEW';
export type ReviewItem = { id: string; title: string; status: ItemStatus; observed: string; requirement: string; reason: string; action: string; owner: string; sourceId: string; locator: string };
export type Source = { id: string; title: string; issuer: string; url: string; checkedAt: string; effectiveFrom: string | null; locator: string; summary: string; excerpt: string; caveat: string; status: 'active' | 'reference'; hash?: string };
export type ReviewResult = { knowledgeHash?: string; ruleSnapshot?: Record<string, unknown>; scope: 'SUPPORTED' | 'UNKNOWN' | 'UNSUPPORTED'; conclusion: Conclusion | null; items: ReviewItem[]; release: string; assessedAt: string; engineVersion: string; coverage: string; sources: Source[]; permits: { title: string; body: string; sourceId: string }[]; timeline: string; summary: string };
export type Review = { id: string; projectId: string; sequence: number; projectRevision: number; createdAt: string; input: ProjectInput; result: ReviewResult; executionStatus: string };
export type ReviewNote = { id: string; reviewId: string; itemId: string | null; actor: string; kind: string; text: string; evidence: string; createdAt: string };
export const blankProject: ProjectInput = { ...projectSchema.parse({ name: '草稿', product: 'detached_adu' }), name: '' };
