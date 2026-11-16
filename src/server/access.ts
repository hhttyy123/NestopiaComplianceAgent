import {createHash,timingSafeEqual} from 'node:crypto';
import type {NextRequest} from 'next/server';
const local=new Set(['localhost','127.0.0.1']);
const hash=(s:string)=>createHash('sha256').update(s).digest();
export function accessPolicy(req:NextRequest):{status:number;message:string;authenticate?:boolean}|null{
 const configured=process.env.APP_ORIGIN?.trim();
 let origin:URL;try{origin=new URL(configured||`${req.nextUrl.protocol}//${req.headers.get('host')||''}`);}catch{return {status:503,message:'服务地址配置无效'};}
 if(configured&&(!['http:','https:'].includes(origin.protocol)||origin.pathname!=='/'||origin.search||origin.hash||origin.username||origin.password))return {status:503,message:'服务地址配置无效'};
 const host=req.headers.get('host');if(host!==origin.host)return {status:403,message:'请求地址不受支持'};
 const remote=!local.has(origin.hostname);
 if(remote&&(!configured||origin.protocol!=='https:'))return {status:503,message:'公开部署需要配置HTTPS服务地址'};
 const password=process.env.ACCESS_PASSWORD||'',user=process.env.ACCESS_USER||'nestopia';
 if(remote&&password.length<20)return {status:503,message:'服务尚未完成访问凭据配置'};
 if(password){const header=req.headers.get('authorization')||'';let supplied='';try{if(header.startsWith('Basic '))supplied=Buffer.from(header.slice(6),'base64').toString('utf8');}catch{}
 if(!timingSafeEqual(hash(supplied),hash(user+':'+password)))return {status:401,message:'请登录工作空间',authenticate:true};}
 if(!['GET','HEAD','OPTIONS'].includes(req.method)){const value=req.headers.get('origin');if(value&&value!==origin.origin)return {status:403,message:'不允许跨站写入'};if(req.headers.get('sec-fetch-site')==='cross-site')return {status:403,message:'不允许跨站写入'};}
 return null;
}
