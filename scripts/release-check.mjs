import {readFileSync,existsSync} from 'node:fs';
import path from 'node:path';
import nextEnv from '@next/env';
const {loadEnvConfig}=nextEnv;
loadEnvConfig(process.cwd(),false);
const file=path.resolve(process.argv[2]||'.env.production');
let env={...process.env};if(existsSync(file)){for(const line of readFileSync(file,'utf8').split(/\r?\n/)){const match=line.match(/^([A-Z_]+)=(.*)$/);if(match)env[match[1]]=match[2].replace(/^['"]|['"]$/g,'');}}
const errors=[];let origin;try{origin=new URL(env.APP_ORIGIN);if(origin.protocol!=='https:'||origin.pathname!=='/'||origin.search||origin.hash||origin.username||origin.password)errors.push('APP_ORIGIN必须为HTTPS根地址');}catch{errors.push('缺少有效APP_ORIGIN');}
if(!env.APP_DOMAIN||origin?.host!==env.APP_DOMAIN||/your-domain|example\./.test(env.APP_DOMAIN||''))errors.push('APP_DOMAIN须为实际域名且与APP_ORIGIN一致');
if((env.ACCESS_PASSWORD||'').length<20)errors.push('ACCESS_PASSWORD至少20字符');
if(!(env.DEEPSEEK_API_KEY||'').trim())errors.push('缺少服务端API密钥');
for(const entry of ['Dockerfile','compose.yaml','deploy/Caddyfile'])if(!existsSync(entry))errors.push('缺少部署文件 '+entry);
if(errors.length){for(const error of errors)console.error(error);process.exitCode=1;}else console.log('上线配置检查通过；未输出任何密钥。仍需服务器实际构建、DNS/TLS和备份恢复验收。');
