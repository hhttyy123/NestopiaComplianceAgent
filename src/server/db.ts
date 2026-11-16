import { randomUUID } from 'node:crypto';
import { lockIsAlive,processIdentity } from './process-lock';
import initSqlJs, { type Database, type SqlJsStatic, type SqlValue } from 'sql.js';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync, openSync, closeSync, unlinkSync } from 'node:fs';
import path from 'node:path';

// All writes are serialized in one process. A standard SQLite file is exported
// after each transaction and atomically replaces the previous on-disk snapshot.
class LocalDatabase {
  private depth = 0;
  constructor(private db: Database, private sql: SqlJsStatic, private filename: string) {}
  private persist() {
    const temp = `${this.filename}.${process.pid}.tmp`;
    writeFileSync(temp, this.db.export());
    renameSync(temp, this.filename);
    this.db.run('PRAGMA foreign_keys = ON');
  }
  exec(sql: string) {
    if (this.depth) this.db.run(sql);
    else this.transaction(() => this.db.run(sql))();
  }
  prepare(sql: string) {
    const all = (...params: SqlValue[]) => {
      const stmt = this.db.prepare(sql);
      try { stmt.bind(params); const rows: Record<string, SqlValue>[] = []; while (stmt.step()) rows.push(stmt.getAsObject()); return rows; }
      finally { stmt.free(); }
    };
    return {
      all,
      get: (...params: SqlValue[]) => all(...params)[0],
      run: (...params: SqlValue[]) => {
        const fn = () => { this.db.run(sql, params); return { changes: this.db.getRowsModified() }; };
        return this.depth ? fn() : this.transaction(fn)();
      },
    };
  }
  transaction<T>(fn: () => T): () => T {
    return () => {
      if (this.depth) return fn();
      const before = this.db.export();
      this.db.run('PRAGMA foreign_keys = ON');
      this.depth = 1;
      try {
        this.db.run('BEGIN IMMEDIATE');
        const result = fn();
        this.db.run('COMMIT');
        this.persist();
        return result;
      } catch (error) {
        this.db.close(); this.db = new this.sql.Database(before);
        this.db.run('PRAGMA foreign_keys = ON');
        throw error;
      } finally { this.depth = 0; }
    };
  }
  async backup(destination: string) { writeFileSync(destination, this.db.export()); this.db.run('PRAGMA foreign_keys = ON'); }
}

const globalDb = globalThis as unknown as { nestopiaDb?: LocalDatabase; nestopiaInit?: Promise<void> };
export async function initializeDb() {
  if (globalDb.nestopiaDb) return;
  if (globalDb.nestopiaInit) return globalDb.nestopiaInit;
  globalDb.nestopiaInit = (async () => {
    const dataDir = path.resolve(/* turbopackIgnore: true */ process.env.DATA_DIR || path.join(process.cwd(), 'data'));
    mkdirSync(dataDir, { recursive: true });
    const filename = path.join(dataDir, 'nestopia.sqlite');
    const lock = path.join(dataDir, 'server.lock');
    if (existsSync(lock)) {
      if(lockIsAlive(readFileSync(lock,'utf8'))) throw new Error('数据目录正在使用；请停止另一实例或使用独立DATA_DIR');
      unlinkSync(lock);
    }
    const owner={pid:process.pid,identity:processIdentity(process.pid)||'',token:randomUUID()};
    const lockContent=JSON.stringify(owner);
    const fd=openSync(lock,'wx');writeFileSync(fd,lockContent);closeSync(fd);
    process.once('exit',()=>{try{if(readFileSync(lock,'utf8')===lockContent)unlinkSync(lock);}catch{}});
    const sql = await initSqlJs({ locateFile: file => path.join(process.cwd(), 'node_modules/sql.js/dist', file) });
    const raw = new sql.Database(existsSync(filename) ? readFileSync(filename) : undefined);
    const db = new LocalDatabase(raw, sql, filename);
    db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at TEXT NOT NULL)');
    db.transaction(() => {
      for (const version of ['001','002','003','004','005','006']) if (!db.prepare('SELECT 1 FROM schema_migrations WHERE version = ?').get(version)) {
        db.exec(readFileSync(path.join(process.cwd(), 'migrations', ({ '001':'001_initial.sql','002':'002_knowledge_releases.sql','003':'003_ai_explanations.sql','004':'004_research.sql','005':'005_trace.sql','006':'006_source_failures.sql' } as Record<string,string>)[version]), 'utf8'));
        db.prepare('INSERT INTO schema_migrations VALUES (?,?)').run(version, new Date().toISOString());
      }
    })();
    globalDb.nestopiaDb = db;
  })().catch(error => { globalDb.nestopiaInit = undefined; throw error; });
  return globalDb.nestopiaInit;
}
export function getDb() {
  if (!globalDb.nestopiaDb) throw new Error('数据库尚未初始化');
  return globalDb.nestopiaDb;
}
