import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { RemindersService, ReminderStatus } from './reminders.service';

@Controller('reminders')
export class RemindersController {
  constructor(private readonly remindersService: RemindersService) {}

  @Get()
  async list(
    @Query('status') status: ReminderStatus | undefined,
    @Query('limit') limit: string | undefined,
    @Query('offset') offset: string | undefined,
    @Query('user_id') user_id: string | undefined,
    @Res() res: Response,
  ) {
    try {
      const st = status || 'scheduled';
      if (!['scheduled', 'completed', 'cancelled'].includes(String(st)))
        return res.status(400).json({ err: 'status' });
      const l = limit ? parseInt(limit, 10) : 25;
      const o = offset ? parseInt(offset, 10) : 0;
      const r = await this.remindersService.list({
        user_id,
        status: st as ReminderStatus,
        limit: l,
        offset: o,
      });
      res.json(r);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'internal';
      res.status(500).json({ err: msg });
    }
  }

  @Get('/users')
  async listUsers(
    @Query('status') status: ReminderStatus | undefined,
    @Res() res: Response,
  ) {
    try {
      const st = status || 'scheduled';
      if (!['scheduled', 'completed', 'cancelled'].includes(String(st)))
        return res.status(400).json({ err: 'status' });
      const r = await this.remindersService.listUserIds({
        status: st as ReminderStatus,
      });
      res.json(r);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'internal';
      res.status(500).json({ err: msg });
    }
  }

  @Get('/:id')
  async getById(
    @Param('id') id: string,
    @Query('user_id') user_id: string | undefined,
    @Res() res: Response,
  ) {
    try {
      const r = await this.remindersService.getById(id, user_id);
      if (!r) return res.status(404).json({ err: 'nf' });
      if (r && typeof r === 'object' && 'forbidden' in r)
        return res.status(403).json({ err: 'forbidden' });
      res.json(r);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'internal';
      res.status(500).json({ err: msg });
    }
  }

  @Post()
  async create(
    @Body()
    b: {
      user_id?: string;
      content?: string;
      due_at?: number | string;
      timezone?: string;
      repeat_every_ms?: number;
      cooldown_ms?: number;
      tags?: string[];
      metadata?: Record<string, unknown>;
    },
    @Res() res: Response,
  ) {
    try {
      if (!b?.content) return res.status(400).json({ err: 'content' });
      if (b?.due_at === undefined) return res.status(400).json({ err: 'due_at' });
      const due =
        typeof b.due_at === 'number'
          ? Math.floor(b.due_at)
          : Date.parse(String(b.due_at));
      if (!Number.isFinite(due)) return res.status(400).json({ err: 'due_at' });

      const r = await this.remindersService.create({
        user_id: b.user_id,
        content: b.content,
        due_at: due,
        timezone: b.timezone,
        repeat_every_ms: b.repeat_every_ms,
        cooldown_ms: b.cooldown_ms,
        tags: b.tags || [],
        metadata: b.metadata || {},
      });
      res.json(r);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'internal';
      res.status(500).json({ err: msg });
    }
  }

  @Patch('/:id')
  async update(
    @Param('id') id: string,
    @Body()
    b: {
      user_id?: string;
      content?: string;
      due_at?: number | string;
      timezone?: string;
      repeat_every_ms?: number | null;
      cooldown_ms?: number | null;
      tags?: string[];
      metadata?: Record<string, unknown>;
      status?: ReminderStatus;
    },
    @Res() res: Response,
  ) {
    try {
      const due =
        b?.due_at === undefined
          ? undefined
          : typeof b.due_at === 'number'
            ? Math.floor(b.due_at)
            : Date.parse(String(b.due_at));
      if (b?.due_at !== undefined && !Number.isFinite(due))
        return res.status(400).json({ err: 'due_at' });

      const r = await this.remindersService.update(id, {
        user_id: b.user_id,
        content: b.content,
        due_at: due as number | undefined,
        timezone: b.timezone,
        repeat_every_ms: b.repeat_every_ms,
        cooldown_ms: b.cooldown_ms,
        tags: b.tags,
        metadata: b.metadata,
        status: b.status,
      });
      if ('nf' in r) return res.status(404).json({ err: 'nf' });
      if ('forbidden' in r) return res.status(403).json({ err: 'forbidden' });
      res.json(r);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'internal';
      res.status(500).json({ err: msg });
    }
  }

  @Post('/:id/complete')
  async complete(
    @Param('id') id: string,
    @Query('user_id') q_user_id: string,
    @Body('user_id') b_user_id: string,
    @Res() res: Response,
  ) {
    try {
      const user_id = q_user_id || b_user_id;
      const r = await this.remindersService.complete(id, user_id);
      if ('nf' in r) return res.status(404).json({ err: 'nf' });
      if ('forbidden' in r) return res.status(403).json({ err: 'forbidden' });
      res.json(r);
    } catch {
      res.status(500).json({ err: 'internal' });
    }
  }

  @Post('/:id/cancel')
  async cancel(
    @Param('id') id: string,
    @Query('user_id') q_user_id: string,
    @Body('user_id') b_user_id: string,
    @Res() res: Response,
  ) {
    try {
      const user_id = q_user_id || b_user_id;
      const r = await this.remindersService.cancel(id, user_id);
      if ('nf' in r) return res.status(404).json({ err: 'nf' });
      if ('forbidden' in r) return res.status(403).json({ err: 'forbidden' });
      res.json(r);
    } catch {
      res.status(500).json({ err: 'internal' });
    }
  }

  @Post('/:id/snooze')
  async snooze(
    @Param('id') id: string,
    @Body() b: { delta_ms?: number; user_id?: string },
    @Res() res: Response,
  ) {
    try {
      if (!b?.delta_ms) return res.status(400).json({ err: 'delta_ms' });
      const r = await this.remindersService.snooze(
        id,
        b.delta_ms,
        b.user_id,
      );
      if ('nf' in r) return res.status(404).json({ err: 'nf' });
      if ('forbidden' in r) return res.status(403).json({ err: 'forbidden' });
      res.json(r);
    } catch {
      res.status(500).json({ err: 'internal' });
    }
  }

  @Delete('/:id')
  async deleteById(
    @Param('id') id: string,
    @Query('user_id') q_user_id: string,
    @Body('user_id') b_user_id: string,
    @Res() res: Response,
  ) {
    try {
      const user_id = q_user_id || b_user_id;
      const r = await this.remindersService.deleteById(id, user_id);
      if ('nf' in r) return res.status(404).json({ err: 'nf' });
      if ('forbidden' in r) return res.status(403).json({ err: 'forbidden' });
      res.json(r);
    } catch {
      res.status(500).json({ err: 'internal' });
    }
  }
}
