import { DEFAULT_PACK, sourceIsUsable, scaledLte, type KnowledgePack, RULE_IDS } from './knowledge-pack';
import type { Conclusion, ItemStatus, ProjectInput, ReviewItem, ReviewResult, Source } from './schema';

export function aggregate(items: ReviewItem[]): Conclusion {
  if (items.some(i => i.status === 'CONFLICT')) return 'CONFLICT';
  if (items.some(i => i.status === 'MISSING')) return 'INSUFFICIENT_INFO';
  if (!items.length || items.every(i => i.status === 'NOT_APPLICABLE') || items.some(i => i.status === 'MANUAL_REVIEW')) return 'PROFESSIONAL_REVIEW';
  return 'PRELIMINARY_PASS';
}

export function evaluate(input: ProjectInput, assessmentDate: string, sources: Source[] = DEFAULT_PACK.sources, blocked = false, pack: KnowledgePack = DEFAULT_PACK): ReviewResult {
  const items: ReviewItem[] = [];
  const policy = pack.policy;
  const add = (id: string, title: string, status: ItemStatus, observed: string, requirement: string, reason: string, action: string, locator: string, owner = '销售 / 项目经理', sourceId = pack.primarySourceId) => {
    const ref = pack.references[id as typeof RULE_IDS[number]];
    items.push({ id, title, status, observed, requirement, reason, action: status === 'PASS' ? '' : action, locator: ref?.locator || locator, owner, sourceId: ref?.sourceId || sourceId });
  };
  const base = { release: pack.id, assessedAt: assessmentDate, engineVersion: '1.1.0', coverage: pack.coverage, sources: structuredClone(sources), ruleSnapshot: structuredClone(policy), items, permits: [], timeline: pack.timeline };
  const state = input.state.trim().toLowerCase();
  const county = input.county.trim().toLowerCase();
  if (!['maryland', 'md'].includes(state) || !['montgomery county', 'montgomery'].includes(county) || input.product !== 'detached_adu' || input.construction !== 'new' || input.jurisdiction === 'no') {
    return { ...base, scope: 'UNSUPPORTED', conclusion: null, summary: '当前仅支持Montgomery County、Maryland县级试点辖区内的新建独立式ADU。已保存项目，未套用试点法规。' };
  }
  if (!input.address || input.jurisdiction !== 'yes' || !input.jurisdictionEvidence.trim() || !input.confirmedBy.trim()) {
    add('jurisdiction', '主管辖区确认', 'MISSING', input.address || '地址未提供', '确认本地块属于县级试点规则适用范围，并记录依据和确认人', '地址或县名不能证明主管辖区。', '补充地址、辖区证据和确认人；如不属县级管辖请转人工。', '适用范围前置检查');
    return { ...base, scope: 'UNKNOWN', conclusion: 'INSUFFICIENT_INFO', summary: '先确认实际主管辖区，再开展适用规则预审。' };
  }
  add('jurisdiction', '主管辖区确认', 'PASS', `${input.address} · ${input.confirmedBy}`, '有辖区确认记录及依据', input.jurisdictionEvidence, '', '适用范围前置检查');
  const requiredSources = new Set([pack.primarySourceId, ...(['principal','count','area','short-rental','address','occupants'] as const).map(id => pack.references[id].sourceId)]);
  if (blocked || [...requiredSources].some(id => !sourceIsUsable(sources.find(s => s.id === id), assessmentDate, policy.sourceReviewDays))) {
    add('source', '法规版本可用性', 'MANUAL_REVIEW', blocked ? '规则集已停用' : '不在已核对来源的适用时间或复核窗口内', '使用有效且已核对的规则版本', '来源超过版本规定的复核天数需重新复核；这是资料维护策略，不代表法律到期。关键依据不可用，停止自动法规判断。', '由维护者核实、更新知识版本并验证；历史报告仍保留。', '规则与来源版本', '知识维护者');
    return { ...base, scope: 'SUPPORTED', conclusion: 'PROFESSIONAL_REVIEW', summary: '关键来源需要核实，未继续作出法规结论。' };
  }
  const yesNo = (id: string, title: string, value: 'yes'|'no'|'unknown', expected: 'yes'|'no', requirement: string, locator: string) => add(id, title, value === 'unknown' ? 'MISSING' : value === expected ? 'PASS' : 'CONFLICT', value === 'unknown' ? '未知' : value === 'yes' ? '是' : '否', requirement, value === 'unknown' ? '尚无该项事实。' : value === expected ? '已录入条件未见冲突，需保留项目事实证据。' : '录入条件与一般适用要求存在冲突。', value === 'unknown' ? '补充并核实该项事实。' : '交合规经理确认适用性与调整方向。', locator);
  yesNo('principal', '主住宅类型', input.principalDetached, 'yes', '主住宅为独立式单户住宅，ADU从属于主住宅', '§3.3.3.A.1 / C.1');
  add('count', '每地块ADU数量', input.existingAdus === null ? 'MISSING' : input.existingAdus + 1 <= policy.maxTotalAdus ? 'PASS' : 'CONFLICT', input.existingAdus === null ? '未知' : `已有${input.existingAdus}套；拟新增1套`, `每地块最多${policy.maxTotalAdus}套ADU`, input.existingAdus === null ? '尚未核实已有ADU数量。' : '按本次新增一套计算总数。', '核实既有住宅单元与批准记录，必要时交合规经理处理。', '§3.3.3.A.2.a');
  const measured = input.aduArea !== null && input.aduArea > 0 && input.homeArea !== null && input.homeArea > 0;
  const comparable = input.measurementConfirmed === 'yes' && !!input.measurementEvidence.trim();
  const areaStatus: ItemStatus = !measured ? 'MISSING' : !comparable ? 'MANUAL_REVIEW' : scaledLte(input.aduArea!, policy.areaDenominator, input.homeArea!, policy.areaNumerator) ? 'PASS' : 'CONFLICT';
  add('area', '一般面积比例', areaStatus, measured ? `${input.aduArea} / ${input.homeArea} ${input.unit === 'sqft' ? 'ft²' : 'm²'} · ${(input.aduArea! / input.homeArea! * 100).toFixed(1)}%` : '缺少面积或主住宅面积为零', `一般要求不大于主住宅面积的${policy.areaNumerator}/${policy.areaDenominator}（${policy.areaNumerator / policy.areaDenominator * 100}%）；双方须使用同一经确认的计量口径`, !measured ? '无法计算比例。' : !comparable ? '条款使用size，不能擅自沿用旧footprint口径。' : '以录入的同单位面积作精确比例比较。', !measured ? '补充两侧面积及单位。' : !comparable ? '请DPS/专业人员确认计量口径，并记录确认依据。' : '核实计量与适用性，讨论调整方案。', '§3.3.3.A.1；PDF第5页', '合规经理 / DPS');
  if (policy.shortTermRentalAllowed) add('short-rental','地块短租使用','NOT_APPLICABLE','本版本未设置短租禁止条件','按已发布知识版本执行','仍需人工核实许可适用性。','','');
  else yesNo('short-rental', '地块短租使用', input.shortTermRental, 'no', '同一地块不得存在或许可Short-Term Residential Rental', '§3.3.3.A.2.d');
  if (!policy.sameStreetAddressRequired) add('address','与主住宅共用街道地址','NOT_APPLICABLE','本版本未设置共用地址要求','按已发布知识版本执行','仍需人工核实许可适用性。','','');
  else yesNo('address', '与主住宅共用街道地址', input.sameAddress, 'yes', '一般许可路径下与主住宅使用相同街道地址', '§3.3.3.A.2.c.i');
  add('occupants', '成年居住人数', input.adults === null ? 'MISSING' : input.adults <= policy.maxAdultOccupants ? 'PASS' : 'CONFLICT', input.adults === null ? '未知' : `${input.adults}名成人`, `一般许可路径下18岁及以上不超过${policy.maxAdultOccupants}人；总人数另需Chapter 26检查`, '此项仅比较成人数量，不代替居住面积及消防审查。', '补充计划人数；总居住标准交专业人员确认。', '§3.3.3.A.2.c.iii');
  const manual = (id: string, title: string, record: string, requirement: string, locator: string) => add(id, title, record.trim() && input.confirmedBy.trim() ? 'PASS' : 'MANUAL_REVIEW', record.trim() ? `人工确认记录 · ${input.confirmedBy}` : '待专业核实', requirement, record.trim() || '首版不自动推断该专业条件。', '请合规经理或专业人员核实，填写依据、结论与责任人后重审。', locator, '合规经理 / 专业工程师');
  manual('site', '分区与地块建设标准', input.siteReview, '确认分区、许可用途、退界、高度、覆盖率、总居住标准与工程边界', '§3.3.3.A.2.c.iv–v / C.2');
  manual('parking', '停车与豁免路径', input.parkingReview, '核实距轨道站距离、现有停车、额外车位或Hearing Examiner豁免', '§3.3.3.A.2.c.ii');
  manual('special', '特殊地块与工程限制', input.specialReview, '核查覆盖区、历史/洪泛/环境限制、供排水及工程问题；本系统不替代完整工程审核', '适用范围、覆盖区及专业边界');
  manual('license', '许可适用性与近期改革', input.licensingReview, '确认DHCA许可、建筑及专业分项许可；核实Bill 41-26生效及影响', '§3.3.3.A.2.c；Bill 41-26');
  const conclusion = aggregate(items);
  return { ...base, scope: 'SUPPORTED', conclusion, permits: structuredClone(pack.permits), summary: ({ PRELIMINARY_PASS: '本报告所列条件未发现冲突，人工事项已有确认记录；不等于批准建设或允许报价。', CONFLICT: '发现与已核对一般规则的冲突，请先处理；其他缺失与人工事项仍需完成。', INSUFFICIENT_INFO: '缺少完成预审所需的项目事实，请按待办补充。', PROFESSIONAL_REVIEW: '已完成可标准化检查，仍有专业条件或许可事项需要人工确认。' })[conclusion] };
}
