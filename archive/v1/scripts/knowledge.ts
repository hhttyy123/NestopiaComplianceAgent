import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { initializeDb } from '../src/server/db';
import { activeKnowledge, publishKnowledge, validateKnowledge, verifyKnowledgeChange } from '../src/server/knowledge-service';

async function main() {
  const [command,...args] = process.argv.slice(2);
  const allowed: Record<string,string[]> = {
    export:['file'], validate:['file'],
    'verify-change':['id','actor','evidence'],
    publish:['file','expected-release','actor','evidence','change'],
  };
  if (!allowed[command]) throw new Error('用法：npm run knowledge -- export|validate|verify-change|publish [--参数 值]；详见knowledge/README.md');
  const flags: Record<string,string> = {};
  for (let i=0;i<args.length;i+=2) {
    const key=args[i].slice(2), value=args[i+1];
    if (!args[i].startsWith('--') || !allowed[command].includes(key) || flags[key] || !value || value.startsWith('--')) throw new Error(`无效或重复参数：${args[i]}`);
    flags[key]=value;
  }
  const need = (key:string) => { if (!flags[key]?.trim()) throw new Error(`缺少--${key}`); return flags[key]; };
  const load = () => { const file=need('file'); if (statSync(file).size > 5*1024*1024) throw new Error('知识文件超过5MB'); return JSON.parse(readFileSync(file,'utf8').replace(/^\uFEFF/,'')); };
  if (command === 'validate') {
    const {pack,...result} = validateKnowledge(load());
    console.log(JSON.stringify({release:pack.id,...result},null,2));
    if (!result.passed) process.exitCode=1;
    return;
  }
  // DATA_DIR has a process lock: stop the app before maintenance writes.
  if (command === 'export') {
    const file=need('file'); await initializeDb();
    writeFileSync(file,JSON.stringify(activeKnowledge().pack,null,2)+'\n',{ flag:'wx' });
    console.log(`已导出到${file}；保留原文件，修改副本后验证。`);
  } else if (command === 'verify-change') {
    const id=need('id'), actor=need('actor'), evidence=need('evidence'); await initializeDb();
    console.log(JSON.stringify(verifyKnowledgeChange(id,{actor,evidence}),null,2));
  } else {
    const raw=load(), expectedRelease=need('expected-release'), actor=need('actor'), evidence=need('evidence');
    await initializeDb();
    console.log(JSON.stringify(publishKnowledge(raw,{expectedRelease,actor,evidence,changeId:flags.change}),null,2));
  }
}
main().catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode=1; });
