import { Injectable } from '@nestjs/common';
import { TemporalRepository, TemporalFactRow } from './temporal.repository';
import { randomUUID } from 'crypto';

@Injectable()
export class TemporalService {
  constructor(private repo: TemporalRepository) {}

  async createFact(
    subject: string,
    predicate: string,
    object: string,
    valid_from?: number,
    confidence = 1,
    metadata?: Record<string, unknown>,
  ) {
    const id = randomUUID();
    const vf = valid_from ?? Date.now();
    await this.repo.insertFact(
      id,
      subject,
      predicate,
      object,
      vf,
      confidence,
      metadata,
    );
    return { id, subject, predicate, object, valid_from: vf, confidence };
  }

  async updateFact(
    id: string,
    patch: {
      object?: string;
      valid_to?: number;
      confidence?: number;
      metadata?: Record<string, unknown>;
    },
  ) {
    await this.repo.updateFact(id, {
      object: patch.object,
      valid_to: patch.valid_to ?? null,
      confidence: patch.confidence,
      metadata: patch.metadata,
    });
    return { id, updated: true };
  }

  async invalidateFact(id: string, valid_to?: number) {
    const vt = valid_to ?? Date.now();
    await this.repo.invalidateFact(id, vt);
    return { id, invalidated: true };
  }

  async getFact(id: string) {
    const r = await this.repo.getFact(id);
    if (!r) return null;
    return this.rowToDto(r);
  }

  async getCurrent(subject: string, predicate: string) {
    const r = await this.repo.getCurrentFact(subject, predicate);
    if (!r) return null;
    return this.rowToDto(r);
  }

  async queryAtTime(q: {
    subject?: string;
    predicate?: string;
    object?: string;
    at?: number;
    min_confidence?: number;
  }) {
    const rows = await this.repo.queryAtTime(
      q.subject,
      q.predicate,
      q.object,
      q.at,
      q.min_confidence,
    );
    return rows.map((x) => this.rowToDto(x));
  }

  async queryInRange(q: {
    subject?: string;
    predicate?: string;
    from?: number;
    to?: number;
    min_confidence?: number;
  }) {
    const rows = await this.repo.queryInRange(
      q.subject,
      q.predicate,
      q.from,
      q.to,
      q.min_confidence,
    );
    return rows.map((x) => this.rowToDto(x));
  }

  async getSubjectFacts(
    subject: string,
    include_historical = false,
    at?: number,
  ) {
    const rows = await this.repo.getFactsBySubject(
      subject,
      include_historical,
      at,
    );
    return rows.map((x) => this.rowToDto(x));
  }

  async search(
    pattern: string,
    field: 'subject' | 'predicate' | 'object' = 'subject',
    at?: number,
  ) {
    const rows = await this.repo.searchFacts(pattern, field, at);
    return rows.map((x) => this.rowToDto(x));
  }

  async compare(subject: string, time1: number, time2: number) {
    const t1 = await this.repo.queryAtTime(
      subject,
      undefined,
      undefined,
      time1,
      undefined,
    );
    const t2 = await this.repo.queryAtTime(
      subject,
      undefined,
      undefined,
      time2,
      undefined,
    );
    const map1 = new Map<string, TemporalFactRow>();
    const map2 = new Map<string, TemporalFactRow>();
    for (const f of t1) map1.set(f.predicate, f);
    for (const f of t2) map2.set(f.predicate, f);
    const added: any[] = [],
      removed: any[] = [],
      changed: Array<{ before: any; after: any }> = [],
      unchanged: any[] = [];
    for (const [pred, f2] of map2) {
      const f1 = map1.get(pred);
      if (!f1) added.push(this.rowToDto(f2));
      else if (f1.object !== f2.object || f1.id !== f2.id)
        changed.push({ before: this.rowToDto(f1), after: this.rowToDto(f2) });
      else unchanged.push(this.rowToDto(f2));
    }
    for (const [pred, f1] of map1) {
      if (!map2.has(pred)) removed.push(this.rowToDto(f1));
    }
    return { added, removed, changed, unchanged };
  }

  async stats() {
    const active = await this.repo.getActiveCount();
    const total = await this.repo.getTotalCount();
    return { active, total };
  }

  async decay(window_days = 30) {
    const now = Date.now();
    const from = now - window_days * 86400000;
    const rows = await this.repo.queryInRange(
      undefined,
      undefined,
      undefined,
      from,
      undefined,
    );
    let updated = 0;
    for (const r of rows) {
      const ageDays = Math.max(0, (now - r.valid_from) / 86400000);
      const newConf = Math.max(
        0,
        r.confidence * Math.exp(-ageDays / window_days),
      );
      await this.repo.updateFact(r.id, { confidence: newConf });
      updated++;
    }
    return { ok: true, updated };
  }

  async volatile(subject?: string, limit = 10) {
    const v = await this.repo.getVolatileFacts(subject, limit);
    return { items: v };
  }

  private rowToDto(r: TemporalFactRow) {
    return {
      id: r.id,
      subject: r.subject,
      predicate: r.predicate,
      object: r.object,
      valid_from: r.valid_from,
      valid_to: r.valid_to ?? null,
      confidence: r.confidence,
      last_updated: r.last_updated,
      metadata: r.metadata
        ? (JSON.parse(r.metadata) as Record<string, unknown>)
        : undefined,
    };
  }
}
