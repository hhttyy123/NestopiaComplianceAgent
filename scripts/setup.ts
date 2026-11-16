import { initializeDb } from '../src/server/db';
initializeDb().then(() => console.log('数据库初始化完成，不导入项目数据')).catch(error => { console.error(error.message); process.exitCode = 1; });
