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
import { MemoryService } from './memory.service';
import {
  AddMemoryDto,
  IngestDto,
  IngestUrlDto,
  PatchMemoryDto,
  QueryMemoryDto,
} from './dto/memory.dto';
import type { Sector } from '../shared/types';

@Controller()
export class MemoryController {
  constructor(private readonly svc: MemoryService) {}

  @Post('/memory/add')
  async add(@Body() b: AddMemoryDto, @Res() res: Response) {
    if (!b?.content) return res.status(400).json({ err: 'content' });
    try {
      const r = await this.svc.add(b.content, b.tags, b.metadata, b.user_id);
      res.json(r);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'internal';
      res.status(500).json({ err: msg });
    }
  }

  @Post('/memory/ingest')
  async ingest(@Body() b: IngestDto, @Res() res: Response) {
    if (!b?.content_type || !b?.data)
      return res.status(400).json({ err: 'missing' });
    try {
      const r = await this.svc.ingest(b);
      res.json(r);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'internal';
      res.status(500).json({ err: 'ingest_fail', msg });
    }
  }

  @Post('/memory/ingest/url')
  async ingestUrl(@Body() b: IngestUrlDto, @Res() res: Response) {
    if (!b?.url) return res.status(400).json({ err: 'no_url' });
    try {
      const r = await this.svc.ingestUrl(b);
      res.json(r);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'internal';
      res.status(500).json({ err: 'url_fail', msg });
    }
  }

  @Post('/memory/query')
  async query(@Body() b: QueryMemoryDto, @Res() res: Response) {
    const k = b.k || 8;
    try {
      const allowed = [
        'episodic',
        'semantic',
        'procedural',
        'emotional',
        'reflective',
      ] as const;
      const sector: Sector | undefined =
        b.filters?.sector &&
        (allowed as readonly string[]).includes(b.filters.sector)
          ? (b.filters.sector as Sector)
          : undefined;
      const rawUG = b.filters?.use_graph;
      const rawGD = b.filters?.graph_depth;
      const filters = b.filters
        ? {
            sector,
            min_score: b.filters.min_score,
            user_id: b.filters.user_id,
            use_graph:
              typeof rawUG === 'string'
                ? rawUG === 'true' || rawUG === '1'
                : !!rawUG,
            graph_depth:
              typeof rawGD === 'string'
                ? parseInt(rawGD as string, 10)
                : typeof rawGD === 'number'
                  ? rawGD
                  : undefined,
          }
        : undefined;
      const matches = await this.svc.query(b.query, k, filters);
      res.json({ query: b.query, matches });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'internal';
      res.status(500).json({ err: msg });
    }
  }

  @Post('/memory/reinforce')
  async reinforce(
    @Body() b: { id: string; boost?: number },
    @Res() res: Response,
  ) {
    if (!b?.id) return res.status(400).json({ err: 'id' });
    try {
      const r = await this.svc.reinforce(b.id, b.boost);
      res.json(r);
    } catch {
      res.status(404).json({ err: 'nf' });
    }
  }

  @Patch('/memory/:id')
  async patch(
    @Param('id') id: string,
    @Body() b: PatchMemoryDto,
    @Res() res: Response,
  ) {
    if (!id) return res.status(400).json({ err: 'id' });
    try {
      const r = await this.svc.patch(id, b);
      if ('nf' in r) return res.status(404).json({ err: 'nf' });
      if ('forbidden' in r) return res.status(403).json({ err: 'forbidden' });
      res.json(r);
    } catch (e: unknown) {
      if (e instanceof Error && e.message.includes('not found'))
        res.status(404).json({ err: 'nf' });
      else res.status(500).json({ err: 'internal' });
    }
  }

  @Get('/memory/all')
  async listAll(
    @Query('u') u: string | undefined,
    @Query('l') l: string | undefined,
    @Query('sector') sector: Sector | undefined,
    @Query('user_id') user_id: string | undefined,
    @Res() res: Response,
  ) {
    try {
      const offset = u ? parseInt(u) : 0;
      const limit = l ? parseInt(l) : 100;
      const items = await this.svc.listAll(limit, offset, sector, user_id);
      res.json({ items });
    } catch {
      res.status(500).json({ err: 'internal' });
    }
  }

  @Get('/memory/:id')
  async getById(
    @Param('id') id: string,
    @Query('user_id') user_id: string | undefined,
    @Res() res: Response,
  ) {
    try {
      const r = await this.svc.getById(id, user_id);
      if (!r) return res.status(404).json({ err: 'nf' });
      if (r && typeof r === 'object' && 'forbidden' in r)
        return res.status(403).json({ err: 'forbidden' });
      res.json(r);
    } catch {
      res.status(500).json({ err: 'internal' });
    }
  }

  @Delete('/memory/:id')
  async deleteById(
    @Param('id') id: string,
    @Query('user_id') q_user_id: string,
    @Body('user_id') b_user_id: string,
    @Res() res: Response,
  ) {
    try {
      const user_id = q_user_id || b_user_id;
      const r = await this.svc.deleteById(id, user_id);
      if ('nf' in r) return res.status(404).json({ err: 'nf' });
      if ('forbidden' in r) return res.status(403).json({ err: 'forbidden' });
      res.json(r);
    } catch {
      res.status(500).json({ err: 'internal' });
    }
  }
}
