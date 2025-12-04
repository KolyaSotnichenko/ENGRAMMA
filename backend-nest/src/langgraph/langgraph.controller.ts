import { Body, Controller, Get, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { LanggraphService } from './langgraph.service';

@Controller()
export class LanggraphController {
  constructor(private readonly svc: LanggraphService) {}

  @Get('/lgm/config')
  cfg(@Res() res: Response) {
    res.json(this.svc.cfg());
  }

  @Post('/lgm/store')
  async store(
    @Body()
    b: {
      node: string;
      content: string;
      namespace?: string;
      graph_id?: string;
      tags?: string[];
      metadata?: Record<string, unknown>;
      reflective?: boolean;
    },
    @Res() res: Response,
  ) {
    try {
      const r = await this.svc.store(b);
      res.json(r);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'internal';
      res.status(400).json({ err: 'lgm_store_failed', message: msg });
    }
  }

  @Post('/lgm/retrieve')
  async retrieve(
    @Body()
    b: {
      node: string;
      namespace?: string;
      graph_id?: string;
      limit?: number;
      include_metadata?: boolean;
      query?: string;
    },
    @Res() res: Response,
  ) {
    try {
      const r = await this.svc.retrieve(b);
      res.json(r);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'internal';
      res.status(400).json({ err: 'lgm_retrieve_failed', message: msg });
    }
  }

  @Post('/lgm/context')
  async context(
    @Body() b: { namespace?: string; graph_id?: string; limit?: number },
    @Res() res: Response,
  ) {
    try {
      const r = await this.svc.context(b);
      res.json(r);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'internal';
      res.status(400).json({ err: 'lgm_context_failed', message: msg });
    }
  }

  @Post('/lgm/reflection')
  async reflection(
    @Body()
    b: {
      node?: string;
      content?: string;
      namespace?: string;
      graph_id?: string;
      context_ids?: string[];
    },
    @Res() res: Response,
  ) {
    try {
      const r = await this.svc.reflection(b);
      res.json(r);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'internal';
      res.status(400).json({ err: 'lgm_reflection_failed', message: msg });
    }
  }
}
