import { z } from 'zod';

export const products = ['ADU（附属住宅）'] as const;
export const methods = ['新建独立建筑'] as const;
export const purposes = ['自住／家庭使用', '长期出租', '短期出租', '其他', '尚未确定'] as const;
export const coreQuestions = [
  '能不能建：核对主管辖区、分区、用途、尺寸、退界与特殊地块限制。',
  '需要哪些许可：列出许可／执照、受理部门及必要材料。',
  '大概多久：查找官方办理周期、起算条件；没有依据时明确未知。',
  '报价前还缺什么：列出阻断判断的事实、核实方式与下一步。',
] as const;
export const states = ['Maryland'];
// These are navigation choices, not assertions about regulatory coverage.
export const counties:Record<string,string[]> = {
  Maryland:['Montgomery County'],
};
const optionalNumber=z.number().finite().positive().max(100000000).optional();
const tri=z.enum(['YES','NO','UNKNOWN']);
export const projectDetailsSchema=z.object({
  product:z.enum(products),otherProduct:z.string().trim().max(120).default(''),
  method:z.enum(methods),otherMethod:z.string().trim().max(120).default(''),
  country:z.literal('United States'),state:z.string().trim().min(1).max(80).refine(v=>states.includes(v),'请选择州'),
  county:z.literal('Montgomery County'),city:z.string().trim().max(120).default(''),street:z.string().trim().max(250).default(''),parcel:z.string().trim().max(100).default(''),
  jurisdiction:z.enum(['UNKNOWN','COUNTY','MUNICIPAL']).default('UNKNOWN'),
  unit:z.enum(['IMPERIAL','METRIC']),area:optionalNumber,length:optionalNumber,width:optionalNumber,height:optionalNumber,
  lotArea:optionalNumber,primaryArea:optionalNumber,frontSetback:z.number().finite().min(0).max(100000000).optional(),sideSetback:z.number().finite().min(0).max(100000000).optional(),rearSetback:z.number().finite().min(0).max(100000000).optional(),
  purpose:z.enum(purposes),otherPurpose:z.string().trim().max(200).default(''),
  zoning:z.string().trim().max(100).default(''),water:z.enum(['PUBLIC','WELL','UNKNOWN']),sewer:z.enum(['PUBLIC','SEPTIC','UNKNOWN']),
  flood:tri,historic:tri,hoa:tri,existingHome:tri,
  primaryType:z.enum(['DETACHED','OTHER','UNKNOWN']).default('UNKNOWN'),
  existingAdus:z.number().int().min(0).max(20).optional(),ownerOccupied:tri.default('UNKNOWN'),shortTermRental:tri.default('UNKNOWN'),
  parkingSpaces:z.number().int().min(0).max(100).optional(),parkingArea:optionalNumber,transitWithinMile:tri.default('UNKNOWN'),
  buildingSeparation:z.number().min(0).max(100000).optional(),lotCoverage:z.number().min(0).max(100).optional(),
  sprinklers:tri.default('UNKNOWN'),fireAccess:tri.default('UNKNOWN'),structurePlans:tri.default('UNKNOWN'),
  drainagePlan:tri.default('UNKNOWN'),electricalPlan:tri.default('UNKNOWN'),treeImpact:tri.default('UNKNOWN'),easement:tri.default('UNKNOWN'),
  accessibilityPlan:tri.default('UNKNOWN'),hoaApproval:tri.default('UNKNOWN'),
  referenceUrls:z.array(z.url().max(2000).refine(v=>v.startsWith('https://'),'依据链接须使用HTTPS')).max(5).default([]),
  notes:z.string().trim().max(2000).default(''),question:z.string().trim().max(2000).default(''),
}).strict().superRefine((v,c)=>{if(v.purpose==='其他'&&!v.otherPurpose)c.addIssue({code:'custom',path:['otherPurpose'],message:'请补充具体用途'});if(v.jurisdiction==='MUNICIPAL')c.addIssue({code:'custom',path:['jurisdiction'],message:'当前仅支持由Montgomery County受理的项目，不支持独立市镇审批'});});
export type ProjectDetails=z.infer<typeof projectDetailsSchema>;
const triLabel={YES:'是',NO:'否',UNKNOWN:'未知'};
export function projectStrings(d:ProjectDetails){
  const area=d.unit==='IMPERIAL'?'平方英尺':'平方米',length=d.unit==='IMPERIAL'?'英尺':'米';
  const dimensions=([['拟建面积','area',area],['长度','length',length],['宽度','width',length],['高度','height',length],['地块面积','lotArea',area],['主屋面积','primaryArea',area],['前退界','frontSetback',length],['侧退界','sideSetback',length],['后退界','rearSetback',length]] as const).map(([label,key,unit])=>`${label}：${d[key]===undefined?'未知':`${d[key]} ${unit}`}`);
  return {product:`${d.product} · ${d.method}`,
    location:[d.street,d.city,d.county,d.state,d.country].filter(Boolean).join(', '),
    facts:[`用途：${d.purpose==='其他'?d.otherPurpose:d.purpose}`,...dimensions,`地块编号：${d.parcel||'未知'}`,`分区：${d.zoning||'未知'}`,`主管辖区（用户填报，未经核验）：${{UNKNOWN:'未知',COUNTY:'县',MUNICIPAL:'市镇'}[d.jurisdiction]}`,`已有主屋：${triLabel[d.existingHome]}`,`主屋类型：${{DETACHED:'单户独立住宅',OTHER:'其他',UNKNOWN:'未知'}[d.primaryType]}`,`已有ADU数量：${d.existingAdus??'未知'}`,`业主居住在主屋或ADU：${triLabel[d.ownerOccupied]}`,`同地块短租：${triLabel[d.shortTermRental]}`,`现场车位数：${d.parkingSpaces??'未知'}`,`停车面积：${d.parkingArea===undefined?'未知':d.parkingArea+' '+area}`,`轨道站一英里内：${triLabel[d.transitWithinMile]}`,`建筑间距：${d.buildingSeparation===undefined?'未知':d.buildingSeparation+' '+length}`,`地块覆盖率：${d.lotCoverage===undefined?'未知':d.lotCoverage+'%'}`,`供水：${{PUBLIC:'公共供水',WELL:'私人井',UNKNOWN:'未知'}[d.water]}`,`排污：${{PUBLIC:'公共排污',SEPTIC:'化粪系统',UNKNOWN:'未知'}[d.sewer]}`,`洪泛区：${triLabel[d.flood]}`,`历史保护区：${triLabel[d.historic]}`,`HOA：${triLabel[d.hoa]}`,...([['sprinklers','喷淋方案'],['fireAccess','消防通道条件已核实'],['structurePlans','结构与基础图纸'],['drainagePlan','排水方案'],['electricalPlan','电气方案'],['treeImpact','涉及树木或生态敏感区'],['easement','存在地役权'],['accessibilityPlan','无障碍适用性及方案已核实'],['hoaApproval','已取得HOA同意']] as const).map(([key,label])=>label+'：'+triLabel[d[key]]),`资料链接：${d.referenceUrls.join('；')||'未提供'}`,`其他事实：${d.notes||'无补充'}`,'固定调查问题：',...coreQuestions,`用户额外问题：${d.question||'无'}`].join('\n')};
}
export function mapsUrl(location:string){return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`;}
