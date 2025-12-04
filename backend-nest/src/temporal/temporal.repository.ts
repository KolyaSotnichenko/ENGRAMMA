import { Injectable } from '@nestjs/common';
import { SqliteService } from '../sqlite/sqlite.service';

export interface TemporalFactRow {
  id: string;
  subject: string;
  predicate: string;
  object: string;
  valid_from: number;
  valid_to: number | null;
  confidence: number;
  last_updated: number;
  metadata: string | null;
}

export interface TemporalEdgeRow {
  id: string;
  source_id: string;
  target_id: string;
  relation_type: string;
  valid_from: number;
  valid_to: number | null;
  weight: number;
  metadata: string | null;
}

@Injectable()
export class TemporalRepository {
  constructor(private db: SqliteService) {}

  insertFact(
    id: string,
    subject: string,
    predicate: string,
    object: string,
    valid_from: number,
    confidence: number,
    metadata?: Record<string, unknown>,
  ) {
    const now = Date.now();
    return this.db.run(
      `insert into temporal_facts(id,subject,predicate,object,valid_from,valid_to,confidence,last_updated,metadata) values(?,?,?,?,?,NULL,?,?,?)`,
      [
        id,
        subject,
        predicate,
        object,
        valid_from,
        confidence,
        now,
        metadata ? JSON.stringify(metadata) : null,
      ],
    );
  }

  updateFact(
    id: string,
    patch: Partial<{
      object: string;
      valid_to: number | null;
      confidence: number;
      metadata: Record<string, unknown>;
    }>,
  ) {
    const sets: string[] = [];
    const params: any[] = [];
    if (patch.object !== undefined) {
      sets.push('object=?');
      params.push(patch.object);
    }
    if (patch.valid_to !== undefined) {
      sets.push('valid_to=?');
      params.push(patch.valid_to);
    }
    if (patch.confidence !== undefined) {
      sets.push('confidence=?');
      params.push(patch.confidence);
    }
    if (patch.metadata !== undefined) {
      sets.push('metadata=?');
      params.push(JSON.stringify(patch.metadata));
    }
    sets.push('last_updated=?');
    params.push(Date.now());
    params.push(id);
    const sql = `update temporal_facts set ${sets.join(',')} where id=?`;
    return this.db.run(sql, params);
  }

  invalidateFact(id: string, valid_to: number) {
    return this.db.run(
      `update temporal_facts set valid_to=?, last_updated=? where id=?`,
      [valid_to, Date.now(), id],
    );
  }

  getFact(id: string): Promise<TemporalFactRow | null> {
    return this.db.get<TemporalFactRow>(
      `select * from temporal_facts where id=?`,
      [id],
    );
  }

  getCurrentFact(
    subject: string,
    predicate: string,
  ): Promise<TemporalFactRow | null> {
    return this.db.get<TemporalFactRow>(
      `select * from temporal_facts where subject=? and predicate=? and valid_to is null order by valid_from desc limit 1`,
      [subject, predicate],
    );
  }

  queryAtTime(
    subject?: string,
    predicate?: string,
    object?: string,
    at?: number,
    min_confidence?: number,
  ): Promise<TemporalFactRow[]> {
    const ts = at ?? Date.now();
    const cond: string[] = [
      '(valid_from <= ? and (valid_to is null or valid_to >= ?))',
    ];
    const params: any[] = [ts, ts];
    if (subject) {
      cond.push('subject=?');
      params.push(subject);
    }
    if (predicate) {
      cond.push('predicate=?');
      params.push(predicate);
    }
    if (object) {
      cond.push('object=?');
      params.push(object);
    }
    if (min_confidence && min_confidence > 0) {
      cond.push('confidence>=?');
      params.push(min_confidence);
    }
    const sql = `select * from temporal_facts where ${cond.join(' and ')} order by confidence desc, valid_from desc`;
    return this.db.all<TemporalFactRow>(sql, params);
  }

  queryInRange(
    subject?: string,
    predicate?: string,
    from?: number,
    to?: number,
    min_confidence?: number,
  ): Promise<TemporalFactRow[]> {
    const cond: string[] = [];
    const params: any[] = [];
    if (from && to) {
      cond.push(
        '((valid_from <= ? and (valid_to is null or valid_to >= ?)) or (valid_from >= ? and valid_from <= ?))',
      );
      params.push(to, from, from, to);
    } else if (from) {
      cond.push('valid_from >= ?');
      params.push(from);
    } else if (to) {
      cond.push('valid_from <= ?');
      params.push(to);
    }
    if (subject) {
      cond.push('subject=?');
      params.push(subject);
    }
    if (predicate) {
      cond.push('predicate=?');
      params.push(predicate);
    }
    if (min_confidence && min_confidence > 0) {
      cond.push('confidence>=?');
      params.push(min_confidence);
    }
    const where = cond.length ? `where ${cond.join(' and ')}` : '';
    const sql = `select * from temporal_facts ${where} order by valid_from desc`;
    return this.db.all<TemporalFactRow>(sql, params);
  }

  getFactsBySubject(
    subject: string,
    include_historical: boolean,
    at?: number,
  ): Promise<TemporalFactRow[]> {
    if (include_historical) {
      return this.db.all<TemporalFactRow>(
        `select * from temporal_facts where subject=? order by predicate asc, valid_from desc`,
        [subject],
      );
    } else {
      const ts = at ?? Date.now();
      return this.db.all<TemporalFactRow>(
        `select * from temporal_facts where subject=? and (valid_from <= ? and (valid_to is null or valid_to >= ?)) order by predicate asc, confidence desc`,
        [subject, ts, ts],
      );
    }
  }

  searchFacts(
    pattern: string,
    field: 'subject' | 'predicate' | 'object',
    at?: number,
  ): Promise<TemporalFactRow[]> {
    const ts = at ?? Date.now();
    const like = `%${pattern}%`;
    const sql = `select * from temporal_facts where ${field} like ? and (valid_from <= ? and (valid_to is null or valid_to >= ?)) order by confidence desc, valid_from desc limit 100`;
    return this.db.all<TemporalFactRow>(sql, [like, ts, ts]);
  }

  getVolatileFacts(
    subject?: string,
    limit = 10,
  ): Promise<
    Array<{
      subject: string;
      predicate: string;
      change_count: number;
      avg_confidence: number;
    }>
  > {
    const where = subject ? 'where subject=?' : '';
    const params = subject ? [subject, limit] : [limit];
    const sql = `select subject, predicate, count(*) as change_count, avg(confidence) as avg_confidence from temporal_facts ${where} group by subject, predicate having change_count > 1 order by change_count desc, avg_confidence asc limit ?`;
    return this.db.all(sql, params);
  }

  getActiveCount(): Promise<number> {
    return this.db
      .get<{
        count: number;
      }>(
        `select count(*) as count from temporal_facts where valid_to is null`,
        [],
      )
      .then((r) => r?.count || 0);
  }

  getTotalCount(): Promise<number> {
    return this.db
      .get<{
        count: number;
      }>(`select count(*) as count from temporal_facts`, [])
      .then((r) => r?.count || 0);
  }
}
