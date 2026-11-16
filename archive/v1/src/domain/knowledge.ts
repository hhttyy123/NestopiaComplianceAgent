import type { Source } from './schema';
export const RELEASE = 'MC-ADU-2026.11.15-r1';
export const SOURCES: Source[] = [
  {
    id: 'zta-26-06', title: 'Ordinance 20-36 · ZTA 26-06', issuer: 'Montgomery County Council',
    url: 'https://assets.montgomerycountymd.gov/files/2026-09/Ordinance%2020-36%20%28ZTA%2026-06%29.pdf',
    checkedAt: '2026-11-15', effectiveFrom: '2026-10-05', locator: '§3.3.3.A–C；PDF第5–9页', status: 'active',
    summary: '现行修订：一般面积比例75%，每地块一套ADU；短租限制；适用分区的附属建筑标准。旧版1200平方英尺三项最小值公式已删除。',
    excerpt: 'not greater than 75% of the size',
    caveat: '修订文本中的方括号和删除线代表删除，不能直接当作有效条文。面积计量口径、地块分区、例外及工程标准需逐项目确认。研发资料核对不等于专业签认。',
  },
  {
    id: 'dhca-guide', title: 'Class 3 ADU · 申请与许可指南', issuer: 'Montgomery County DHCA',
    url: 'https://www.montgomerycountymd.gov/DHCA/Resources/Files/Class%203%20ADU%20Info.pdf',
    checkedAt: '2026-11-15', effectiveFrom: null, locator: 'PDF第1–2页申请流程；后续旧版要求不用于现行数值判断', status: 'reference',
    summary: '提供Class 3许可申请及新建独立建筑许可入口。仅作为申请准备参考，具体费用、时序与要求需向主管部门重新核实。',
    excerpt: 'a new building permit is required',
    caveat: '该文件部分要求标注2025版，仍包含已被修订的面积及停车规定；不得整份作为现行法规。其许可流程和周期当前仅作参考。',
  },
  {
    id: 'bill-41-26', title: 'Bill 41-26 · 许可改革状态', issuer: 'Montgomery County Council · LIMS',
    url: 'https://apps.montgomerycountymd.gov/ccllims/BillDetailsPage?RecordId=2930',
    checkedAt: '2026-11-15', effectiveFrom: null, locator: '官方立法状态页', status: 'reference',
    summary: '官方页面记录2026-11-10已通过；生效栏尚未明确。涉及许可和业主居住要求的变动必须再次确认。',
    excerpt: 'Enacted on 11-10-2026',
    caveat: '通过不等于已生效。首版不自动判断业主居住、费用豁免和许可时序，统一列入合规人员核实。',
  },
];
export const COVERAGE = '自动核查一般面积比例、ADU数量、短租、主住宅类型、地址与成人数量；分区退界/高度/覆盖率、停车、特殊地块、许可及工程条件由人工核查。仅覆盖新建独立式ADU，不替代政府许可或企业报价决策。';
