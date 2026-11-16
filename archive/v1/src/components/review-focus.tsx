'use client';
import { useState } from 'react';
import { ArrowUpRight, ChevronDown, Check, BookOpen } from 'lucide-react';
import type { Review, ReviewItem } from '../domain/schema';
import type { AiExplanation } from '../domain/ai';

const statusNames:Record<string,string>={CONFLICT:'需要调整',MISSING:'需要补充',MANUAL_REVIEW:'请专业人员确认'};
const priority:Record<string,number>={CONFLICT:0,MISSING:1,MANUAL_REVIEW:2};
export function ReviewFocus({report,initial,disabled,onSource,onNote,onEdit}:{report:Review;initial:AiExplanation|null;disabled:boolean;onSource:(id:string)=>void;onNote:(id:string)=>void;onEdit:()=>void}) {
  const [ai,setAi]=useState(initial);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [expandedAi,setExpandedAi]=useState<string|null>(null);
  const pending=report.result.items.filter(i=>!['PASS','NOT_APPLICABLE'].includes(i.status)).sort((a,b)=>(priority[a.status]??3)-(priority[b.status]??3));
  const completed=report.result.items.filter(i=>['PASS','NOT_APPLICABLE'].includes(i.status));
  async function explain(id:string) {
    if(expandedAi===id) { setExpandedAi(null); return; }
    setExpandedAi(id); setError('');
    if(ai?.status==='GENERATED' || busy) return;
    setBusy(true);
    try {
      const response=await fetch(`/api/reviews/${report.id}/explanation`,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
      const result=await response.json();if(!response.ok)throw new Error(result.message || '解释暂不可用');setAi(result);
    } catch(e){setError((e as Error).message);}finally{setBusy(false);}
  }
  function details(item:ReviewItem) {
    const explanation=ai?.items.find(i=>i.itemId===item.id);
    return <div className="focus-detail">
      <dl><div><dt>当前情况</dt><dd>{item.observed}</dd></div><div><dt>适用要求</dt><dd>{item.requirement}</dd></div><div><dt>判断说明</dt><dd>{item.reason}</dd></div></dl>
      <div className="focus-links"><button className="text-button" onClick={()=>onSource(item.sourceId)}><BookOpen size={14}/>查看依据<ArrowUpRight size={13}/></button><button className="text-button" disabled={disabled || busy} onClick={()=>explain(item.id)} aria-expanded={expandedAi===item.id}>{busy && expandedAi===item.id ? '正在解释…' : expandedAi===item.id ? '收起解释' : '进一步解释'}</button><button className="text-button" onClick={()=>onNote(item.id)}>记录审核意见</button></div>
      {expandedAi===item.id && <div className="inline-explanation" aria-live="polite">{busy ? <p>正在根据本项结果与依据生成解释…</p> : error ? <p role="alert">{error}</p> : ai?.status==='GENERATED' && explanation ? <><p>{explanation.explanation}</p><p>{explanation.nextStep}</p><small>DeepSeek · AI 辅助解释，需人工复核</small></> : <p>{ai?.message || '解释暂不可用，原规则说明仍保留。'}</p>}</div>}
    </div>;
  }
  return <div className="focus-report">
    {pending.length ? <section className="panel focus-actions"><div className="panel-heading"><div><h2>下一步</h2><p>{pending.length} 项需要处理，按影响程度排序</p></div></div>
      {pending.map(item=><article className={`focus-action focus-${item.status.toLowerCase()}`} key={item.id}>
        <div className="focus-action-heading"><span className="focus-status">{statusNames[item.status]}</span><h3>{item.title}</h3></div>
        <p className="focus-action-copy">{item.action}</p>
        <div className="focus-action-footer"><span>{item.owner}</span><button className="text-button" onClick={onEdit}>{item.status==='MISSING' ? '补充资料' : item.status==='CONFLICT' ? '调整项目资料' : '填写核实记录'}</button></div>
        <details className="focus-evidence"><summary>原因与依据<ChevronDown size={14}/></summary>{details(item)}</details>
      </article>)}
    </section> : <section className="focus-next"><h2>{report.result.scope==='UNSUPPORTED' ? '交由人工确认' : '本轮检查已完成'}</h2><p>{report.result.scope==='UNSUPPORTED' ? '当前项目超出试点范围，请联系合规人员确认适用规则。' : '保留项目依据，交合规人员确认后续许可与报价安排。'}</p></section>}
    {!!completed.length && <details className="panel completed-checks"><summary><span><Check size={17}/>已完成检查<span className="muted">{completed.length} 项</span></span><ChevronDown size={16}/></summary><div>{completed.map(item=><details className="completed-item" key={item.id}><summary>{item.title}<ChevronDown size={14}/></summary>{details(item)}</details>)}</div></details>}
    <p className="focus-footnote">预审辅助，不代表政府批准。{pending.length>0 && '补充或修改资料后，请重新预审。'}</p>
  </div>;
}
