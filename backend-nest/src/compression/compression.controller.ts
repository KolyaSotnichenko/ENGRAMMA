import { Body, Controller, Get, Post } from '@nestjs/common';
import { CompressionService } from './compression.service';
import { AnalyzeDto, BatchDto, CompressDto } from './dto/compression.dto';

@Controller()
export class CompressionController {
  constructor(private readonly svc: CompressionService) {}

  @Post('/api/compression/compress')
  compress(@Body() b: CompressDto) {
    if (!b.text) return { error: 'text required' };
    const r = this.svc.compress(b.text, b.algorithm);
    return { ok: true, comp: r.comp, m: r.metrics, hash: r.hash };
  }

  @Post('/api/compression/batch')
  batch(@Body() b: BatchDto) {
    if (!Array.isArray(b.texts)) return { error: 'texts must be array' };
    const algo: 'semantic' | 'syntactic' | 'aggressive' =
      b.algorithm || 'semantic';
    const r = this.svc.batch(b.texts, algo);
    return {
      ok: true,
      results: r.map((x) => ({ comp: x.comp, m: x.metrics, hash: x.hash })),
      total: r.reduce((s, x) => s + x.metrics.saved, 0),
    };
  }

  @Post('/api/compression/analyze')
  analyze(@Body() b: AnalyzeDto) {
    if (!b.text) return { error: 'text required' };
    const a = this.svc.analyze(b.text);
    let best: 'semantic' | 'syntactic' | 'aggressive' = 'semantic';
    let max = 0;
    for (const k of Object.keys(a) as Array<
      'semantic' | 'syntactic' | 'aggressive'
    >) {
      const pct = a[k].pct;
      if (pct > max) {
        max = pct;
        best = k;
      }
    }
    return {
      ok: true,
      analysis: a,
      rec: {
        algo: best,
        save: (a[best].pct * 100).toFixed(2) + '%',
        lat: this.svc.getStats().lastLatency.toFixed(2) + 'ms',
      },
    };
  }

  @Get('/api/compression/stats')
  stats() {
    const s = this.svc.getStats();
    return {
      ok: true,
      stats: {
        ...s,
        avgRatio: (s.avgRatio * 100).toFixed(2) + '%',
        totalPct:
          s.total > 0 ? ((s.saved / s.total) * 100).toFixed(2) + '%' : '0%',
        lat: s.lastLatency.toFixed(2) + 'ms',
        avgLat:
          s.total > 0 ? (s.latency / (s.total || 1)).toFixed(2) + 'ms' : '0ms',
      },
    };
  }

  @Post('/api/compression/reset')
  reset() {
    this.svc.reset();
    return { ok: true, msg: 'reset done' };
  }
}
