import { blankProject, type ProjectInput } from './schema';
const complete: ProjectInput = {
  ...blankProject, name: '庭院新居 · 完整条件', address: '模拟地块 A · Montgomery County（非真实地址）', isDemo: true,
  jurisdiction: 'yes', jurisdictionEvidence: '模拟资料：示范县级主管辖区确认记录，不能用于真实项目', confirmedBy: '演示审核人（模拟）',
  aduArea: 600, homeArea: 1600, measurementConfirmed: 'yes', measurementEvidence: '模拟资料：双方使用相同计量口径，已向DPS确认',
  existingAdus: 0, principalDetached: 'yes', shortTermRental: 'no', sameAddress: 'yes', adults: 2, zone: 'R-60（模拟）',
  siteReview: '模拟专业确认：分区、用途、退界、高度、覆盖率、总居住标准与工程事项已核查；非真实审批记录。',
  parkingReview: '模拟专业确认：停车路径与适用豁免已核实。', specialReview: '模拟专业确认：特殊地块、环境与供排水条件已核查。', licensingReview: '模拟专业确认：当前许可路径及Bill 41-26影响已与主管机构核对。',
};
export const fixtures: ProjectInput[] = [
  complete,
  { ...complete, name: '林间小屋 · 面积冲突', aduArea: 1300, address: '模拟地块 B · Montgomery County（非真实地址）' },
  { ...complete, name: '花园居所 · 待补资料', homeArea: null, existingAdus: null, address: '模拟地块 C · Montgomery County（非真实地址）' },
  { ...complete, name: '阳光庭院 · 专业审核', siteReview: '', parkingReview: '', licensingReview: '', address: '模拟地块 D · Montgomery County（非真实地址）' },
];
