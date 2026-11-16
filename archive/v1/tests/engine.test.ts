import { describe, it, expect } from 'vitest';
import { aggregate, evaluate } from '../src/domain/engine';
import { fixtures } from '../src/domain/fixtures';
import { SOURCES } from '../src/domain/knowledge';
import { projectSchema } from '../src/domain/schema';
const day = '2026-11-15';
const base = fixtures[0];
describe('有依据的预审与边界', () => {
  it.each([
    [0, 'PRELIMINARY_PASS'], [1, 'CONFLICT'], [2, 'INSUFFICIENT_INFO'], [3, 'PROFESSIONAL_REVIEW'],
  ])('案例%s产生预期状态%s', (index, status) => { expect(evaluate(fixtures[index as number], day).conclusion).toBe(status); });
  it('75%边界使用精确比例，不按显示百分比放行', () => {
    expect(evaluate({ ...base, aduArea: 1200, homeArea: 1600 }, day).items.find(i => i.id === 'area')?.status).toBe('PASS');
    expect(evaluate({ ...base, aduArea: 1200.01, homeArea: 1600 }, day).items.find(i => i.id === 'area')?.status).toBe('CONFLICT');
  });
  it('同一单位比例支持平方米', () => { expect(evaluate({ ...base, unit: 'sqm', aduArea: 60, homeArea: 160 }, day).conclusion).toBe('PRELIMINARY_PASS'); });
  it('未知不能当作否', () => { expect(evaluate({ ...base, shortTermRental: 'unknown' }, day).conclusion).toBe('INSUFFICIENT_INFO'); });
  it('计量口径不确定时不直接断言面积冲突', () => { expect(evaluate({ ...base, aduArea: 5000, measurementEvidence: '' }, day).items.find(i => i.id === 'area')?.status).toBe('MANUAL_REVIEW'); });
  it('县名不能替代辖区确认', () => { const r = evaluate({ ...base, jurisdictionEvidence: '' }, day); expect(r.scope).toBe('UNKNOWN'); expect(r.items).toHaveLength(1); });
  it.each([{ county: 'Los Angeles County' }, { state: 'California' }, { product: 'pergola' }, { construction: 'conversion' }, { jurisdiction: 'no' }])('超范围不套用其他规则 %j', (change) => { const r = evaluate(projectSchema.parse({ ...base, ...change }), day); expect(r.scope).toBe('UNSUPPORTED'); expect(r.conclusion).toBeNull(); expect(r.items).toHaveLength(0); });
  it('冲突与信息缺失同时保留', () => { const r = evaluate({ ...base, shortTermRental: 'yes', homeArea: null }, day); expect(r.conclusion).toBe('CONFLICT'); expect(r.items.some(i => i.status === 'MISSING')).toBe(true); });
  it('来源停用时停止自动法规判断', () => { const r = evaluate(base, day, SOURCES, true); expect(r.conclusion).toBe('PROFESSIONAL_REVIEW'); expect(r.items.some(i => i.id === 'area')).toBe(false); });
  it('关键来源不存在时不能通过', () => { expect(evaluate(base, day, []).conclusion).toBe('PROFESSIONAL_REVIEW'); });
  it('不把新规则用于已核对日期之前的项目', () => { expect(evaluate(base, '2026-09-01').conclusion).toBe('PROFESSIONAL_REVIEW'); });
  it('来源超过内部复核窗口后不能继续自动通过', () => { expect(evaluate(base, '2026-12-16').conclusion).toBe('PROFESSIONAL_REVIEW'); });
  it('零面积不能被比例公式放行', () => { expect(evaluate({ ...base, aduArea: 0 }, day).conclusion).toBe('INSUFFICIENT_INFO'); });
  it('空审查集不能通过', () => { expect(aggregate([])).toBe('PROFESSIONAL_REVIEW'); });
  it('原始事实及来源对象不被引擎修改', () => { const before = JSON.stringify({ base, SOURCES }); evaluate(base, day); expect(JSON.stringify({ base, SOURCES })).toBe(before); });
  it('每个自动判断都有已保存来源', () => { const r = evaluate(base, day); expect(r.items.every(i => r.sources.some(s => s.id === i.sourceId))).toBe(true); });
  it('非法尺寸和额外字段被拒绝', () => { expect(projectSchema.safeParse({ ...base, aduArea: -1 }).success).toBe(false); expect(projectSchema.safeParse({ ...base, isApproved: true }).success).toBe(false); });
});
