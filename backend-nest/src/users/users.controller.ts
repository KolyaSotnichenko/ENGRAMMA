import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { UsersService } from './users.service';

@Controller()
export class UsersController {
  constructor(private readonly svc: UsersService) {}

  @Get('/users/:user_id/summary')
  async getSummary(@Param('user_id') user_id: string, @Res() res: Response) {
    if (!user_id) return res.status(400).json({ error: 'user_id required' });
    try {
      const r = await this.svc.getSummary(user_id);
      if (!r) return res.status(404).json({ error: 'user not found' });
      res.json(r);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'internal';
      res.status(500).json({ error: msg });
    }
  }

  @Post('/users/:user_id/summary/regenerate')
  async regenerate(@Param('user_id') user_id: string, @Res() res: Response) {
    if (!user_id) return res.status(400).json({ err: 'user_id required' });
    try {
      const r = await this.svc.regenerateSummary(user_id);
      res.json(r);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'internal';
      res.status(500).json({ err: msg });
    }
  }

  @Post('/users/summaries/regenerate-all')
  async regenerateAll(@Res() res: Response) {
    try {
      const r = await this.svc.regenerateAll();
      res.json(r);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'internal';
      res.status(500).json({ err: msg });
    }
  }

  @Get('/users/:user_id/memories')
  async listMemories(
    @Param('user_id') user_id: string,
    @Query('l') l: string | undefined,
    @Query('u') u: string | undefined,
    @Res() res: Response,
  ) {
    if (!user_id) return res.status(400).json({ err: 'user_id required' });
    try {
      const limit = l ? parseInt(l) : 100;
      const offset = u ? parseInt(u) : 0;
      const r = await this.svc.listUserMemories(user_id, limit, offset);
      res.json(r);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'internal';
      res.status(500).json({ err: msg });
    }
  }

  @Delete('/users/:user_id/memories')
  async deleteMemories(
    @Param('user_id') user_id: string,
    @Res() res: Response,
  ) {
    if (!user_id) return res.status(400).json({ err: 'user_id required' });
    try {
      const r = await this.svc.deleteUserMemories(user_id);
      res.json(r);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'internal';
      res.status(500).json({ err: msg });
    }
  }
}
