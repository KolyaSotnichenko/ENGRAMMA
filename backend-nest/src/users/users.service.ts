import { Injectable, Logger } from '@nestjs/common';
import { UsersRepository, UserRow } from './users.repository';
import { MemoryRepository } from '../memory/memory.repository';
import { Sector, MemoryRow } from '../shared/types';

@Injectable()
export class UsersService {
  constructor(
    private users: UsersRepository,
    private memRepo: MemoryRepository,
  ) {}
  private readonly logger = new Logger(UsersService.name);

  async getSummary(user_id: string) {
    const u = await this.users.getUser(user_id);
    if (!u) return null;
    return {
      user_id: u.user_id,
      summary: u.summary,
      reflection_count: u.reflection_count,
      updated_at: u.updated_at,
    };
  }

  async regenerateSummary(user_id: string) {
    const mems = await this.memRepo.listByUser(user_id, 100, 0);
    const summary = this.genSummary(mems);
    const now = Date.now();
    const existing = await this.users.getUser(user_id);
    if (!existing) await this.users.upsertUser(user_id, summary, 0, now, now);
    else await this.users.updateUserSummary(user_id, summary, now);
    const u = (await this.users.getUser(user_id)) as UserRow;
    return {
      ok: true,
      user_id,
      summary: u.summary,
      reflection_count: u.reflection_count,
    };
  }

  async regenerateAll() {
    const ids = await this.users.listUserIds();
    let updated = 0;
    const failed: string[] = [];
    for (const row of ids) {
      if (!row.user_id) continue;
      try {
        await this.regenerateSummary(row.user_id);
        updated++;
      } catch (e: unknown) {
        failed.push(row.user_id);
        const msg = e instanceof Error ? e.message : String(e);
        this.logger.error(
          `regenerateSummary failed for ${row.user_id}: ${msg}`,
        );
      }
    }
    return { ok: true, updated, failed };
  }

  async listUserMemories(user_id: string, limit = 100, offset = 0) {
    const r = await this.memRepo.listByUser(user_id, limit, offset);
    const items = r.map((x: MemoryRow) => ({
      id: x.id,
      content: x.content,
      tags: JSON.parse(x.tags || '[]') as string[],
      metadata: JSON.parse(x.meta || '{}') as Record<string, unknown>,
      created_at: x.created_at,
      updated_at: x.updated_at,
      last_seen_at: x.last_seen_at,
      salience: x.salience,
      decay_lambda: x.decay_lambda,
      primary_sector: x.primary_sector,
      version: x.version,
    }));
    return { user_id, items };
  }

  async deleteUserMemories(user_id: string) {
    const mems = await this.memRepo.listByUser(user_id, 10000, 0);
    let deleted = 0;
    for (const m of mems) {
      await this.memRepo.deleteMemory(m.id);
      await this.memRepo.deleteVectors(m.id);
      await this.memRepo.deleteWaypoints(m.id, m.id);
      deleted++;
    }
    return { ok: true, deleted };
  }

  private genSummary(mems: MemoryRow[]): string {
    if (!mems.length) return 'new user with no memories yet';
    const cls = this.cluster(mems);
    const top = cls.slice(0, 5);
    const patterns = top
      .map((c) => {
        const s = this.sal(c);
        const snippet = c.mem[0].content.substring(0, 40);
        return `${c.sector}(${c.n}, sal=${s.toFixed(2)}): "${snippet}..."`;
      })
      .join(' | ');
    const total_sal =
      mems.reduce((sum, m) => sum + (m.salience || 0), 0) / mems.length;
    const now = Date.now();
    const week_ago = now - 7 * 24 * 60 * 60 * 1000;
    const recent = mems.filter((m) => m.updated_at > week_ago).length;
    const activity = recent > 10 ? 'active' : recent > 3 ? 'moderate' : 'low';
    return `${mems.length} memories, ${cls.length} patterns | ${activity} | avg_sal=${total_sal.toFixed(2)} | top: ${patterns}`;
  }

  private vec(txt: string): number[] {
    const w = txt.toLowerCase().split(/\s+/);
    const uniq = [...new Set(w)];
    return uniq.map((u) => w.filter((x) => x === u).length);
  }

  private cos(a: number[], b: number[]): number {
    let d = 0,
      ma = 0,
      mb = 0;
    for (let i = 0; i < Math.min(a.length, b.length); i++) {
      d += a[i] * b[i];
      ma += a[i] * a[i];
      mb += b[i] * b[i];
    }
    return d / (Math.sqrt(ma) * Math.sqrt(mb) || 1);
  }

  private sim(t1: string, t2: string): number {
    return this.cos(this.vec(t1), this.vec(t2));
  }

  private cluster(mems: MemoryRow[]) {
    const cls: Array<{ mem: MemoryRow[]; n: number; sector: Sector }> = [];
    const used = new Set<string>();
    for (const m of mems) {
      if (used.has(m.id) || m.primary_sector === 'reflective') continue;
      const c = { mem: [m], n: 1, sector: m.primary_sector };
      used.add(m.id);
      for (const o of mems) {
        if (used.has(o.id) || m.primary_sector !== o.primary_sector) continue;
        if (this.sim(m.content, o.content) > 0.75) {
          c.mem.push(o);
          c.n++;
          used.add(o.id);
        }
      }
      cls.push(c);
    }
    return cls.sort((a, b) => b.n - a.n);
  }

  private sal(c: { mem: MemoryRow[]; n: number; sector: Sector }): number {
    const now = Date.now();
    const p = c.n / 10;
    const r =
      c.mem.reduce(
        (s, m) => s + Math.exp(-(now - (m.created_at || now)) / 43200000),
        0,
      ) / c.n;
    const e = c.mem.some((m) => m.primary_sector === 'emotional') ? 1 : 0;
    return Math.min(1, 0.6 * p + 0.3 * r + 0.1 * e);
  }
}
