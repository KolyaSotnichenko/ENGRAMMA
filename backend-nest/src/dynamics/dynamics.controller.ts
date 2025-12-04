import { Body, Controller, Get, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { DynamicsService } from './dynamics.service';
import { Sector } from '../shared/types';

@Controller()
export class DynamicsController {
  constructor(private readonly svc: DynamicsService) {}

  @Get('/dynamics/constants')
  constants(@Res() res: Response) {
    res.json({
      success_status_indicator: true,
      dynamics_constants_configuration: this.svc.getConstants(),
    });
  }

  @Post('/dynamics/salience/calculate')
  calcSalience(
    @Body()
    b: {
      initial_salience?: number;
      decay_lambda?: number;
      recall_count?: number;
      emotional_frequency?: number;
      time_elapsed_days?: number;
    },
    @Res() res: Response,
  ) {
    try {
      const r = this.svc.calcSalience(
        b.initial_salience || 0.5,
        b.decay_lambda || 0.01,
        b.recall_count || 0,
        b.emotional_frequency || 0,
        b.time_elapsed_days || 0,
      );
      res.json({
        success_status_indicator: true,
        calculated_salience_value: r,
        input_parameters_used: {
          initial_salience: b.initial_salience || 0.5,
          decay_lambda: b.decay_lambda || 0.01,
          recall_count: b.recall_count || 0,
          emotional_frequency: b.emotional_frequency || 0,
          time_elapsed_days: b.time_elapsed_days || 0,
        },
      });
    } catch {
      res.status(500).json({ err: 'internal' });
    }
  }

  @Post('/dynamics/resonance/calculate')
  resonance(
    @Body()
    b: {
      memory_sector?: Sector;
      query_sector?: Sector;
      base_similarity?: number;
    },
    @Res() res: Response,
  ) {
    try {
      const r = this.svc.calcResonance(
        b.memory_sector ?? ('semantic' as Sector),
        b.query_sector ?? ('semantic' as Sector),
        b.base_similarity ?? 0.8,
      );
      res.json({
        success_status_indicator: true,
        resonance_modulated_score: r,
        input_parameters_used: {
          memory_sector: b.memory_sector || 'semantic',
          query_sector: b.query_sector || 'semantic',
          base_similarity: b.base_similarity || 0.8,
        },
      });
    } catch {
      res.status(500).json({ err: 'internal' });
    }
  }

  @Post('/dynamics/retrieval/energy-based')
  async energy(
    @Body() b: { query?: string; sector?: Sector; min_energy?: number },
    @Res() res: Response,
  ) {
    if (!b.query) return res.status(400).json({ err: 'query_required' });
    try {
      const items = await this.svc.energyRetrieval(
        b.query,
        b.sector ?? ('semantic' as Sector),
        b.min_energy,
      );
      res.json({
        success_status_indicator: true,
        query_text: b.query,
        query_sector: b.sector || 'semantic',
        minimum_energy_threshold: b.min_energy || 0.4,
        retrieved_memories_count: items.length,
        memories_with_activation_energy: items,
      });
    } catch {
      res.status(500).json({ err: 'internal' });
    }
  }

  @Post('/dynamics/reinforcement/trace')
  async reinforce(@Body() b: { memory_id?: string }, @Res() res: Response) {
    if (!b.memory_id)
      return res.status(400).json({ err: 'memory_id_required' });
    try {
      const r = await this.svc.reinforceTrace(b.memory_id);
      if ('err' in r) return res.status(404).json(r);
      res.json({
        success_status_indicator: true,
        reinforced_memory_id: b.memory_id,
      });
    } catch {
      res.status(500).json({ err: 'internal' });
    }
  }

  @Post('/dynamics/activation/spreading')
  async spreading(
    @Body() b: { initial_memory_ids?: string[]; max_iterations?: number },
    @Res() res: Response,
  ) {
    const ids = Array.isArray(b.initial_memory_ids) ? b.initial_memory_ids : [];
    if (!ids.length)
      return res.status(400).json({ err: 'initial_memory_ids_required' });
    try {
      const items = await this.svc.spreadingActivation(
        ids,
        b.max_iterations || 3,
      );
      res.json({
        success_status_indicator: true,
        initial_activated_memories_count: ids.length,
        maximum_iterations_performed: b.max_iterations || 3,
        total_activated_nodes_count: items.length,
        spreading_activation_results: items,
      });
    } catch {
      res.status(500).json({ err: 'internal' });
    }
  }

  @Get('/dynamics/waypoints/graph')
  async graph(
    @Query('user_id') user_id: string | undefined,
    @Query('sector') sector: Sector | undefined,
    @Query('tag') tag: string | undefined,
    @Res() res: Response,
  ) {
    try {
      const r = await this.svc.waypointGraph({ user_id, sector, tag });
      res.json({ success_status_indicator: true, ...r });
    } catch {
      res.status(500).json({ err: 'internal' });
    }
  }

  @Post('/dynamics/waypoints/calculate-weight')
  async weight(
    @Body() b: { source_memory_id?: string; target_memory_id?: string },
    @Res() res: Response,
  ) {
    if (!b.source_memory_id || !b.target_memory_id)
      return res.status(400).json({ err: 'both_memory_ids_required' });
    try {
      const r = await this.svc.calcWaypointWeight(
        b.source_memory_id,
        b.target_memory_id,
      );
      if ('err' in r) return res.status(400).json(r);
      res.json({ success_status_indicator: true, ...r });
    } catch {
      res.status(500).json({ err: 'internal' });
    }
  }

  @Post('/dynamics/decay/apply-dual-phase')
  async decay(@Res() res: Response) {
    try {
      const r = await this.svc.dualPhaseDecayAll();
      res.json(r);
    } catch {
      res.status(500).json({ err: 'internal' });
    }
  }
}
