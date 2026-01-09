import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as path from 'path';
import * as fs from 'fs';
import * as sqlite3 from 'sqlite3';
import { Logger } from '@nestjs/common';

@Injectable()
export class SqliteService {
  private readonly logger = new Logger(SqliteService.name);
  private db: sqlite3.Database;
  constructor(private cfg: ConfigService) {
    // 1. Обчислюємо шлях до БД
    const envPath = this.cfg.get<string>('ENGRAMMA_DB_PATH');
    const projectRoot = path.resolve(__dirname, '..', '..'); // backend-nest/dist/.. → backend-nest
    const defaultPath = path.join(projectRoot, 'data', 'authfymemory.sqlite');

    const abs = envPath
      ? path.isAbsolute(envPath)
        ? envPath
        : path.resolve(projectRoot, envPath)
      : defaultPath;

    // 2. Гарантуємо, що директорія існує
    const dir = path.dirname(abs);
    try {
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    } catch (err) {
      this.logger.error(`Cannot create DB directory ${dir}:`, err as Error);
      throw err;
    }

    // 3. Відкриваємо БД та створюємо таблиці
    this.db = new sqlite3.Database(abs, (err) => {
      if (err) {
        this.logger.error(`Failed to open SQLite DB at ${abs}`, err);
      } else {
        this.logger.log(`SQLite DB ready at ${abs}`);
      }
    });

    this.db.exec('PRAGMA busy_timeout=5000');
    this.db.exec('PRAGMA journal_mode=WAL');
    this.db.exec('PRAGMA synchronous=NORMAL');
    this.db.exec('PRAGMA temp_store=MEMORY');
    this.db.exec('PRAGMA cache_size=-8000');
    this.db.exec('PRAGMA mmap_size=134217728');
    this.db.exec('PRAGMA wal_autocheckpoint=20000');
    this.db.exec('PRAGMA locking_mode=NORMAL');
    this.db.serialize(() => {
      this.db.run(`create table if not exists memories(
        id text primary key,
        user_id text,
        segment integer default 0,
        content text not null,
        simhash text,
        primary_sector text not null,
        tags text,
        meta text,
        created_at integer,
        updated_at integer,
        last_seen_at integer,
        salience real,
        decay_lambda real,
        version integer default 1,
        mean_dim integer,
        mean_vec blob,
        compressed_vec blob,
        feedback_score real default 0
      )`);
      this.db.run(`create table if not exists vectors(
        id text not null,
        sector text not null,
        user_id text,
        v blob not null,
        dim integer not null,
        primary key(id, sector)
      )`);
      this.db.run(`create table if not exists waypoints(
        src_id text,
        dst_id text not null,
        user_id text,
        weight real not null,
        created_at integer,
        updated_at integer,
        primary key(src_id, dst_id, user_id)
      )`);
      this.db.run(`create table if not exists users(
        user_id text primary key,
        summary text,
        reflection_count integer default 0,
        created_at integer,
        updated_at integer
      )`);
      this.db.run(`create table if not exists auth_users(
        id text primary key,
        login text not null unique,
        password_hash text not null,
        created_at integer not null,
        updated_at integer not null
      )`);
      this.db.run(`create table if not exists auth_sessions(
        id text primary key,
        user_id text not null,
        token_hash text not null unique,
        created_at integer not null,
        expires_at integer not null
      )`);
      this.db.run(
        `create index if not exists idx_auth_users_login on auth_users(login)`,
      );
      this.db.run(
        `create index if not exists idx_auth_sessions_expires on auth_sessions(expires_at)`,
      );
      this.db.run(`create table if not exists temporal_facts(
        id text primary key,
        subject text not null,
        predicate text not null,
        object text not null,
        valid_from integer not null,
        valid_to integer,
        confidence real not null,
        last_updated integer not null,
        metadata text
      )`);
      this.db.run(`create table if not exists temporal_edges(
        id text primary key,
        source_id text not null,
        target_id text not null,
        relation_type text not null,
        valid_from integer not null,
        valid_to integer,
        weight real not null,
        metadata text
      )`);
      this.db.run(
        `create index if not exists idx_memories_sector on memories(primary_sector)`,
      );
      this.db.run(
        `create index if not exists idx_memories_segment on memories(segment)`,
      );
      this.db.run(
        `create index if not exists idx_memories_simhash on memories(simhash)`,
      );
      this.db.run(
        `create index if not exists idx_memories_ts on memories(last_seen_at)`,
      );
      this.db.run(
        `create index if not exists idx_memories_user on memories(user_id)`,
      );
      this.db.run(
        `create index if not exists idx_vectors_user on vectors(user_id)`,
      );
      this.db.run(
        `create index if not exists idx_waypoints_src on waypoints(src_id)`,
      );
      this.db.run(
        `create index if not exists idx_waypoints_dst on waypoints(dst_id)`,
      );
      this.db.run(
        `create index if not exists idx_waypoints_user on waypoints(user_id)`,
      );

      this.db.run(
        `create index if not exists idx_temporal_subject on temporal_facts(subject)`,
      );
      this.db.run(
        `create index if not exists idx_temporal_predicate on temporal_facts(predicate)`,
      );
      this.db.run(
        `create index if not exists idx_temporal_validity on temporal_facts(valid_from,valid_to)`,
      );
      this.db.run(
        `create index if not exists idx_temporal_composite on temporal_facts(subject,predicate,valid_from,valid_to)`,
      );
      this.db.run(
        `create index if not exists idx_edges_source on temporal_edges(source_id)`,
      );
      this.db.run(
        `create index if not exists idx_edges_target on temporal_edges(target_id)`,
      );
      this.db.run(
        `create index if not exists idx_edges_validity on temporal_edges(valid_from,valid_to)`,
      );
      this.db.run(`create table if not exists stats(
        id integer primary key autoincrement,
        type text not null,
        count integer default 1,
        ts integer not null
      )`);
      this.db.run(`create index if not exists idx_stats_ts on stats(ts)`);
      this.db.run(`create index if not exists idx_stats_type on stats(type)`);
      this.db.run(`create table if not exists coactivations(
        src_id text not null,
        dst_id text not null,
        user_id text,
        count integer not null default 0,
        updated_at integer,
        primary key(src_id, dst_id, user_id)
      )`);
      this.db.run(
        `create index if not exists idx_coact_updated on coactivations(updated_at)`,
      );
      this.db.run(`create table if not exists bm25_tokens(
        token text primary key,
        df integer not null default 0
      )`);
      this.db.run(`create table if not exists bm25_docs(
        id text primary key,
        len integer not null default 0
      )`);
      this.db.run(`create table if not exists bm25_meta(
        N integer not null default 0,
        avgLen real not null default 1,
        t integer not null default 0
      )`);
      this.db.run(`create table if not exists session_events(
        user_id text,
        mem_id text not null,
        type text,
        ts integer not null
      )`);
      this.db.run(
        `create index if not exists idx_session_ts on session_events(ts)`,
      );
      this.db.run(
        `create index if not exists idx_session_user_ts on session_events(user_id, ts)`,
      );
      this.db.run(`create table if not exists embed_logs(
        id text primary key,
        model text,
        status text,
        ts integer,
        err text,
        op text,
        provider text,
        duration_ms integer,
        input_len integer,
        output_dim integer,
        status_code integer,
        memory_id text
      )`);
      this.db.run(
        `create index if not exists idx_embed_logs_ts on embed_logs(ts)`,
      );
      this.db.all(
        `PRAGMA table_info(embed_logs)`,
        [],
        (err: Error | null, rows: Array<{ name: string }>) => {
          if (err) return;
          const names = new Set(rows.map((r) => String(r.name)));
          const add = (name: string, stmt: string) => {
            if (!names.has(name)) this.db.run(stmt);
          };
          add('op', `alter table embed_logs add column op text`);
          add('provider', `alter table embed_logs add column provider text`);
          add(
            'duration_ms',
            `alter table embed_logs add column duration_ms integer`,
          );
          add(
            'input_len',
            `alter table embed_logs add column input_len integer`,
          );
          add(
            'output_dim',
            `alter table embed_logs add column output_dim integer`,
          );
          add(
            'status_code',
            `alter table embed_logs add column status_code integer`,
          );
          add('memory_id', `alter table embed_logs add column memory_id text`);
        },
      );
      this.migrateWaypointsPK();
    });
  }
  run(sql: string, params: unknown[] = []) {
    return new Promise<void>((resolve, reject) => {
      this.db.run(sql, params as any[], (err) =>
        err ? reject(err) : resolve(),
      );
    });
  }
  get<T = unknown>(sql: string, params: unknown[] = []) {
    return new Promise<T | null>((resolve, reject) => {
      this.db.get(sql, params as any[], (err, row) =>
        err ? reject(err) : resolve((row as T) || null),
      );
    });
  }
  all<T = unknown>(sql: string, params: unknown[] = []) {
    return new Promise<T[]>((resolve, reject) => {
      this.db.all(sql, params as any[], (err, rows) =>
        err ? reject(err) : resolve((rows as T[]) || []),
      );
    });
  }
  private migrateWaypointsPK() {
    this.db.get(
      "select sql as s from sqlite_master where type='table' and name='waypoints'",
      [],
      (err: any, row: any) => {
        if (err) return;
        const s = String((row as { s?: string })?.s || '');
        if (
          s.includes('primary key(src_id, user_id)') &&
          !s.includes('primary key(src_id, dst_id, user_id)')
        ) {
          const sql = `
BEGIN;
CREATE TABLE IF NOT EXISTS waypoints_new(
  src_id text,
  dst_id text not null,
  user_id text,
  weight real not null,
  created_at integer,
  updated_at integer,
  primary key(src_id, dst_id, user_id)
);
INSERT OR IGNORE INTO waypoints_new(src_id,dst_id,user_id,weight,created_at,updated_at)
SELECT src_id,dst_id,user_id,weight,created_at,updated_at FROM waypoints;
DROP TABLE waypoints;
ALTER TABLE waypoints_new RENAME TO waypoints;
CREATE INDEX IF NOT EXISTS idx_waypoints_src ON waypoints(src_id);
CREATE INDEX IF NOT EXISTS idx_waypoints_dst ON waypoints(dst_id);
CREATE INDEX IF NOT EXISTS idx_waypoints_user ON waypoints(user_id);
COMMIT;`;
          this.db.exec(sql);
        }
      },
    );
  }
}
