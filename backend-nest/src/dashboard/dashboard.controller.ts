import { Controller, Get, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { SqliteService } from '../sqlite/sqlite.service';
import { MemoryService } from '../memory/memory.service';

@Controller()
export class DashboardController {
  constructor(
    private db: SqliteService,
    private mem: MemoryService,
  ) {}

  @Get('/dashboard/health')
  async health(@Res() res: Response) {
    try {
      const memcnt = await this.db.get<{ cnt: number }>(
        'select count(*) as cnt from memories',
        [],
      );
      const vecs = await this.db.get<{ cnt: number }>(
        'select count(*) as cnt from vectors',
        [],
      );
      const waycnt = await this.db.get<{ cnt: number }>(
        'select count(*) as cnt from waypoints',
        [],
      );
      const mu = process.memoryUsage();
      const toMB = (n: number) => Math.round(n / (1024 * 1024));
      const uptime = Math.floor(process.uptime());
      res.json({
        ok: true,
        process: {
          version: process.version,
          platform: process.platform,
          pid: process.pid,
        },
        memory: {
          heapUsed: toMB(mu.heapUsed),
          heapTotal: toMB(mu.heapTotal),
          rss: toMB(mu.rss),
          external: toMB((mu as { external?: number }).external || 0),
        },
        uptime: {
          seconds: uptime,
          days: Math.floor(uptime / 86400),
          hours: Math.floor((uptime % 86400) / 3600),
        },
        db: {
          memories: memcnt?.cnt || 0,
          vectors: vecs?.cnt || 0,
          waypoints: waycnt?.cnt || 0,
        },
      });
    } catch {
      res.status(500).json({ err: 'internal' });
    }
  }

  @Get('/dashboard/stats')
  async stats(@Res() res: Response) {
    try {
      const now = Date.now();
      const uptime = Math.floor(process.uptime());
      const totalMemories =
        (
          await this.db.get<{ cnt: number }>(
            'select count(*) as cnt from memories',
            [],
          )
        )?.cnt || 0;
      const vectorCount =
        (
          await this.db.get<{ cnt: number }>(
            'select count(*) as cnt from vectors',
            [],
          )
        )?.cnt || 0;
      const waypointCount =
        (
          await this.db.get<{ cnt: number }>(
            'select count(*) as cnt from waypoints',
            [],
          )
        )?.cnt || 0;
      const avgSalRow = await this.db.get<{ avg: number }>(
        'select avg(salience) as avg from memories',
        [],
      );
      const avgSalience = Number(avgSalRow?.avg || 0);
      const recentMemories =
        (
          await this.db.get<{ cnt: number }>(
            'select count(*) as cnt from memories where created_at > ?',
            [now - 24 * 3600 * 1000],
          )
        )?.cnt || 0;
      const sectcnt = await this.db.all<{
        primary_sector: string;
        count: number;
      }>(
        'select primary_sector, count(*) as count from memories group by primary_sector',
        [],
      );
      const requestsTotal =
        (
          await this.db.get<{ cnt: number }>(
            "select sum(count) as cnt from stats where type='request'",
            [],
          )
        )?.cnt || 0;
      const errorsTotal =
        (
          await this.db.get<{ cnt: number }>(
            "select sum(count) as cnt from stats where type='error'",
            [],
          )
        )?.cnt || 0;
      const cacheHits =
        (
          await this.db.get<{ cnt: number }>(
            "select sum(count) as cnt from stats where type='cache_hit'",
            [],
          )
        )?.cnt || 0;
      const lastHour = now - 3600 * 1000;
      const reqLastHour =
        (
          await this.db.get<{ cnt: number }>(
            "select sum(count) as cnt from stats where type='request' and ts > ?",
            [lastHour],
          )
        )?.cnt || 0;
      const avgQps = reqLastHour / 3600;
      const peakRow = await this.db.get<{ cnt: number }>(
        `select max(cnt) as cnt from (
           select sum(count) as cnt
           from stats
           where type='request' and ts > ?
           group by strftime('%Y-%m-%d %H', datetime(ts/1000, 'unixepoch'))
         )`,
        [now - 24 * 3600 * 1000],
      );
      const peakQps = peakRow?.cnt || 0 / 3600;
      const cacheHitRate =
        requestsTotal > 0 ? Math.round((cacheHits / requestsTotal) * 100) : 0;
      const latRows = await this.db.all<{ type: string; cnt: number }>(
        "select type, sum(count) as cnt from stats where ts > ? and type like 'lat_%' group by type",
        [now - 24 * 3600 * 1000],
      );
      const bDefs = [
        { type: 'lat_0_10', ub: 10 },
        { type: 'lat_10_50', ub: 50 },
        { type: 'lat_50_100', ub: 100 },
        { type: 'lat_100_250', ub: 250 },
        { type: 'lat_250_500', ub: 500 },
        { type: 'lat_500_1000', ub: 1000 },
        { type: 'lat_1000_2000', ub: 2000 },
        { type: 'lat_2000_plus', ub: Infinity },
      ];
      const cMap = new Map(latRows.map((r) => [r.type, r.cnt || 0]));
      const totalLat = Array.from(cMap.values()).reduce((a, b) => a + b, 0);
      const findPct = (p: number) => {
        if (!totalLat) return 0;
        let cum = 0;
        for (const d of bDefs) {
          cum += cMap.get(d.type) || 0;
          if (cum / totalLat >= p) return d.ub === Infinity ? 2000 : d.ub;
        }
        return 0;
      };
      const p50 = findPct(0.5);
      const p95 = findPct(0.95);
      const p99 = findPct(0.99);
      const sectorCounts = sectcnt.reduce(
        (acc: Record<string, number>, row) => {
          acc[row.primary_sector] = row.count;
          return acc;
        },
        {} as Record<string, number>,
      );
      const avgDimRow = await this.db.get<{ avg: number }>(
        'select avg(dim) as avg from vectors',
        [],
      );
      const baseDim = parseInt(
        String(process.env.ENGRAMMA_VEC_DIM || '256'),
        10,
      );
      const compressionRatio =
        baseDim > 0 ? (avgDimRow?.avg || baseDim) / baseDim : 1;
      const compressedCountRow = await this.db.get<{ cnt: number }>(
        'select count(*) as cnt from memories where compressed_vec is not null',
        [],
      );
      const compressionCoverage =
        totalMemories > 0 ? (compressedCountRow?.cnt || 0) / totalMemories : 0;
      const hotCut = now - 3 * 86400000;
      const warmCut = now - 14 * 86400000;
      const hotRow = await this.db.get<{ cnt: number }>(
        'select count(*) as cnt from memories where salience >= 0.7 or last_seen_at > ?',
        [hotCut],
      );
      const warmRow = await this.db.get<{ cnt: number }>(
        'select count(*) as cnt from memories where (salience >= 0.3 or last_seen_at > ?) and not (salience >= 0.7 or last_seen_at > ?)',
        [warmCut, hotCut],
      );
      const tiers = {
        hot: hotRow?.cnt || 0,
        warm: warmRow?.cnt || 0,
        cold: Math.max(
          totalMemories - ((hotRow?.cnt || 0) + (warmRow?.cnt || 0)),
          0,
        ),
      };
      const vec = this.mem.getVecCacheMetrics();
      res.json({
        memory: {
          total: totalMemories,
          vectorCount,
          waypointCount,
          sectorCounts,
          tiers,
          avgVectorDim: Number((avgDimRow?.avg || baseDim).toFixed(0)),
          baseVectorDim: baseDim,
          compressionRatio: Number((compressionRatio * 100).toFixed(1)),
          compressionCoverage: Number((compressionCoverage * 100).toFixed(1)),
          compressedCount: compressedCountRow?.cnt || 0,
          avgSalience: Number(avgSalience.toFixed(3)),
        },
        totalMemories,
        avgSalience: Number(avgSalience.toFixed(3)),
        recentMemories,
        requests: {
          total: requestsTotal,
          errors: errorsTotal,
          errorRate:
            requestsTotal > 0
              ? Number(((errorsTotal / requestsTotal) * 100).toFixed(2))
              : 0,
        },
        qps: {
          peak: Number(peakQps.toFixed(3)),
          average: Number(avgQps.toFixed(3)),
          cacheHitRate,
          latency: { p50, p95, p99 },
        },
        cache: {
          vecCache: vec,
        },
        config: {
          mode: String(process.env.ENGRAMMA_MODE || 'standard').toLowerCase(),
          cacheSegments: parseInt(
            String(process.env.ENGRAMMA_CACHE_SEGMENTS || '3'),
            10,
          ),
          maxActive: parseInt(
            String(process.env.ENGRAMMA_MAX_ACTIVE || '100'),
            10,
          ),
        },
        system: {
          uptime: {
            seconds: uptime,
            days: Math.floor(uptime / 86400),
            hours: Math.floor((uptime % 86400) / 3600),
          },
        },
      });
    } catch {
      res.status(500).json({ err: 'internal' });
    }
  }

  @Get('/dashboard/sectors/timeline')
  async sectorsTimeline(
    @Query('hours') h: string | undefined,
    @Res() res: Response,
  ) {
    try {
      const hrs = parseInt(h || '24');
      const start = Date.now() - hrs * 3600 * 1000;
      const rows = await this.db.all<{
        hour: string;
        primary_sector: string;
        count: number;
      }>(
        `select strftime('%H:00', datetime(created_at/1000, 'unixepoch', 'localtime')) as hour, primary_sector, count(*) as count
         from memories where created_at > ? group by hour, primary_sector order by hour`,
        [start],
      );
      res.json({ timeline: rows });
    } catch {
      res.status(500).json({ err: 'internal' });
    }
  }

  @Get('/dashboard/activity')
  async activity(@Query('limit') l: string | undefined, @Res() res: Response) {
    try {
      const lim = parseInt(l || '50');
      const rows = await this.db.all<{
        id: string;
        content: string;
        primary_sector: string;
        salience: number;
        created_at: number;
        updated_at: number;
        last_seen_at: number;
      }>(
        'select id, content, primary_sector, salience, created_at, updated_at, last_seen_at from memories order by updated_at desc limit ?',
        [lim],
      );
      res.json({
        activities: rows.map((m) => ({
          id: m.id,
          type: 'memory_updated',
          sector: m.primary_sector,
          content: `${m.content.substring(0, 100)}...`,
          salience: m.salience,
          timestamp: m.updated_at || m.created_at,
        })),
      });
    } catch {
      res.status(500).json({ err: 'internal' });
    }
  }

  @Get('/dashboard/top-memories')
  async top(@Query('limit') l: string | undefined, @Res() res: Response) {
    try {
      const lim = parseInt(l || '10');
      const rows = await this.db.all<{
        id: string;
        content: string;
        primary_sector: string;
        salience: number;
        last_seen_at: number;
      }>(
        'select id, content, primary_sector, salience, last_seen_at from memories order by salience desc limit ?',
        [lim],
      );
      res.json({
        memories: rows.map((m) => ({
          id: m.id,
          content: m.content,
          sector: m.primary_sector,
          salience: m.salience,
          lastSeen: m.last_seen_at,
        })),
      });
    } catch {
      res.status(500).json({ err: 'internal' });
    }
  }

  @Get('/dashboard/maintenance')
  async maintenance(
    @Query('hours') h: string | undefined,
    @Res() res: Response,
  ) {
    try {
      const hrs = parseInt(h || '24');
      const start = Date.now() - hrs * 3600 * 1000;
      const ops = await this.db.all<{
        type: string;
        hour: string;
        cnt: number;
      }>(
        `select type, strftime('%H:00', datetime(ts/1000, 'unixepoch', 'localtime')) as hour, sum(count) as cnt from stats where ts > ? group by type, hour order by hour`,
        [start],
      );
      const byHour: Record<
        string,
        {
          hour: string;
          decay: number;
          decay_hot: number;
          decay_warm: number;
          decay_cold: number;
          compression: number;
          fingerprint: number;
          regenerate: number;
          reinforce: number;
          prune_weak: number;
          prune_old: number;
          prune_dense: number;
          reflection: number;
          consolidation: number;
        }
      > = {};
      for (const op of ops) {
        if (!byHour[op.hour]) {
          byHour[op.hour] = {
            hour: op.hour,
            decay: 0,
            decay_hot: 0,
            decay_warm: 0,
            decay_cold: 0,
            compression: 0,
            fingerprint: 0,
            regenerate: 0,
            reinforce: 0,
            prune_weak: 0,
            prune_old: 0,
            prune_dense: 0,
            reflection: 0,
            consolidation: 0,
          };
        }
        if (op.type === 'decay') byHour[op.hour].decay = op.cnt;
        else if (op.type === 'decay_hot') byHour[op.hour].decay_hot = op.cnt;
        else if (op.type === 'decay_warm') byHour[op.hour].decay_warm = op.cnt;
        else if (op.type === 'decay_cold') byHour[op.hour].decay_cold = op.cnt;
        else if (op.type === 'compress') byHour[op.hour].compression = op.cnt;
        else if (op.type === 'fingerprint')
          byHour[op.hour].fingerprint = op.cnt;
        else if (op.type === 'regenerate') byHour[op.hour].regenerate = op.cnt;
        else if (op.type === 'reinforce') byHour[op.hour].reinforce = op.cnt;
        else if (op.type === 'prune_weak') byHour[op.hour].prune_weak = op.cnt;
        else if (op.type === 'prune_old') byHour[op.hour].prune_old = op.cnt;
        else if (op.type === 'prune_dense')
          byHour[op.hour].prune_dense = op.cnt;
        else if (op.type === 'reflect') byHour[op.hour].reflection = op.cnt;
        else if (op.type === 'consolidate')
          byHour[op.hour].consolidation = op.cnt;
      }
      const tot_decay = ops
        .filter((o) => o.type === 'decay')
        .reduce((s, o) => s + o.cnt, 0);
      const tot_decay_hot = ops
        .filter((o) => o.type === 'decay_hot')
        .reduce((s, o) => s + o.cnt, 0);
      const tot_decay_warm = ops
        .filter((o) => o.type === 'decay_warm')
        .reduce((s, o) => s + o.cnt, 0);
      const tot_decay_cold = ops
        .filter((o) => o.type === 'decay_cold')
        .reduce((s, o) => s + o.cnt, 0);
      const tot_compress = ops
        .filter((o) => o.type === 'compress')
        .reduce((s, o) => s + o.cnt, 0);
      const tot_fingerprint = ops
        .filter((o) => o.type === 'fingerprint')
        .reduce((s, o) => s + o.cnt, 0);
      const tot_reflect = ops
        .filter((o) => o.type === 'reflect')
        .reduce((s, o) => s + o.cnt, 0);
      const tot_consol = ops
        .filter((o) => o.type === 'consolidate')
        .reduce((s, o) => s + o.cnt, 0);
      const tot_regen = ops
        .filter((o) => o.type === 'regenerate')
        .reduce((s, o) => s + o.cnt, 0);
      const tot_reinf = ops
        .filter((o) => o.type === 'reinforce')
        .reduce((s, o) => s + o.cnt, 0);
      const tot_prune_weak = ops
        .filter((o) => o.type === 'prune_weak')
        .reduce((s, o) => s + o.cnt, 0);
      const tot_prune_old = ops
        .filter((o) => o.type === 'prune_old')
        .reduce((s, o) => s + o.cnt, 0);
      const tot_prune_dense = ops
        .filter((o) => o.type === 'prune_dense')
        .reduce((s, o) => s + o.cnt, 0);
      const tot_ops =
        tot_decay +
        tot_reflect +
        tot_consol +
        tot_decay_hot +
        tot_decay_warm +
        tot_decay_cold +
        tot_compress +
        tot_fingerprint +
        tot_regen +
        tot_reinf +
        tot_prune_weak +
        tot_prune_old +
        tot_prune_dense;
      const efficiency =
        tot_ops > 0
          ? Math.round(((tot_reflect + tot_consol) / tot_ops) * 100)
          : 0;
      res.json({
        operations: Object.values(byHour),
        totals: {
          cycles: tot_decay,
          cycles_by_tier: {
            hot: tot_decay_hot,
            warm: tot_decay_warm,
            cold: tot_decay_cold,
          },
          compression: tot_compress,
          fingerprints: tot_fingerprint,
          regenerations: tot_regen,
          reinforcements: tot_reinf,
          reflections: tot_reflect,
          consolidations: tot_consol,
          prunes: {
            weak: tot_prune_weak,
            old: tot_prune_old,
            dense: tot_prune_dense,
          },
          efficiency,
        },
      });
    } catch {
      res.status(500).json({ err: 'internal' });
    }
  }

  @Get('/dashboard/embed-logs')
  async embedLogs(
    @Query('limit') l: string | undefined,
    @Query('status') s: string | undefined,
    @Query('model') m: string | undefined,
    @Res() res: Response,
  ) {
    try {
      const lim = Math.max(1, parseInt(l || '50'));
      const clauses: string[] = [];
      const params: unknown[] = [];
      if (s) {
        clauses.push('status = ?');
        params.push(s);
      }
      if (m) {
        clauses.push('model = ?');
        params.push(m);
      }
      const where = clauses.length ? ' where ' + clauses.join(' and ') : '';
      const rows = await this.db.all<{
        id: string;
        model: string;
        status: string;
        ts: number;
        err: string | null;
        op: string | null;
        provider: string | null;
        duration_ms: number | null;
        input_len: number | null;
        output_dim: number | null;
        status_code: number | null;
        memory_id: string | null;
      }>(
        `select id, model, status, ts, err, op, provider, duration_ms, input_len, output_dim, status_code, memory_id from embed_logs${where} order by ts desc limit ?`,
        [...params, lim],
      );
      res.json({ logs: rows });
    } catch {
      res.status(500).json({ err: 'internal' });
    }
  }
}
