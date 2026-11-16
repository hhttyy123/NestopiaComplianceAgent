import {it,expect,vi,afterEach} from 'vitest';
import {normalizeStage} from '../src/server/structured-output';
import {provider} from '../src/server/provider';
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();});
it('重放错层timeline及废弃answers，不改变任何评价事实',()=>{const timeline={cases:[],assumptions:['assumption'],stages:[]};const raw={summary:'summary',evaluation:{checks:[{key:'AREA',status:'NEEDS_INPUT'}],permits:[],answers:[{basis:'ESTIMATE',answer:'预计'}]},timeline,answers:[{answer:'deprecated'}]};expect(normalizeStage(raw,'assessment')).toEqual({checks:raw.evaluation.checks,permits:[]});expect(normalizeStage(raw,'timeline')).toEqual(timeline);expect(normalizeStage(raw,'evidence')).toEqual({summary:'summary'});});
it('不同层级给出相互冲突的流程时拒绝猜选',()=>{expect(()=>normalizeStage({timeline:{stages:[1]},evaluation:{timeline:{stages:[2]}}},'timeline')).toThrow('冲突');});
it('临时503自动重试，401不重复请求',async()=>{vi.stubEnv('DEEPSEEK_API_KEY','isolated-transport-key');const fetcher=vi.fn().mockResolvedValueOnce(new Response('{}',{status:503})).mockResolvedValueOnce(new Response('{"ok":true}'));vi.stubGlobal('fetch',fetcher);expect(await provider('/chat/completions',{})).toEqual({ok:true});expect(fetcher).toHaveBeenCalledTimes(2);fetcher.mockReset().mockResolvedValue(new Response('{}',{status:401}));await expect(provider('/chat/completions',{})).rejects.toMatchObject({code:'PROVIDER_401'});expect(fetcher).toHaveBeenCalledTimes(1);});

it('官方PDF下载拒绝非官方跳转、超大响应及假PDF',async()=>{
 const {readOfficialPdf}=await import('../src/server/pdf-source');const {officialUrl}=await import('../src/server/evidence');let calls=0;
 vi.stubGlobal('fetch',vi.fn(async()=>{calls++;return new Response(null,{status:302,headers:{location:'http://127.0.0.1/private'}});}));await expect(readOfficialPdf('https://agency.gov/file.pdf',officialUrl)).rejects.toMatchObject({code:'SOURCE_NOT_ALLOWED'});expect(calls).toBe(1);
 vi.stubGlobal('fetch',vi.fn(async()=>new Response('oversized',{headers:{'content-length':String(16*1024*1024)}})));await expect(readOfficialPdf('https://agency.gov/file.pdf',officialUrl)).rejects.toMatchObject({code:'RESPONSE_SIZE'});
 vi.stubGlobal('fetch',vi.fn(async()=>new Response('<html>not a PDF</html>')));await expect(readOfficialPdf('https://agency.gov/file.pdf',officialUrl)).rejects.toMatchObject({code:'PDF_FORMAT'});
});

it('案件选段必须包含最终命令，不能被检索关键词挤掉',async()=>{
 const {selectParagraphs}=await import('../src/server/evidence');const paragraphs=Array.from({length:40},(_,i)=>({id:'p'+i,text:i===20?'For these reasons, ORDERED that the application must deny the rental license.':'Case correspondence '+i+' permit zoning regulations application days.'}));const selected=selectParagraphs({id:'case',hash:'case',url:'https://agency.gov/order.pdf',title:'Decision',fetchedAt:'',checkedAt:'',reused:false,sourceKind:'CASE',paragraphs},['permit zoning regulations application days']);expect(selected.some(p=>p.id==='p20')).toBe(true);expect(selected.length).toBeLessThanOrEqual(14);
});

it('立法PDF顺序行号与正文分开，不能误删零散数值',async()=>{
 const {stripLegislativeGutter}=await import('../src/server/pdf-source');const numbered=Array.from({length:25},(_,i)=>String(i+1)+'    Legal text '+i).join('\n');expect(stripLegislativeGutter(numbered)).toBe(Array.from({length:25},(_,i)=>'Legal text '+i).join('\n'));const actual='75    percent maximum\n1200    square feet maximum';expect(stripLegislativeGutter(actual)).toBe(actual);
});
