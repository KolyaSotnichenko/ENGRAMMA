import { Injectable } from '@nestjs/common';

type Algo = 'semantic' | 'syntactic' | 'aggressive';
type Metrics = { saved: number; ratio: number; pct: number; latency: number };
type Result = { comp: string; metrics: Metrics; hash: string };

@Injectable()
export class CompressionService {
  private total = 0;
  private saved = 0;
  private latency = 0;
  private last = 0;

  compress(text: string, algorithm?: Algo): Result {
    const t0 = Date.now();
    const algo: Algo = algorithm || 'semantic';
    const comp = this.apply(text, algo);
    const saved = Math.max(0, text.length - comp.length);
    const ratio = comp.length > 0 ? saved / comp.length : 0;
    const pct = text.length > 0 ? saved / text.length : 0;
    const lat = Date.now() - t0;
    this.total += text.length;
    this.saved += saved;
    this.latency += lat;
    this.last = lat;
    const m = { saved, ratio, pct, latency: lat };
    const hash = this.hash(comp);
    return { comp, metrics: m, hash };
  }

  batch(texts: string[], algorithm: Algo): Result[] {
    return texts.map((t) => this.compress(t, algorithm));
  }

  analyze(text: string): Record<Algo, Metrics> {
    const a: Record<Algo, Metrics> = {
      semantic: this.metrics(text, this.apply(text, 'semantic')),
      syntactic: this.metrics(text, this.apply(text, 'syntactic')),
      aggressive: this.metrics(text, this.apply(text, 'aggressive')),
    };
    return a;
  }

  getStats() {
    const avgRatio = this.total > 0 ? this.saved / this.total : 0;
    return {
      total: this.total,
      saved: this.saved,
      avgRatio,
      latency: this.latency,
      lastLatency: this.last,
    };
  }

  reset() {
    this.total = 0;
    this.saved = 0;
    this.latency = 0;
    this.last = 0;
  }

  private apply(text: string, algo: Algo): string {
    if (algo === 'semantic') return this.semantic(text);
    if (algo === 'syntactic') return this.syntactic(text);
    return this.aggressive(text);
  }

  private semantic(text: string): string {
    const stop = new Set([
      'the',
      'a',
      'an',
      'of',
      'and',
      'or',
      'to',
      'in',
      'on',
      'for',
      'with',
      'at',
      'by',
      'from',
      'is',
      'are',
      'was',
      'were',
    ]);
    return text
      .split(/\s+/)
      .filter((w) => !stop.has(w.toLowerCase()))
      .join(' ');
  }

  private syntactic(text: string): string {
    return text
      .replace(/[^\w\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private aggressive(text: string): string {
    const s = text.replace(/\s+/g, ' ').trim();
    return s.length > 256 ? s.slice(0, 256) : s;
  }

  private metrics(orig: string, comp: string): Metrics {
    const saved = Math.max(0, orig.length - comp.length);
    const ratio = comp.length > 0 ? saved / comp.length : 0;
    const pct = orig.length > 0 ? saved / orig.length : 0;
    return { saved, ratio, pct, latency: 0 };
  }

  private hash(text: string): string {
    let h = 0;
    for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) | 0;
    return Math.abs(h).toString(16);
  }
}
