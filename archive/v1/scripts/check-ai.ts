import { loadEnvConfig } from '@next/env';
import { fixtures } from '../src/domain/fixtures';
import { evaluate } from '../src/domain/engine';
import { assessmentToday } from '../src/domain/knowledge-pack';
import { generateExplanation } from '../src/server/deepseek';
import type { Review } from '../src/domain/schema';

loadEnvConfig(process.cwd());
async function main() {
  const review:Review={id:'synthetic-ai-check',projectId:'synthetic',sequence:1,projectRevision:1,createdAt:new Date().toISOString(),input:fixtures[1],result:evaluate(fixtures[1],assessmentToday()),executionStatus:'COMPLETED'};
  let httpStatus:number|undefined, networkCode:string|undefined;
  const checkedFetch:typeof fetch=async (url,options) => {
    try { const response=await fetch(url,options); httpStatus=response.status; return response; }
    catch(error) { networkCode=(error as {cause?:{code?:string}}).cause?.code || 'NETWORK_ERROR'; throw error; }
  };
  const result=await generateExplanation(review,checkedFetch);
  console.log(JSON.stringify({status:result.status,model:result.model,httpStatus,networkCode,itemCount:result.items.length,message:result.message},null,2));
  if(result.status!=='GENERATED') process.exitCode=1;
}
main().catch(()=>{ console.error('AI检查未完成');process.exitCode=1; });
