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
import { TemporalService } from './temporal.service';
import {
  CreateTemporalFactDto,
  CurrentFactDto,
  DecayDto,
  QueryTemporalDto,
  SearchDto,
  SubjectFactsDto,
  TimelineDto,
  UpdateTemporalFactDto,
  CompareDto,
  VolatileDto,
} from './dto/temporal.dto';

@Controller()
export class TemporalController {
  constructor(private readonly svc: TemporalService) {}

  @Post('/api/temporal/fact')
  async create(@Body() b: CreateTemporalFactDto, @Res() res: Response) {
    if (!b.subject || !b.predicate || !b.object)
      return res.status(400).json({ err: 'missing' });
    try {
      const r = await this.svc.createFact(
        b.subject,
        b.predicate,
        b.object,
        b.valid_from,
        b.confidence,
        b.metadata,
      );
      res.json(r);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'internal';
      res.status(500).json({ err: msg });
    }
  }

  @Get('/api/temporal/fact')
  async get(@Query() q: QueryTemporalDto, @Res() res: Response) {
    try {
      const r = await this.svc.queryAtTime({
        subject: q.subject,
        predicate: q.predicate,
        object: q.object,
        at: q.at,
        min_confidence: q.min_confidence,
      });
      res.json({ items: r });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'internal';
      res.status(500).json({ err: msg });
    }
  }

  @Get('/api/temporal/fact/current')
  async current(@Query() q: CurrentFactDto, @Res() res: Response) {
    if (!q.subject || !q.predicate)
      return res.status(400).json({ err: 'missing' });
    try {
      const r = await this.svc.getCurrent(q.subject, q.predicate);
      if (!r) return res.status(404).json({ err: 'nf' });
      res.json(r);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'internal';
      res.status(500).json({ err: msg });
    }
  }

  @Patch('/api/temporal/fact/:id')
  async patch(
    @Param('id') id: string,
    @Body() b: UpdateTemporalFactDto,
    @Res() res: Response,
  ) {
    if (!id) return res.status(400).json({ err: 'id' });
    try {
      const r = await this.svc.updateFact(id, b);
      res.json(r);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'internal';
      res.status(500).json({ err: msg });
    }
  }

  @Delete('/api/temporal/fact/:id')
  async invalidate(
    @Param('id') id: string,
    @Query('valid_to') valid_to: string | undefined,
    @Res() res: Response,
  ) {
    if (!id) return res.status(400).json({ err: 'id' });
    try {
      const vt = valid_to ? parseInt(valid_to) : undefined;
      const r = await this.svc.invalidateFact(id, vt);
      res.json(r);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'internal';
      res.status(500).json({ err: msg });
    }
  }

  @Get('/api/temporal/timeline')
  async timeline(@Query() q: TimelineDto, @Res() res: Response) {
    try {
      const items = await this.svc.queryInRange({
        subject: q.subject,
        predicate: q.predicate,
      });
      res.json({ items });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'internal';
      res.status(500).json({ err: msg });
    }
  }

  @Get('/api/temporal/subject/:subject')
  async subjectFacts(
    @Param('subject') subject: string,
    @Query() q: SubjectFactsDto,
    @Res() res: Response,
  ) {
    try {
      const items = await this.svc.getSubjectFacts(
        subject,
        !!q.include_historical,
      );
      res.json({ items });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'internal';
      res.status(500).json({ err: msg });
    }
  }

  @Get('/api/temporal/search')
  async search(@Query() q: SearchDto, @Res() res: Response) {
    try {
      const items = await this.svc.search(
        q.pattern,
        q.field || 'subject',
        q.at,
      );
      res.json({ items });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'internal';
      res.status(500).json({ err: msg });
    }
  }

  @Get('/api/temporal/compare')
  async compare(@Query() q: CompareDto, @Res() res: Response) {
    if (!q.subject || !q.time1 || !q.time2)
      return res.status(400).json({ err: 'missing' });
    try {
      const r = await this.svc.compare(q.subject, q.time1, q.time2);
      res.json(r);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'internal';
      res.status(500).json({ err: msg });
    }
  }

  @Get('/api/temporal/stats')
  async stats(@Res() res: Response) {
    try {
      const r = await this.svc.stats();
      res.json(r);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'internal';
      res.status(500).json({ err: msg });
    }
  }

  @Post('/api/temporal/decay')
  async decay(@Body() b: DecayDto, @Res() res: Response) {
    try {
      const r = await this.svc.decay(b.window_days || 30);
      res.json(r);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'internal';
      res.status(500).json({ err: msg });
    }
  }

  @Get('/api/temporal/volatile')
  async volatile(@Query() q: VolatileDto, @Res() res: Response) {
    try {
      const r = await this.svc.volatile(q.subject, q.limit || 10);
      res.json(r);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'internal';
      res.status(500).json({ err: msg });
    }
  }
}
