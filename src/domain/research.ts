import { z } from 'zod';
import { evaluationSchema } from './evaluation';
import { projectDetailsSchema,projectStrings } from './project';
export const researchInput = z.object({
  product:z.string().trim().min(1).max(200), location:z.string().trim().min(1).max(1000),
  facts:z.string().trim().min(1).max(12000), refresh:z.boolean().default(false),
  details:projectDetailsSchema.optional(),parentId:z.string().uuid().optional(),
}).strict().transform(v=>v.details?{...v,...projectStrings(v.details)}:v);
export type ResearchInput=z.infer<typeof researchInput>;
export type Evidence={extractionVersion?:number;sourceKind?:'REGULATION'|'CASE';id:string;url:string;title:string;hash:string;fetchedAt:string;checkedAt:string;reused:boolean;paragraphs:{id:string;text:string}[]};
export const answerStructureVersion='evaluation-v2';
export const answerSchema=z.object({category:z.enum(['BUILDABILITY','PERMITS','TIMELINE']),answer:z.string().min(1).max(90),basis:z.enum(['EVIDENCE','ESTIMATE','INPUT_REQUIRED']),conditions:z.array(z.string().max(160)).max(5),findingIndexes:z.array(z.number().int().min(0)).min(1).max(20)}).strict();
export const analysisSchema=z.object({
  evaluation:evaluationSchema.optional(),
  answers:z.array(answerSchema).length(3).optional(),
  summary:z.string().min(1).max(160), jurisdiction:z.string().min(1).max(400),
  findings:z.array(z.object({category:z.enum(['BUILDABILITY','PERMITS','TIMELINE','OTHER']).optional(),topic:z.string().min(1).max(60),status:z.enum(['CONDITIONAL','CONFLICT','UNKNOWN']),advice:z.string().min(1).max(240),
    citations:z.array(z.object({paragraphId:z.string(),quote:z.string().min(10).max(1200)}).strict()).max(8),
  }).strict()).min(1).max(40),
  missing:z.array(z.string().max(200)).max(8),nextSteps:z.array(z.string().max(100)).min(1).max(3),
  timing:z.string().min(1).max(400),
}).strict();
export type ResearchRun={checkedMaterials?:string[];quality?:{checkedAt:string;issues:unknown[]};checkpoint?:{base?:z.infer<typeof analysisSchema>;assessment?:Pick<z.infer<typeof evaluationSchema>,'checks'|'permits'>};deletedAt?:string;answerStructureVersion?:string;id:string;requestKey:string;input:ResearchInput;status:'RUNNING'|'COMPLETE'|'FAILED';phase:string;createdAt:string;updatedAt:string;error?:string;
  plan?:{jurisdiction:string;queries:string[];missing:string[];issues:string[]};
  analysis?:z.infer<typeof analysisSchema>;evidence:Evidence[];queries:string[];warnings:string[];metrics:{searchRequests:number;fetchRequests:number;queryHits:number;sourceHits:number};
  experienceIds:string[];model:string;version:string};
