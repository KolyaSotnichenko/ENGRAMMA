import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { SqliteService } from '../sqlite/sqlite.service';

export type ReminderStatus = 'scheduled' | 'completed' | 'cancelled';

export type ReminderItem = {
  id: string;
  user_id: string | null;
  content: string;
  due_at: number;
  timezone: string | null;
  repeat_every_ms: number | null;
  cooldown_ms: number | null;
  status: ReminderStatus;
  tags: string[];
  metadata: Record<string, unknown>;
  created_at: number;
  updated_at: number;
  last_triggered_at: number | null;
  completed_at: number | null;
  cancelled_at: number | null;
};

type ReminderRow = {
  id: string;
  user_id: string | null;
  content: string;
  due_at: number;
  timezone: string | null;
  repeat_every_ms: number | null;
  cooldown_ms: number | null;
  status: ReminderStatus;
  tags: string | null;
  created_at: number;
  updated_at: number;
  last_triggered_at: number | null;
  completed_at: number | null;
  cancelled_at: number | null;
  meta: string | null;
};

type NotFound = { nf: true };
type Forbidden = { forbidden: true };

@Injectable()
export class RemindersService {
  constructor(private db: SqliteService) {}

  private rowToItem(row: ReminderRow): ReminderItem {
    return {
      id: row.id,
      user_id: row.user_id,
      content: row.content,
      due_at: Number(row.due_at),
      timezone: row.timezone,
      repeat_every_ms:
        row.repeat_every_ms === null ? null : Number(row.repeat_every_ms),
      cooldown_ms: row.cooldown_ms === null ? null : Number(row.cooldown_ms),
      status: row.status,
      tags: JSON.parse(row.tags || '[]') as string[],
      metadata: JSON.parse(row.meta || '{}') as Record<string, unknown>,
      created_at: Number(row.created_at),
      updated_at: Number(row.updated_at),
      last_triggered_at:
        row.last_triggered_at === null ? null : Number(row.last_triggered_at),
      completed_at: row.completed_at === null ? null : Number(row.completed_at),
      cancelled_at: row.cancelled_at === null ? null : Number(row.cancelled_at),
    };
  }

  private checkAccess(row: ReminderRow, user_id?: string): Forbidden | null {
    if (!user_id) return null;
    if (row.user_id && row.user_id !== user_id) return { forbidden: true };
    return null;
  }

  async create(args: {
    user_id?: string;
    content: string;
    due_at: number;
    timezone?: string;
    repeat_every_ms?: number;
    cooldown_ms?: number;
    tags?: string[];
    metadata?: Record<string, unknown>;
  }): Promise<ReminderItem> {
    const now = Date.now();
    const id = randomUUID();
    const tags = JSON.stringify(args.tags || []);
    const meta = JSON.stringify(args.metadata || {});
    await this.db.run(
      `insert into reminders(
        id,user_id,content,due_at,timezone,repeat_every_ms,cooldown_ms,status,tags,created_at,updated_at,last_triggered_at,completed_at,cancelled_at,meta
      ) values(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        id,
        args.user_id ?? null,
        args.content,
        Math.floor(args.due_at),
        args.timezone ?? null,
        args.repeat_every_ms ?? null,
        args.cooldown_ms ?? null,
        'scheduled',
        tags,
        now,
        now,
        null,
        null,
        null,
        meta,
      ],
    );
    const row = await this.db.get<ReminderRow>(
      `select * from reminders where id=?`,
      [id],
    );
    if (!row) throw new Error('reminder_create_failed');
    return this.rowToItem(row);
  }

  async getById(
    id: string,
    user_id?: string,
  ): Promise<ReminderItem | null | Forbidden> {
    const row = await this.db.get<ReminderRow>(
      `select * from reminders where id=?`,
      [id],
    );
    if (!row) return null;
    const a = this.checkAccess(row, user_id);
    if (a) return a;
    return this.rowToItem(row);
  }

  async list(args: {
    user_id?: string;
    status?: ReminderStatus;
    limit?: number;
    offset?: number;
  }): Promise<{ items: ReminderItem[] }> {
    const status = (args.status || 'scheduled') as ReminderStatus;
    const limit = Math.min(Math.max(args.limit ?? 25, 1), 100);
    const offset = Math.max(args.offset ?? 0, 0);

    const where: string[] = ['status=?'];
    const params: unknown[] = [status];
    if (args.user_id) {
      where.push('user_id=?');
      params.push(args.user_id);
    }
    params.push(limit, offset);

    const rows = await this.db.all<ReminderRow>(
      `select * from reminders where ${where.join(' and ')} order by due_at asc limit ? offset ?`,
      params,
    );
    return { items: rows.map((r) => this.rowToItem(r)) };
  }

  async listUserIds(args?: { status?: ReminderStatus }): Promise<{ user_ids: string[] }> {
    const status = (args?.status || 'scheduled') as ReminderStatus;

    const rows = await this.db.all<{ user_id: string }>(
      `select distinct user_id from reminders where status=? and user_id is not null order by user_id asc`,
      [status],
    );

    return { user_ids: rows.map((r) => r.user_id).filter(Boolean) };
  }

  async due(args: {
    user_id?: string;
    now?: number;
    window_ms?: number;
    limit?: number;
    ack?: boolean;
  }): Promise<{ now: number; items: ReminderItem[]; acknowledged: number }> {
    const now = Number.isFinite(args.now) ? Math.floor(args.now as number) : Date.now();
    const win = Math.max(args.window_ms ?? 0, 0);
    const limit = Math.min(Math.max(args.limit ?? 10, 1), 50);
    const ack = args.ack !== false;
    const cutoff = now + win;

    const where: string[] = [
      "status='scheduled'",
      'due_at <= ?',
      '(last_triggered_at is null or (last_triggered_at + ifnull(cooldown_ms,0)) <= ?)',
    ];
    const params: unknown[] = [cutoff, now];
    if (args.user_id) {
      where.push('user_id=?');
      params.push(args.user_id);
    }
    params.push(limit);

    const rows = await this.db.all<ReminderRow>(
      `select * from reminders where ${where.join(' and ')} order by due_at asc limit ?`,
      params,
    );
    const items = rows.map((r) => this.rowToItem(r));

    let acknowledged = 0;
    if (ack && rows.length) {
      const ids = rows.map((r) => r.id);
      const ph = ids.map(() => '?').join(',');
      await this.db.run(
        `update reminders set last_triggered_at=?, updated_at=? where id in (${ph})`,
        [now, now, ...ids],
      );
      acknowledged = ids.length;
    }

    return { now, items, acknowledged };
  }

  async complete(id: string, user_id?: string) {
    const row = await this.db.get<ReminderRow>(
      `select * from reminders where id=?`,
      [id],
    );
    if (!row) return { nf: true } as NotFound;
    const a = this.checkAccess(row, user_id);
    if (a) return a;

    const now = Date.now();
    if (row.repeat_every_ms && row.repeat_every_ms > 0) {
      await this.db.run(
        `update reminders set status='scheduled', due_at=?, completed_at=?, last_triggered_at=?, updated_at=? where id=?`,
        [now + Number(row.repeat_every_ms), now, now, now, id],
      );
    } else {
      await this.db.run(
        `update reminders set status='completed', completed_at=?, updated_at=? where id=?`,
        [now, now, id],
      );
    }

    const next = await this.db.get<ReminderRow>(
      `select * from reminders where id=?`,
      [id],
    );
    return next ? this.rowToItem(next) : { nf: true };
  }

  async cancel(id: string, user_id?: string) {
    const row = await this.db.get<ReminderRow>(
      `select * from reminders where id=?`,
      [id],
    );
    if (!row) return { nf: true } as NotFound;
    const a = this.checkAccess(row, user_id);
    if (a) return a;

    const now = Date.now();
    await this.db.run(
      `update reminders set status='cancelled', cancelled_at=?, updated_at=? where id=?`,
      [now, now, id],
    );
    const next = await this.db.get<ReminderRow>(
      `select * from reminders where id=?`,
      [id],
    );
    return next ? this.rowToItem(next) : { nf: true };
  }

  async snooze(id: string, delta_ms: number, user_id?: string) {
    const row = await this.db.get<ReminderRow>(
      `select * from reminders where id=?`,
      [id],
    );
    if (!row) return { nf: true } as NotFound;
    const a = this.checkAccess(row, user_id);
    if (a) return a;

    const now = Date.now();
    await this.db.run(
      `update reminders set due_at=due_at+?, last_triggered_at=null, updated_at=? where id=?`,
      [Math.floor(delta_ms), now, id],
    );
    const next = await this.db.get<ReminderRow>(
      `select * from reminders where id=?`,
      [id],
    );
    return next ? this.rowToItem(next) : { nf: true };
  }

  async update(
    id: string,
    patch: {
      user_id?: string;
      content?: string;
      due_at?: number;
      timezone?: string;
      repeat_every_ms?: number | null;
      cooldown_ms?: number | null;
      tags?: string[];
      metadata?: Record<string, unknown>;
      status?: ReminderStatus;
    },
  ) {
    const row = await this.db.get<ReminderRow>(
      `select * from reminders where id=?`,
      [id],
    );
    if (!row) return { nf: true } as NotFound;
    const a = this.checkAccess(row, patch.user_id);
    if (a) return a;

    const sets: string[] = [];
    const params: unknown[] = [];

    if (typeof patch.content === 'string') {
      sets.push('content=?');
      params.push(patch.content);
    }
    if (typeof patch.due_at === 'number') {
      sets.push('due_at=?');
      params.push(Math.floor(patch.due_at));
    }
    if (typeof patch.timezone === 'string') {
      sets.push('timezone=?');
      params.push(patch.timezone);
    }
    if (patch.repeat_every_ms !== undefined) {
      sets.push('repeat_every_ms=?');
      params.push(patch.repeat_every_ms === null ? null : patch.repeat_every_ms);
    }
    if (patch.cooldown_ms !== undefined) {
      sets.push('cooldown_ms=?');
      params.push(patch.cooldown_ms === null ? null : patch.cooldown_ms);
    }
    if (patch.tags !== undefined) {
      sets.push('tags=?');
      params.push(JSON.stringify(patch.tags));
    }
    if (patch.metadata !== undefined) {
      sets.push('meta=?');
      params.push(JSON.stringify(patch.metadata));
    }
    if (patch.status) {
      sets.push('status=?');
      params.push(patch.status);

      if (patch.status === 'scheduled') {
        sets.push('completed_at=null');
        sets.push('cancelled_at=null');
      } else if (patch.status === 'completed') {
        sets.push('completed_at=?');
        params.push(Date.now());
      } else if (patch.status === 'cancelled') {
        sets.push('cancelled_at=?');
        params.push(Date.now());
      }
    }

    const now = Date.now();
    sets.push('updated_at=?');
    params.push(now);

    if (sets.length) {
      await this.db.run(
        `update reminders set ${sets.join(', ')} where id=?`,
        [...params, id],
      );
    }

    const next = await this.db.get<ReminderRow>(
      `select * from reminders where id=?`,
      [id],
    );
    return next ? this.rowToItem(next) : { nf: true };
  }

  async deleteById(id: string, user_id?: string) {
    const row = await this.db.get<ReminderRow>(
      `select * from reminders where id=?`,
      [id],
    );
    if (!row) return { nf: true } as NotFound;
    const a = this.checkAccess(row, user_id);
    if (a) return a;

    await this.db.run(`delete from reminders where id=?`, [id]);
    return { ok: true } as const;
  }
}
