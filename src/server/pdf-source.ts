import {execFile} from 'node:child_process';
import {existsSync,mkdirSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {ResearchError} from './provider';

export function stripLegislativeGutter(text:string){
 const lines=text.split(/\r?\n/),matches=lines.map(line=>line.match(/^ {0,8}(\d{1,4})(?: {3,}|$)/));
 const labels=matches.filter(Boolean).map(m=>Number(m![1]));
 const sequential=labels.slice(1).filter((n,i)=>n===labels[i]+1).length;
 if(labels.length<20||sequential/(labels.length-1)<0.8)return text;
 return lines.map((line,i)=>matches[i]?line.slice(matches[i]![0].length):line).join('\n');
}

export async function readOfficialPdf(url:string,allowed:(url:string)=>boolean){
 let current=url,response:Response|undefined;
 for(let hop=0;hop<4;hop++){
  if(!allowed(current))throw new ResearchError('SOURCE_NOT_ALLOWED','PDF跳转地址未通过官方来源校验');
  try{response=await fetch(current,{redirect:'manual',signal:AbortSignal.timeout(25000),headers:{Accept:'application/pdf'}});}catch{throw new ResearchError('PDF_NETWORK','官方PDF请求超时或网络异常');}
  if([301,302,303,307,308].includes(response.status)){const location=response.headers.get('location');await response.body?.cancel();if(!location)break;current=new URL(location,current).href;continue;}
  break;
 }
 if(!response?.ok||!response.body)throw new ResearchError('PDF_HTTP','官方PDF未能下载');
 const cap=15*1024*1024;if(Number(response.headers.get('content-length')||0)>cap){await response.body.cancel();throw new ResearchError('RESPONSE_SIZE','PDF超过15MB处理限制');}
 const reader=response.body.getReader(),chunks:Uint8Array[]=[];let size=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>cap){await reader.cancel();throw new ResearchError('RESPONSE_SIZE','PDF超过15MB处理限制');}chunks.push(value);}}finally{reader.releaseLock();}
 const bytes=Buffer.concat(chunks);if(bytes.subarray(0,5).toString()!=='%PDF-')throw new ResearchError('PDF_FORMAT','来源不是可读取的PDF');
 const executable=process.env.PDFTOTEXT_BIN||'pdftotext';
 const binaryHash=createHash('sha256').update(bytes).digest('hex'),dir=path.resolve(process.env.DATA_DIR||'data','sources');mkdirSync(dir,{recursive:true});const filename=path.join(dir,binaryHash+'.pdf');if(!existsSync(filename))writeFileSync(filename,bytes,{flag:'wx',mode:0o600});
 // Poppler is installed by the runtime image; it must not be bundled or traced.
 const content=await new Promise<string>((resolve,reject)=>{execFile(/*turbopackIgnore: true*/ executable,['-layout','-enc','UTF-8',filename,'-'],{encoding:'utf8',windowsHide:true,timeout:15000,maxBuffer:4*1024*1024},(error,stdout)=>error?reject(new ResearchError('PDF_EXTRACT','PDF文本提取失败，请检查Poppler安装及文件内容')):resolve(stdout));});
 if(content.trim().length<100)throw new ResearchError('PDF_EMPTY','PDF没有足够文字，扫描件尚不支持OCR');
 const rawLayoutContent=content.replace(/\f/g,'\n\n');
 return {title:decodeURIComponent(new URL(current).pathname.split('/').pop()||'官方PDF'),content:stripLegislativeGutter(rawLayoutContent),rawLayoutContent,extraction:'Official PDF / Poppler; sequential legislative gutter removed when detected',binaryHash,originalFile:'sources/'+binaryHash+'.pdf',resolvedUrl:current};
}
