import { z } from 'zod';
import { COVERAGE, RELEASE, SOURCES } from './knowledge';
import { fixtures } from './fixtures';
import { projectSchema } from './schema';

const text = z.string().trim().min(1).max(6000);
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v => { const n = Date.parse(v); return Number.isFinite(n) && new Date(n).toISOString().slice(0,10) === v; }, '日期无效');
export const RULE_IDS = ['principal','count','area','short-rental','address','occupants','site','parking','special','license'] as const;
const sourceSchema = z.object({
  id: text.max(100), title: text, issuer: text, url: z.url().refine(v => {
    const url = new URL(v); return url.protocol === 'https:' && (url.hostname === 'montgomerycountymd.gov' || url.hostname.endsWith('.montgomerycountymd.gov'));
  }, '本试点只接受Montgomery County官方来源地址'),
  checkedAt: day, effectiveFrom: day.nullable(), locator: text, summary: text,
  excerpt: text, caveat: text, status: z.enum(['active','reference']),
}).strict();
const reference = z.object({ sourceId: text.max(100), locator: text }).strict();
export const policySchema = z.object({
  areaNumerator: z.number().int().min(1).max(1000),
  areaDenominator: z.number().int().min(1).max(1000),
  maxTotalAdus: z.number().int().min(1).max(10),
  maxAdultOccupants: z.number().int().min(1).max(100),
  shortTermRentalAllowed: z.boolean(),
  sameStreetAddressRequired: z.boolean(),
  sourceReviewDays: z.number().int().min(1).max(30),
}).strict().refine(p => p.areaNumerator <= p.areaDenominator, '面积比例必须不大于1');
export type KnowledgePolicy = z.infer<typeof policySchema>;
const conclusion = z.enum(['PRELIMINARY_PASS','CONFLICT','INSUFFICIENT_INFO','PROFESSIONAL_REVIEW']);
const category = z.enum(['normal','conflict','missing','unsupported','manual','boundary']);
export const knowledgePackSchema = z.object({
  formatVersion: z.literal(1),
  id: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{2,99}$/),
  scope: z.literal('montgomery-county-md-new-detached-adu'),
  coverage: text,
  primarySourceId: text.max(100),
  policy: policySchema,
  sources: z.array(sourceSchema).min(1).max(30),
  references: z.object(Object.fromEntries(RULE_IDS.map(id => [id, reference])) as Record<typeof RULE_IDS[number], typeof reference>).strict(),
  permits: z.array(z.object({ title: text, body: text, sourceId: text.max(100) }).strict()).min(1).max(15),
  timeline: text,
  verification: z.object({ level: z.enum(['public-source-research','professional-review']), actor: text.max(100), checkedAt: day, evidence: text }).strict(),
  cases: z.array(z.object({
    id: z.string().regex(/^[A-Za-z0-9._-]{1,100}$/), category,
    assessmentDate: day, input: projectSchema.refine(p => p.isDemo, '验证案例必须明确标注模拟项目'),
    expectedScope: z.enum(['SUPPORTED','UNKNOWN','UNSUPPORTED']), expectedConclusion: conclusion.nullable(),
    expectedItems: z.record(z.string(), z.enum(['PASS','CONFLICT','MISSING','MANUAL_REVIEW','NOT_APPLICABLE'])).optional(),
  }).strict()).min(6).max(100),
}).strict().superRefine((pack, ctx) => {
  const issue = (message: string) => ctx.addIssue({ code: 'custom', message });
  const sources = new Map(pack.sources.map(s => [s.id,s]));
  if (sources.size !== pack.sources.length) issue('来源ID重复');
  if (sources.get(pack.primarySourceId)?.status !== 'active') issue('主要依据必须是已核对的现行来源');
  for (const [id, ref] of Object.entries(pack.references)) if (!sources.has(ref.sourceId)) issue(`${id}引用的来源不存在`);
  for (const id of ['principal','count','area','short-rental','address','occupants'] as const) {
    if (sources.get(pack.references[id].sourceId)?.status !== 'active') issue(`${id}自动判断不能使用仅供参考的资料`);
  }
  for (const permit of pack.permits) if (!sources.has(permit.sourceId)) issue(`许可项引用的来源不存在：${permit.title}`);
  if (new Set(pack.cases.map(c => c.id)).size !== pack.cases.length) issue('验证案例ID重复');
  for (const type of category.options) if (!pack.cases.some(c => c.category === type)) issue(`缺少${type}验证案例`);
  for (const test of pack.cases) {
    const incompatible = test.expectedScope === 'UNSUPPORTED' ? test.expectedConclusion !== null : test.expectedConclusion === null;
    if (incompatible) issue(`案例${test.id}的范围与结论不匹配`);
    for (const id of Object.keys(test.expectedItems || {})) if (!['jurisdiction','source',...RULE_IDS].includes(id)) issue(`案例${test.id}包含未知审查事项${id}`);
  }
});
export type KnowledgePack = z.infer<typeof knowledgePackSchema>;

export const DEFAULT_PACK: KnowledgePack = knowledgePackSchema.parse({
  formatVersion:1, id:RELEASE, scope:'montgomery-county-md-new-detached-adu', coverage:COVERAGE,
  primarySourceId:'zta-26-06',
  policy: { areaNumerator:3, areaDenominator:4, maxTotalAdus:1, maxAdultOccupants:2, shortTermRentalAllowed:false, sameStreetAddressRequired:true, sourceReviewDays:30 },
  sources:SOURCES,
  references: Object.fromEntries(RULE_IDS.map(id => [id, { sourceId:'zta-26-06', locator: ({
    principal:'§3.3.3.A.1 / C.1', count:'§3.3.3.A.2.a', area:'§3.3.3.A.1；PDF第5页',
    'short-rental':'§3.3.3.A.2.d', address:'§3.3.3.A.2.c.i', occupants:'§3.3.3.A.2.c.iii',
    site:'§3.3.3.A.2.c.iv–v / C.2', parking:'§3.3.3.A.2.c.ii', special:'适用范围、覆盖区及专业边界', license:'§3.3.3.A.2.c；许可改革需另行核实',
  })[id] }])),
  permits:[
    { title:'新建建筑许可 · DPS', body:'新建独立建筑需确认建筑许可及图纸要求。专业分项、地块审批由主管机构按项目确认。', sourceId:'dhca-guide' },
    { title:'ADU许可路径 · DHCA', body:'核实Class 3许可适用、材料与办理顺序；旧版文件仅作准备参考，近期许可改革需再次确认。', sourceId:'bill-41-26' },
  ],
  timeline:'暂无可确认的总审批周期。资料齐全度、并行审查及许可改革可能影响时长，需向DPS与DHCA核实。',
  verification: { level:'public-source-research', actor:'研发公开资料整理', checkedAt:'2026-11-15', evidence:'阅读Ordinance 20-36及官方许可资料；未获企业合规经理或PE专业签认。' },
  cases:[
    { id:'normal', category:'normal', assessmentDate:'2026-11-15', input:fixtures[0], expectedScope:'SUPPORTED', expectedConclusion:'PRELIMINARY_PASS' },
    { id:'conflict', category:'conflict', assessmentDate:'2026-11-15', input:fixtures[1], expectedScope:'SUPPORTED', expectedConclusion:'CONFLICT', expectedItems:{area:'CONFLICT'} },
    { id:'missing', category:'missing', assessmentDate:'2026-11-15', input:fixtures[2], expectedScope:'SUPPORTED', expectedConclusion:'INSUFFICIENT_INFO' },
    { id:'manual', category:'manual', assessmentDate:'2026-11-15', input:fixtures[3], expectedScope:'SUPPORTED', expectedConclusion:'PROFESSIONAL_REVIEW' },
    { id:'unsupported', category:'unsupported', assessmentDate:'2026-11-15', input:{...fixtures[0],state:'California'}, expectedScope:'UNSUPPORTED', expectedConclusion:null },
    { id:'area-boundary', category:'boundary', assessmentDate:'2026-11-15', input:{...fixtures[0],aduArea:1200}, expectedScope:'SUPPORTED', expectedConclusion:'PRELIMINARY_PASS', expectedItems:{area:'PASS'} },
  ],
});

export function assessmentToday() {
  return new Intl.DateTimeFormat('en-CA', { timeZone:'America/New_York', year:'numeric', month:'2-digit', day:'2-digit' }).format(new Date());
}
export function sourceIsUsable(source: KnowledgePack['sources'][number] | undefined, date: string, reviewDays: number) {
  if (!source || source.status !== 'active' || !source.effectiveFrom || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const age = (Date.parse(date) - Date.parse(source.checkedAt)) / 86400000;
  return Number.isFinite(age) && age >= 0 && age <= reviewDays && date >= source.effectiveFrom;
}

// Compare decimal input as integers with a common scale. Display rounding must
// never decide whether a project is on the legal boundary.
export function scaledLte(left: number, leftFactor: number, right: number, rightFactor: number) {
  const decimal = (n: number) => {
    const [mantissa, exponent='0'] = n.toString().toLowerCase().split('e');
    const parts = mantissa.split('.');
    return { coefficient:BigInt(parts.join('')), scale:(parts[1]?.length || 0)-Number(exponent) };
  };
  const a=decimal(left), b=decimal(right), scale=Math.max(a.scale,b.scale);
  return a.coefficient*BigInt(leftFactor)*10n**BigInt(scale-a.scale) <= b.coefficient*BigInt(rightFactor)*10n**BigInt(scale-b.scale);
}
