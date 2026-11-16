import { trace } from './trace';
import { safetySuffix } from './prompts';
export class ResearchError extends Error { constructor(public code:string,message:string,public details?:unknown){super(message);} }
export async function provider(path:string,body:unknown) {
  const key=process.env.DEEPSEEK_API_KEY?.trim();
  if(!key)throw new ResearchError('AI_NOT_CONFIGURED','服务端未配置DeepSeek密钥');
  let response:Response|undefined;
  for(let attempt=1;attempt<=3;attempt++){
    trace('PROVIDER_REQUEST',`请求 ${path}`,{path,body,attempt});
    try{response=await fetch(`https://api.deepseek.com${path}`,{method:'POST',redirect:'error',signal:AbortSignal.timeout(path==='/chat/completions'?120000:25000),headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify(body)});}catch{trace('PROVIDER_ERROR','外部请求失败',{path,code:'PROVIDER_NETWORK',attempt});if(attempt===3)throw new ResearchError('PROVIDER_NETWORK','外部查询超时或网络异常，请重试');trace('PROVIDER_RETRY','重试临时网络错误',{path,attempt});await new Promise(r=>setTimeout(r,500*attempt));continue;}
    if(response.ok)break;
    const status=response.status,retryable=[408,429,500,502,503,504].includes(status);trace('PROVIDER_ERROR','外部请求被拒绝',{path,status,attempt});await response.body?.cancel();
    if(retryable&&attempt<3){const seconds=Number(response.headers.get('retry-after'));const delay=Number.isFinite(seconds)&&seconds>0?Math.min(seconds*1000,5000):500*attempt;trace('PROVIDER_RETRY','重试临时服务错误',{path,status,attempt,delay});await new Promise(r=>setTimeout(r,delay));continue;}
    throw new ResearchError(`PROVIDER_${status}`,status===402?'DeepSeek账户余额不足':status===401?'DeepSeek鉴权失败，请检查服务端配置':`外部服务返回HTTP ${status}`);
  }
  if(!response?.ok)throw new ResearchError('PROVIDER_NETWORK','外部查询未完成');
  const raw=await response.text();if(raw.length>4000000)throw new ResearchError('RESPONSE_SIZE','外部资料超过处理限制');
  try{const data=JSON.parse(raw);trace('PROVIDER_RESPONSE',`返回 ${path}`,path==='/chat/completions'?{model:data.model,usage:data.usage,choices:data.choices?.map((c:{finish_reason:string;message?:{content?:string}})=>({finish_reason:c.finish_reason,content:c.message?.content}))}:path.endsWith('/fetch')?{title:data.title,contentLength:data.content?.length,storage:'原文保存在 research_source_versions.payload.rawContent'}:data);return data;}catch{throw new ResearchError('INVALID_RESPONSE','外部服务返回无效数据');}
}
export async function modelJson(system:string,input:unknown) {
  const body=await provider('/chat/completions',{model:process.env.DEEPSEEK_MODEL?.trim() || 'deepseek-flash',thinking:{type:'disabled'},stream:false,max_tokens:14000,response_format:{type:'json_object'},messages:[{role:'system',content:system+safetySuffix},{role:'user',content:JSON.stringify(input)}]});
  const choice=body.choices?.[0];if(choice?.finish_reason!=='stop'||typeof choice.message?.content!=='string')throw new ResearchError('MODEL_INCOMPLETE','AI回复未完整结束');
  return parseModelJson(choice.message.content);
}
export function parseModelJson(content:string){try{return JSON.parse(content);}catch{const stack:string[]=[];let quoted=false,escaped=false;for(const char of content){if(quoted){if(escaped)escaped=false;else if(char==='\\')escaped=true;else if(char==='"')quoted=false;continue;}if(char==='"')quoted=true;else if(char==='{')stack.push('}');else if(char==='[')stack.push(']');else if(char==='}'||char===']'){if(stack.pop()!==char)throw new ResearchError('MODEL_JSON','AI未返回有效结构',{content});}}if(!quoted&&stack.length&&stack.length<20){const suffix=stack.reverse().join('');try{const value=JSON.parse(content+suffix);trace('JSON_SYNTAX_REPAIR','补齐JSON末尾闭合符',{suffix,notice:'仅补齐闭合符，未增改字段或事实；仍须通过完整结构和引用校验'});return value;}catch{}}throw new ResearchError('MODEL_JSON','AI未返回有效结构',{content,instruction:'只修复JSON语法，保持事实与引用，不得截断，输出完整严格JSON。'});}}
