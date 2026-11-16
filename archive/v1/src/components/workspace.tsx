'use client';

import { useCallback, useEffect, useId, useRef, useState, type ReactNode, type FormEvent } from 'react';
import { ArrowLeft, ArrowRight, ArrowUpRight, BookOpen, CheckCircle2, ChevronDown, ChevronRight, ClipboardCheck, FileCheck2, FileText, FolderOpen, History, Info, Layers3, MapPin, MoreHorizontal, PanelLeft, Pencil, Plus, Search, ShieldCheck, TriangleAlert, X } from 'lucide-react';
import { ReviewFocus } from './review-focus';
import type { AiExplanation } from '../domain/ai';
import { blankProject, type Project, type ProjectInput, type Review, type ReviewNote, type Source } from '@/domain/schema';

type ProjectRow = Project & { latestReview: Review | null };
type FullReview = Review & { aiExplanation:AiExplanation|null; notes: ReviewNote[]; stale: boolean; knowledgeBlocked: boolean };
type Knowledge = { release: string; coverage: string; sources: Source[]; blocked: boolean; control?: { reason: string }; changes: { id: string; actor: string; proposal: string; createdAt: string; status: string }[] };
const labels: Record<string, string> = { PRELIMINARY_PASS: '初步通过', CONFLICT: '发现冲突', INSUFFICIENT_INFO: '信息不足', PROFESSIONAL_REVIEW: '需专业审核', UNSUPPORTED: '超出支持范围', DRAFT: '待预审', PASS: '符合 / 已确认', MISSING: '待补充', MANUAL_REVIEW: '需人工核实', NOT_APPLICABLE: '不适用', manual: '待补充 / 待审核' };
const tone: Record<string, string> = { PRELIMINARY_PASS: 'green', CONFLICT: 'red', INSUFFICIENT_INFO: 'orange', PROFESSIONAL_REVIEW: 'blue', UNSUPPORTED: 'gray', DRAFT: 'gray', PASS: 'green', MISSING: 'orange', MANUAL_REVIEW: 'blue' };
const statusOf = (review?: Review | null) => review ? review.result.scope === 'UNSUPPORTED' ? 'UNSUPPORTED' : review.result.conclusion || 'DRAFT' : 'DRAFT';
const date = (value: string) => new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value));
function briefResult(review:Review) {
  if(review.result.scope==='UNSUPPORTED')return '当前项目超出试点范围，需要人工确认适用规则。';
  const conflicts=review.result.items.filter(i=>i.status==='CONFLICT');
  if(conflicts.length)return `${conflicts[0].title}${conflicts.length>1 ? '等'+conflicts.length+'项' : ''}与当前规则存在冲突，请先处理。`;
  const missing=review.result.items.filter(i=>i.status==='MISSING');
  if(missing.length)return `还需补充${missing[0].title}${missing.length>1 ? '等'+missing.length+'项信息' : '信息'}，才能继续确认。`;
  const manual=review.result.items.filter(i=>i.status==='MANUAL_REVIEW');
  if(manual.length)return `${manual.length}项条件需要专业人员确认，下一步已列在下方。`;
  return '本轮所列条件未发现冲突，后续仍需确认许可与报价安排。';
}
const product = (key: string) => ({ detached_adu: '独立式 ADU', pergola: 'Pergola', sunroom: '阳光房' })[key] || key;

async function api<T>(url: string, method = 'GET', body?: unknown): Promise<T> {
  const response = await fetch(`/api/${url}`, { method, cache: 'no-store', headers: body === undefined ? {} : { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const value = await response.json();
  if (!response.ok) throw new Error(value.message || '操作未完成，请重试');
  return value;
}
function Badge({ status }: { status: string }) { return <span className={`badge ${tone[status] || 'gray'}`}><span />{labels[status] || status}</span>; }
function IconBox({ children, color = 'blue', small = false }: { children: ReactNode; color?: string; small?: boolean }) { return <span className={`icon-box ${color} ${small ? 'small' : ''}`}>{children}</span>; }
function SystemGlyph({ kind, size = 22 }: { kind: 'projects'|'knowledge'|'help'|'document'; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" className="system-glyph">
    {kind === 'projects' && <><path d="M3 5.3A2.3 2.3 0 0 1 5.3 3h4.1c.7 0 1.3.3 1.8.8l1.5 1.7h6A2.3 2.3 0 0 1 21 7.8v1H3V5.3Z" fill="currentColor" opacity=".45"/><path d="M3 8h18v10.2a2.3 2.3 0 0 1-2.3 2.3H5.3A2.3 2.3 0 0 1 3 18.2V8Z" fill="currentColor"/></>}
    {kind === 'knowledge' && <><path d="M3 4.2c3-.9 5.6-.4 8 1.1v15c-2.4-1.5-5-2-8-1.1V4.2ZM21 4.2c-3-.9-5.6-.4-8 1.1v15c2.4-1.5 5-2 8-1.1V4.2Z" fill="currentColor" opacity=".85"/><path d="M12 6v14.5" stroke="currentColor" strokeWidth="1.3"/></>}
    {kind === 'help' && <><circle cx="12" cy="12" r="9.2" fill="currentColor" opacity=".15"/><path d="M9.4 9a2.6 2.6 0 0 1 5.2.2c0 1.6-2.6 2-2.6 3.8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/><circle cx="12" cy="16.1" r="1" fill="currentColor"/></>}
    {kind === 'document' && <><path d="M6 2.8h8l4 4V20a1.2 1.2 0 0 1-1.2 1.2H6A1.2 1.2 0 0 1 4.8 20V4A1.2 1.2 0 0 1 6 2.8Z" fill="currentColor" opacity=".12"/><path d="M14 2.8v3a1 1 0 0 0 1 1h3M8 11h7M8 14h7M8 17h4" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round"/></>}
  </svg>;
}
function ProjectCover() {
  return <span className="project-cover" aria-hidden="true"><SystemGlyph kind="document" size={30}/></span>;
}
function Dialog({ title, subtitle, children, onClose, wide = false }: { title: string; subtitle?: string; children: ReactNode; onClose: () => void; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => { ref.current?.showModal(); }, []);
  return <dialog ref={ref} className={`modal ${wide ? 'wide' : ''}`} onCancel={e => { e.preventDefault(); onClose(); }} onClick={e => { if (e.target === e.currentTarget) onClose(); }} aria-labelledby={titleId}>
    <div className="modal-heading"><div><h2 id={titleId}>{title}</h2>{subtitle && <p>{subtitle}</p>}</div><button className="icon-button" onClick={onClose} aria-label="关闭"><X size={20} /></button></div>{children}
  </dialog>;
}

export default function Workspace() {
  const [page, setPage] = useState<'projects'|'knowledge'|'help'>('projects');
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [aiReady,setAiReady] = useState(false);
  const [knowledge, setKnowledge] = useState<Knowledge | null>(null);
  const [selected, setSelected] = useState<Project | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [report, setReport] = useState<FullReview | null>(null);
  const [tab, setTab] = useState('report');
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [form, setForm] = useState<Project | 'new' | null>(null);
  const [source, setSource] = useState<Source | null>(null);
  const [note, setNote] = useState(false);
  const [noteItem,setNoteItem] = useState('');
  const [utilities,setUtilities] = useState(false);
  const [control, setControl] = useState(false);
  const [change, setChange] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sidebarVisible, setSidebarVisible] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const refresh = useCallback(async () => {
    const [ps, ks, health] = await Promise.all([api<ProjectRow[]>('projects'), api<Knowledge>('knowledge'),api<{ai:{configured:boolean}}>('health')]);
    setAiReady(health.ai.configured);
    setProjects(ps); setKnowledge(ks);
  }, []);
  const openProject = useCallback(async (id: string, reviewId?: string) => {
    const detail = await api<{ project: Project; reviews: Review[] }>(`projects/${id}`);
    setSelected(detail.project); setReviews(detail.reviews); setPage('projects');
    const target = reviewId || detail.reviews[0]?.id;
    setReport(target ? await api<FullReview>(`reviews/${target}`) : null); setTab(target ? 'report' : 'facts');
    window.history.replaceState({}, '', `/?project=${id}${target ? `&review=${target}` : ''}`);
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, []);
  useEffect(() => {
    let mounted = true;
    (async () => {
      try { await refresh(); const params = new URLSearchParams(window.location.search); if (params.get('project')) await openProject(params.get('project')!, params.get('review') || undefined); }
      catch (e) { if (mounted) setError((e as Error).message); }
      finally { if (mounted) setLoading(false); }
    })(); return () => { mounted = false; };
  }, [refresh, openProject]);
  useEffect(() => { if (toast) { const timer = setTimeout(() => setToast(''), 4000); return () => clearTimeout(timer); } }, [toast]);
  async function work(fn: () => Promise<void>) { setBusy(true); setError(''); try { await fn(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }
  function home(next: typeof page = 'projects') { setPage(next); setSelected(null); setReport(null); window.history.replaceState({}, '', '/'); window.scrollTo({ top: 0, behavior: 'instant' }); }
  const save = async (input: ProjectInput) => {
    const saved = form && form !== 'new' ? await api<Project>(`projects/${form.id}`, 'PATCH', { input, expectedRevision: form.revision }) : await api<Project>('projects', 'POST', input);
    setForm(null); await refresh(); await openProject(saved.id); setToast('项目已保存');
  };
  const run = () => selected && work(async () => { const result = await api<Review>(`projects/${selected.id}/reviews`, 'POST', { expectedRevision: selected.revision, requestKey: crypto.randomUUID() }); await refresh(); await openProject(selected.id, result.id); setToast('预审已完成，结果与依据已保存'); });
  const showSource = (id: string) => setSource((report?.result.sources || knowledge?.sources)?.find(s => s.id === id) || null);
  const filtered = projects.filter(p => `${p.name} ${p.address}`.toLowerCase().includes(query.toLowerCase())).filter(p => filter === 'all' || (filter === 'attention' ? ['CONFLICT','INSUFFICIENT_INFO','PROFESSIONAL_REVIEW'].includes(statusOf(p.latestReview)) : filter === 'manual' ? ['INSUFFICIENT_INFO','PROFESSIONAL_REVIEW'].includes(statusOf(p.latestReview)) : statusOf(p.latestReview) === filter));
  const counts = {
    total: projects.length,
    passed: projects.filter(p => statusOf(p.latestReview) === 'PRELIMINARY_PASS').length,
    attention: projects.filter(p => statusOf(p.latestReview) === 'CONFLICT').length,
    manual: projects.filter(p => ['INSUFFICIENT_INFO','PROFESSIONAL_REVIEW'].includes(statusOf(p.latestReview))).length,
  };

  return <div className={`app-shell ${sidebarVisible ? '' : 'sidebar-collapsed'}`}>
    <aside className="sidebar">
      <a className="brand" href="/" aria-label="Nestopia 工作台首页"><span className="brand-icon"><svg width="25" height="25" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 18V6h2.7l6.6 12H18V6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"/></svg></span><span>Nestopia<span className="brand-sub">合规工作空间</span></span></a>
      <div className="workspace-label">浏览</div>
      <nav aria-label="主导航"><button className={page === 'projects' ? 'active' : ''} aria-current={page === 'projects' ? 'page' : undefined} onClick={() => home()}><SystemGlyph kind="projects"/>项目<span className="nav-count">{projects.length}</span></button><button onClick={()=>setUtilities(true)}><MoreHorizontal size={22}/>更多</button></nav>
      <div className="sidebar-bottom"><div className="quiet-note"><ShieldCheck size={19}/><p>预审辅助，人工决策。<span>有依据，可追溯。</span></p></div><div className="profile"><span className="avatar">N</span><div><strong>本地工作空间</strong><span>{aiReady ? 'DeepSeek Flash · 已配置' : '规则模式 · AI未配置'}</span></div></div></div>
    </aside>
    <main>
      <header className="topbar"><div className="toolbar-leading"><button className="icon-button sidebar-toggle" aria-label={sidebarVisible ? '收起侧栏' : '显示侧栏'} onClick={() => setSidebarVisible(v => !v)}><PanelLeft size={21}/></button><div className="breadcrumbs"><strong>{page === 'knowledge' ? '法规与规则' : page === 'help' ? '使用说明' : selected ? '项目详情' : '所有项目'}</strong></div></div><div className="topbar-right"><span className="live-dot"/>已存储在本机<span className="header-divider"/><span className="avatar small-avatar">N</span></div></header>
      {error && <div className="error-banner" role="alert"><TriangleAlert size={18}/><span>{error}</span><button onClick={() => setError('')} aria-label="关闭错误提示"><X size={17}/></button></div>}
      {loading ? <div className="loading"><span className="spinner"/>正在打开工作空间…</div> : <div className="content">
        {page === 'projects' && !selected && <>
          <div className="page-title"><div><h1>项目</h1><p>{counts.total} 个项目{counts.attention + counts.manual > 0 ? `，${counts.attention + counts.manual} 个待处理` : ''}</p></div><button className="primary" onClick={() => setForm('new')}><Plus size={18}/>新建项目</button></div>
          <div className="dashboard-columns"><section className="panel projects-panel"><div className="panel-heading"><div><h2>最近更新</h2></div><button className="icon-button" disabled={busy} onClick={() => work(async () => { await refresh(); setToast('已刷新项目记录'); })} aria-label="刷新项目记录"><History size={18}/></button></div>
            <div className="list-toolbar"><div className="segmented" aria-label="项目筛选">{[['all','全部'],['attention','待处理'],['PRELIMINARY_PASS','初步通过']].map(([id,name]) => <button key={id} aria-pressed={filter === id} className={filter === id ? 'selected' : ''} onClick={() => setFilter(id)}>{name}</button>)}{!['all','attention','PRELIMINARY_PASS'].includes(filter) && <button className="selected" onClick={() => setFilter('all')}>{labels[filter]} <X size={12}/></button>}</div><label className="search"><Search size={17}/><input aria-label="搜索项目" placeholder="搜索" value={query} onChange={e => setQuery(e.target.value)}/></label></div>
            {filtered.length ? <div className="project-list"><div className="table-head"><span>项目</span><span>状态</span><span>更新时间</span><span/></div>{filtered.map(p => <button className="project-row" key={p.id} onClick={() => work(() => openProject(p.id))}><div className="project-name"><ProjectCover/><div><strong>{p.name}</strong><span>{p.isDemo ? '模拟 · ' : ''}{p.address || '位置待补充'}</span></div></div><Badge status={statusOf(p.latestReview)}/><span className="time-cell">{date(p.updatedAt)}</span><ChevronRight size={15}/></button>)}</div> : <div className="empty"><FolderOpen size={30}/><h3>{projects.length ? '没有匹配的项目' : '从第一个项目开始'}</h3><p>{projects.length ? '试试其他关键词或筛选条件。' : '录入项目位置、产品与尺寸，保存后开始分析。'}</p></div>}
            <div className="panel-footer"><Info size={14}/>初步通过仅指本报告所列条件，不代表政府批准。</div>
          </section></div>
        </>}

        {page === 'projects' && selected && <>
          <button className="back-link" onClick={() => home()}><ArrowLeft size={15}/>返回项目</button>
          <div className="page-title project-heading"><div>{selected.isDemo && <div className="title-meta"><span className="demo-label">模拟项目</span></div>}<h1>{selected.name}</h1><p><MapPin size={15}/>{selected.address || '地址待补充'}</p></div><div className="actions"><button className="secondary" onClick={() => setForm(selected)}><Pencil size={15}/>编辑资料</button><button className="primary" disabled={busy} onClick={run}>{busy ? <span className="spinner"/> : <FileCheck2 size={16}/>}{report ? '重新预审' : '开始预审'}</button></div></div>
          <div className="project-switcher"><div className="detail-tabs segmented">{[['report','预审结果'],['facts','项目资料']].map(([id,name]) => <button key={id} aria-pressed={tab===id} className={tab === id ? 'selected' : ''} onClick={() => setTab(id)}>{name}</button>)}</div><details className="project-more"><summary>{{history:'历史报告',notes:'审核记录',reference:'报告信息'}[tab] || '更多'}<ChevronDown size={14}/></summary><div className="project-more-popover">{(report ? [['history','历史报告'],['notes','审核记录'],['reference','许可与报告信息']] : [['history','历史报告']]).map(([id,name])=><button key={id} onClick={e=>{setTab(id);e.currentTarget.closest('details')?.removeAttribute('open');}}>{name}</button>)}</div></details></div>
          {tab === 'report' && (report ? <>
            {(report.stale || report.knowledgeBlocked) && <div className="notice orange-notice"><TriangleAlert size={18}/>{report.stale ? '项目资料已更新，这份报告基于旧资料。请重新预审。' : '当前规则或资料需要复核。此报告保留原始结果，使用前需要复审。'}</div>}
            <section className={`result-banner result-${tone[statusOf(report)] || 'gray'}`}><div className="result-symbol">{statusOf(report) === 'PRELIMINARY_PASS' ? <CheckCircle2 size={30}/> : statusOf(report) === 'CONFLICT' ? <TriangleAlert size={30}/> : <ClipboardCheck size={30}/>}</div><div><div className="result-kicker">预审结论 · V{report.sequence}</div><h2>{labels[statusOf(report)]}</h2><p>{briefResult(report)}</p></div><span className="result-date">{date(report.createdAt)}<span>资料版本 {report.projectRevision}</span></span></section>
            <ReviewFocus key={report.id} report={report} initial={report.aiExplanation} disabled={report.stale || report.knowledgeBlocked} onSource={showSource} onEdit={()=>setForm(selected)} onNote={id=>{setNoteItem(id);setNote(true);}}/>

          </> : <div className="panel empty"><FileCheck2 size={35}/><h3>项目已准备好，开始首次预审</h3><p>即使资料不完整，也可以先了解需要补充哪些条件。</p><button className="primary" disabled={busy} onClick={run}>发起预审<ArrowRight size={16}/></button></div>)}
          {tab === 'facts' && <section className="panel facts-panel"><div className="panel-heading"><div><h2>当前项目资料</h2><p>修订版本 {selected.revision} · 修改后需要重新预审</p></div><button className="text-button" onClick={() => setForm(selected)}>编辑<Pencil size={14}/></button></div><dl className="facts-grid">{[
            ['产品', product(selected.product)], ['建设方式', selected.construction === 'new' ? '新建' : '改造'], ['州 / 县', `${selected.state} / ${selected.county}`], ['分区', selected.zone || '待核实'], ['ADU面积', selected.aduArea === null ? '未提供' : `${selected.aduArea} ${selected.unit}`], ['主住宅面积', selected.homeArea === null ? '未提供' : `${selected.homeArea} ${selected.unit}`], ['已有ADU', selected.existingAdus === null ? '未知' : `${selected.existingAdus}套`], ['确认人', selected.confirmedBy || '未记录'], ['辖区依据', selected.jurisdictionEvidence || '待补充'], ['计量依据', selected.measurementEvidence || '待补充'], ['地块标准', selected.siteReview || '待专业审核'], ['停车核实', selected.parkingReview || '待专业审核'], ['特殊限制', selected.specialReview || '待专业审核'], ['许可核实', selected.licensingReview || '待专业审核'], ['项目备注', selected.notes || '无'],
          ].map(([k,v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl></section>}
          {tab === 'notes' && report && <>              <section className="panel notes-panel"><div className="panel-heading"><div><h2>人工审核记录</h2><p>原始自动判断始终保留，意见单独记录</p></div><button className="secondary small-button" onClick={() => {setNoteItem('');setNote(true);}}><Plus size={14}/>添加意见</button></div>{report.notes.length ? report.notes.map(n => <div className="note-record" key={n.id}><div className="note-top"><strong>{n.actor}</strong><span>{n.kind} · {date(n.createdAt)}</span></div><p>{n.text}</p><small>依据：{n.evidence}</small>{n.itemId && <small>关联：{report.result.items.find(i => i.id === n.itemId)?.title}</small>}</div>) : <div className="empty compact"><ClipboardCheck size={25}/><p>暂无审核意见。需要专业确认时，在这里留下依据。</p></div>}<div className="panel-footer"><button className="text-button" onClick={() => setChange(true)}>发现通用规则问题？提交知识修订建议<ArrowUpRight size={13}/></button></div></section></>}
          {tab === 'reference' && report && <section className="panel side-panel reference-details"><h2>许可与报告信息</h2><p className="small-text muted">{report.result.coverage}</p><div className="mini-fact"><span>规则版本</span><strong>{report.result.release}</strong></div><div className="mini-fact"><span>审查日期</span><strong>{report.result.assessedAt}</strong></div><details className="focus-evidence"><summary>查看待核实的许可与周期参考<ChevronDown size={14}/></summary>{report.result.permits.map(p=><div className="permit" key={p.title}><div><strong>{p.title}</strong><p>{p.body}</p><button className="text-button" onClick={()=>showSource(p.sourceId)}>查看资料依据</button></div></div>)}<p className="small-text muted">{report.result.timeline}</p></details><p className="footnote">这些资料仅供核实准备，不代表已确认适用许可或审批时长。</p></section>}
          {tab === 'history' && <section className="panel"><div className="panel-heading"><div><h2>历史预审</h2><p>每次预审固定保存当时的项目条件、规则与来源</p></div><History size={20}/></div>{reviews.length ? reviews.map(r => <button className="history-row" key={r.id} onClick={() => work(() => openProject(selected.id, r.id))}><span className="version-icon">V{r.sequence}</span><div><strong>预审报告 V{r.sequence}</strong><span>{date(r.createdAt)} · 项目资料版本 {r.projectRevision}</span></div><Badge status={statusOf(r)}/><ChevronRight size={17}/></button>) : <div className="empty compact"><p>还没有预审记录。</p></div>}</section>}
        </>}

        {page === 'knowledge' && <>
          <div className="page-title"><div><p className="eyebrow">KNOWLEDGE, WITH PROVENANCE</p><h1>法规与规则</h1><p>保留原文和版本，区分现行修订与待确认参考。</p></div><Badge status={knowledge?.blocked ? 'MANUAL_REVIEW' : 'PASS'}/></div>
          <div className="notice"><Info size={19}/><span>资料已由研发核对公开来源，尚未经过企业合规经理或PE签认。真实项目仍需专业核实。</span></div>
          <section className="panel release-panel"><IconBox><Layers3 size={24}/></IconBox><div><p className="eyebrow">当前规则集</p><h2>{knowledge?.release}</h2><p>{knowledge?.coverage}</p>{knowledge?.blocked && <p className="red-text">停用原因：{knowledge.control?.reason}</p>}</div><button className="secondary" onClick={() => setControl(true)}>{knowledge?.blocked ? '核实并重新启用' : '停用有问题的规则集'}</button></section>
          <div className="section-label">官方资料 <span>{knowledge?.sources.length} 份</span></div><div className="sources-grid">{knowledge?.sources.map(s => <button className="panel source-card" key={s.id} onClick={() => setSource(s)}><div className="source-card-top"><IconBox color={s.status === 'active' ? 'blue' : 'orange'}><FileText size={21}/></IconBox><span className={`source-type ${s.status}`}>{s.status === 'active' ? '现行修订' : '参考 / 待确认'}</span></div><h3>{s.title}</h3><p>{s.summary}</p><div className="source-meta"><span>{s.issuer}</span><span>核对 {s.checkedAt}</span></div><div className="source-open">查看原文与使用边界<ArrowUpRight size={15}/></div></button>)}</div>
          <section className="panel change-panel"><div className="panel-heading"><div><h2>知识修订建议</h2><p>个案意见经核实与验证后，才能用于后续项目</p></div></div>{knowledge?.changes.length ? knowledge.changes.map(c => <div className="note-record" key={c.id}><div className="note-top"><strong>{c.actor}</strong><span>{c.status} · {date(c.createdAt)}</span></div><p>{c.proposal}</p></div>) : <div className="empty compact"><ClipboardCheck size={25}/><p>暂无修订建议。可以从预审报告提交问题并关联具体案例。</p></div>}</section>
        </>}
        {page === 'help' && <><div className="page-title"><div><p className="eyebrow">A CLEAR BOUNDARY</p><h1>先知道能做什么</h1><p>帮助业务推进，也明确判断的边界。</p></div></div><div className="help-grid">{[
          ['01','录入项目条件','当前仅支持Montgomery County县级管辖范围内的新建独立式ADU。需要记录实际辖区证据，地址不会自动完成地块核实。'],
          ['02','逐项预审，打开依据','系统检查有限的明确规则，显示条件、依据与下一步。部分旧版资料仅作为参考，不用于现行面积计算。'],
          ['03','补齐事实，交专业人员','缺资料交销售或项目经理；条款适用交合规经理；退界、高度、结构与特殊条件交相应专业人员。人工记录不是政府批准。'],
          ['04','纠错后重新预审','编辑项目生成新资料版本，再预审得到新报告。人工意见保留，原报告不改写；通用规则问题提交知识修订建议。'],
        ].map(([n,title,body]) => <section className="panel help-card" key={n}><span className="help-number">{n}</span><h2>{title}</h2><p>{body}</p></section>)}</div><div className="notice"><Info size={20}/><span>当前为本地原型，数据保存在本机SQLite；已支持DeepSeek辅助解释；没有自动报批、审批跟踪和正式报价放行功能。模拟案例不代表真实地块或专业审核。</span></div></>}
        <footer className="page-footer"><span>Nestopia</span><span>本地原型 · 规则与模板</span></footer>
      </div>}
    </main>
    <nav className="mobile-nav" aria-label="移动端导航"><button className={page==='projects'?'active':''} aria-current={page==='projects'?'page':undefined} onClick={()=>home()}><SystemGlyph kind="projects" size={23}/><span>项目</span></button><button onClick={()=>setUtilities(true)}><MoreHorizontal size={23}/><span>更多</span></button></nav>
    {utilities && <Dialog title="更多" onClose={()=>setUtilities(false)}><div className="utility-links"><button onClick={()=>{home('knowledge');setUtilities(false);}}><BookOpen size={19}/>法规与知识维护</button><button onClick={()=>{home('help');setUtilities(false);}}><Info size={19}/>使用说明</button></div></Dialog>}
    {toast && <div className="toast" role="status"><CheckCircle2 size={18}/>{toast}</div>}
    {form && <ProjectForm project={form === 'new' ? null : form} onClose={() => setForm(null)} onSave={save}/>}
    {source && <Dialog title="法规依据" subtitle="固定版本摘录与使用边界" onClose={() => setSource(null)}><div className="source-dialog"><span className={`source-type ${source.status}`}>{source.status === 'active' ? '现行修订' : '参考资料 · 使用前核实'}</span><h3>{source.title}</h3><p className="muted">{source.issuer}</p><dl><div><dt>条款定位</dt><dd>{source.locator}</dd></div><div><dt>核对日期</dt><dd>{source.checkedAt}（研发资料核对）</dd></div><div><dt>生效日期</dt><dd>{source.effectiveFrom || '未确认；不能据此推定生效'}</dd></div></dl><blockquote lang="en">{source.excerpt}</blockquote><p>{source.summary}</p><div className="notice orange-notice"><Info size={18}/><span>{source.caveat}</span></div>{source.hash && <p className="hash">快照 SHA-256<br/>{source.hash}</p>}<a className="primary" href={source.url} target="_blank" rel="noreferrer">打开官方原文<ArrowUpRight size={16}/></a></div></Dialog>}
    {note && report && <RecordDialog initialItemId={noteItem} title="记录人工审核意见" onClose={() => setNote(false)} onSubmit={async data => { await api(`reviews/${report.id}/notes`, 'POST', { actor: data.actor, text: data.text, evidence: data.evidence, kind: data.kind, itemId: data.itemId || null }); setReport(await api<FullReview>(`reviews/${report.id}`)); setNote(false); setToast('审核意见已记录，原始判断保留'); }} items={report.result.items.map(i => ({id:i.id,title:i.title}))}/>}
    {change && report && <RecordDialog title="提交知识修订建议" onClose={() => setChange(false)} onSubmit={async data => { await api('knowledge-changes', 'POST', { reviewId: report.id, actor: data.actor, proposal: `${data.text}\n依据：${data.evidence}` }); await refresh(); setChange(false); setToast('修订建议已保存，核实后由维护者发布新规则'); }}/ >}
    {control && <RecordDialog title={knowledge?.blocked ? '确认后重新启用规则集' : '停用当前规则集'} onClose={() => setControl(false)} onSubmit={async data => { await api('knowledge-controls', 'POST', { blocked: !knowledge?.blocked, actor: data.actor, reason: `${data.text}；依据：${data.evidence}` }); await refresh(); setControl(false); setToast('规则状态已更新，历史报告保持原样'); }}/ >}
  </div>;
}

function ProjectForm({ project, onClose, onSave }: { project: Project | null; onClose: () => void; onSave: (input: ProjectInput) => Promise<void> }) {
  const [value, setValue] = useState<ProjectInput>(() => project ? Object.fromEntries(Object.keys(blankProject).map(k => [k, project[k as keyof ProjectInput]])) as ProjectInput : { ...blankProject });
  const [error, setError] = useState(''); const [saving, setSaving] = useState(false);
  const update = (key: keyof ProjectInput, val: unknown) => setValue(prev => ({ ...prev, [key]: val }));
  const field = (key: keyof ProjectInput, label: string, placeholder = '', numeric = false) => <label className="field" key={key}><span>{label}</span><input type={numeric ? 'number' : 'text'} min={numeric ? 0 : undefined} step={numeric ? (['existingAdus','adults'].includes(key) ? '1' : 'any') : undefined} required={key === 'name'} maxLength={numeric ? undefined : 500} value={value[key] === null ? '' : String(value[key])} placeholder={placeholder} onChange={e => update(key, numeric ? e.target.value === '' ? null : Number(e.target.value) : e.target.value)}/></label>;
  const tri = (key: keyof ProjectInput, label: string) => <label className="field" key={key}><span>{label}</span><select value={String(value[key])} onChange={e => update(key,e.target.value)}><option value="unknown">未知 / 待核实</option><option value="yes">是</option><option value="no">否</option></select></label>;
  const area = (key: keyof ProjectInput, label: string, placeholder: string) => <label className="field full-field" key={key}><span>{label}</span><textarea rows={2} maxLength={2000} value={String(value[key])} placeholder={placeholder} onChange={e => update(key,e.target.value)}/></label>;
  async function submit(e: FormEvent) { e.preventDefault(); setSaving(true); setError(''); try { await onSave(value); } catch (e) { setError((e as Error).message); } finally { setSaving(false); } }
  return <Dialog title={project ? '编辑项目资料' : '新建项目'} subtitle="先保存已知信息，未知条件可在后续补齐。" wide onClose={() => { if (!saving) onClose(); }}><form onSubmit={submit}>
    <div className="form-body">{value.isDemo && <div className="notice"><Info size={17}/>这是模拟项目，修改后仍保留模拟标记。</div>}<h3 className="form-section"><span>01</span>项目与位置</h3><div className="form-grid">{field('name','项目名称 *','例如：客户后院ADU项目')}<label className="field"><span>产品类型</span><select value={value.product} onChange={e => update('product',e.target.value)}><option value="detached_adu">独立式 ADU</option><option value="pergola">Pergola（当前范围外）</option><option value="sunroom">阳光房（当前范围外）</option></select></label>{field('address','项目地址','未提供时会提示补充')}<label className="field"><span>建设方式</span><select value={value.construction} onChange={e => update('construction',e.target.value)}><option value="new">新建</option><option value="conversion">既有建筑改造（当前范围外）</option></select></label>{field('state','州')}{field('county','县')}{tri('jurisdiction','已确认属于本试点主管辖区？')}{field('confirmedBy','事实 / 人工确认责任人','真实姓名或角色；演示请标注模拟')}{area('jurisdictionEvidence','辖区核实依据','记录地块查询链接、主管机构答复或材料编号，不因地址含县名就确认。')}</div>
    <h3 className="form-section"><span>02</span>产品与基础条件</h3><div className="form-grid">{field('aduArea','拟建ADU面积','',true)}{field('homeArea','主住宅面积','',true)}<label className="field"><span>两侧面积单位</span><select value={value.unit} onChange={e => update('unit',e.target.value)}><option value="sqft">平方英尺 ft²</option><option value="sqm">平方米 m²</option></select></label>{tri('measurementConfirmed','两侧计量口径已获专业确认？')}{area('measurementEvidence','计量口径确认依据','记录DPS或专业人员对size计量方法的确认；不要直接沿用旧footprint口径。')}{field('existingAdus','地块已有ADU数量','未知可留空',true)}{tri('principalDetached','主住宅是否独立式单户住宅？')}{tri('shortTermRental','地块是否存在或许可短租？')}{tri('sameAddress','是否与主住宅使用相同街道地址？')}{field('adults','计划18岁及以上居住人数','未知可留空',true)}{field('zone','已核实分区','例如：R-60；未知可留空')}</div>
    <details className="manual-form"><summary><div><h3>03 · 专业核实记录</h3><p>未填写时，系统会保留“需专业审核”。记录需包含核查结论和依据。</p></div><ChevronDown size={18}/></summary><div className="form-grid">{area('siteReview','分区、退界、高度、覆盖率及总居住标准','写明核查条件、是否满足、材料或官方依据；不要仅填“已看”。')}{area('parkingReview','停车及豁免路径','记录轨道站距离、车位条件、适用豁免或主管机构确认。')}{area('specialReview','特殊地块、环境、供排水及工程条件','记录实际核查的特殊限制和专业处理结论。')}{area('licensingReview','许可适用与近期改革','核实Class 3、建筑及分项许可，并确认Bill 41-26是否生效及影响。')}</div></details><div className="form-grid">{area('notes','项目备注','补充背景、材料位置或待确认事项。')}</div>{error && <p className="inline-error" role="alert">{error}</p>}</div>
    <div className="modal-footer"><span>保存资料不会自动批准项目。</span><button className="secondary" type="button" disabled={saving} onClick={onClose}>取消</button><button className="primary" type="submit" disabled={saving}>{saving ? '正在保存…' : '保存项目'}</button></div></form></Dialog>;
}

function RecordDialog({ title, items, initialItemId='', onClose, onSubmit }: { initialItemId?:string; title: string; items?: { id: string; title: string }[]; onClose: () => void; onSubmit: (data: {actor:string; text:string; evidence:string; kind:string; itemId:string}) => Promise<void> }) {
  const [saving, setSaving] = useState(false); const [error, setError] = useState('');
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); const data = new FormData(e.currentTarget); setSaving(true); setError('');
    try { await onSubmit({ actor: String(data.get('actor')), text: String(data.get('text')), evidence: String(data.get('evidence')), kind: String(data.get('kind') || '判断纠错'), itemId: String(data.get('itemId') || '') }); }
    catch (e) { setError((e as Error).message); } finally { setSaving(false); }
  }
  return <Dialog title={title} subtitle="记录依据和责任人，保留原始判断。" onClose={() => { if (!saving) onClose(); }}><form onSubmit={submit}><div className="form-body"><label className="field"><span>记录人 *</span><input name="actor" required maxLength={100} placeholder="演示身份请明确标注"/></label>{items && <div className="form-grid"><label className="field"><span>关联事项</span><select name="itemId" defaultValue={initialItemId}><option value="">整份报告</option>{items.map(i => <option key={i.id} value={i.id}>{i.title}</option>)}</select></label><label className="field"><span>意见类型</span><select name="kind">{['判断纠错','补充资料','专业意见','确认记录'].map(k => <option key={k}>{k}</option>)}</select></label></div>}<label className="field"><span>意见 / 原因 *</span><textarea name="text" required rows={4} maxLength={4000} placeholder="说明发现的问题、处理结论及下一步。"/></label><label className="field"><span>依据 *</span><textarea name="evidence" required rows={2} maxLength={4000} placeholder="原文定位、材料编号、链接或确认记录。"/></label>{error && <p className="inline-error" role="alert">{error}</p>}</div><div className="modal-footer"><button className="secondary" type="button" disabled={saving} onClick={onClose}>取消</button><button className="primary" disabled={saving} type="submit">{saving ? '正在保存…' : '确认记录'}</button></div></form></Dialog>;
}
