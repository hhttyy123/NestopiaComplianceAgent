import {loadEnvConfig} from '@next/env';
import {mkdirSync,readFileSync,writeFileSync,existsSync,cpSync} from 'node:fs';
import path from 'node:path';
loadEnvConfig(process.cwd());
const source=path.resolve(process.env.DATA_DIR||'data');
const destination=path.join(source,'backups',`nestopia-${new Date().toISOString().replace(/[:.]/g,'-')}`);
try{
 const snapshot=readFileSync(path.join(source,'nestopia.sqlite'));if(snapshot.subarray(0,16).toString()!=='SQLite format 3\0')throw Error('源文件不是SQLite快照');
 mkdirSync(destination,{recursive:true,mode:0o700});
 writeFileSync(path.join(destination,'nestopia.sqlite'),snapshot,{flag:'wx',mode:0o600});
 if(existsSync(path.join(source,'sources')))cpSync(path.join(source,'sources'),path.join(destination,'sources'),{recursive:true,errorOnExist:true,force:false});
 writeFileSync(path.join(destination,'manifest.json'),JSON.stringify({createdAt:new Date().toISOString(),database:'nestopia.sqlite',sources:'sources',consistency:'SQLite原子导出快照；原始PDF为只增不改的哈希文件。'},null,2),{mode:0o600});
 console.log(`数据库与原始PDF备份完成：${destination}`);
}catch(e){console.error(e instanceof Error?e.message:'备份失败');process.exitCode=1;}
