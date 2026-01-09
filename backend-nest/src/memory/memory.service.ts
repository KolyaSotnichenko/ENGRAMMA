import { Injectable, Logger } from '@nestjs/common';
import { MemoryRepository } from './memory.repository';
import { EmbeddingService } from './embedding.service';
import { randomUUID } from 'crypto';

type Sector =
  | 'episodic'
  | 'semantic'
  | 'procedural'
  | 'emotional'
  | 'reflective';

interface MemoryRow {
  id: string;
  user_id: string | null;
  segment: number;
  content: string;
  primary_sector: Sector;
  tags: string | null;
  meta: string | null;
  created_at: number;
  updated_at: number;
  last_seen_at: number;
  salience: number;
  decay_lambda: number;
  version: number;
}

interface VectorRow {
  id: string;
  sector: Sector;
  v: Buffer;
  dim: number;
}

interface AddResult {
  id: string;
  primary_sector: Sector;
  sectors: Sector[];
}
interface QueryFilters {
  sector?: Sector;
  min_score?: number;
  user_id?: string;
  use_graph?: boolean;
  graph_depth?: number;
}
interface QueryMatch {
  id: string;
  content: string;
  score: number;
  sectors: Sector[];
  primary_sector: Sector;
  path: string[];
  salience: number;
  last_seen_at: number;
}

type ReinforceResult = { ok: true } | { nf: true };

type PatchResult =
  | { id: string; updated: true }
  | { nf: true }
  | { forbidden: true };

interface MemoryItem {
  id: string;
  content: string;
  tags: string[];
  metadata: Record<string, unknown>;
  created_at: number;
  updated_at: number;
  last_seen_at: number;
  salience: number;
  decay_lambda: number;
  primary_sector: Sector;
  version: number;
  user_id: string | null;
}

interface MemoryDetails extends Omit<MemoryItem, 'tags' | 'metadata'> {
  sectors: Sector[];
  tags: string[];
  metadata: Record<string, unknown>;
}

interface IngestArgs {
  content_type: string;
  data: string | Buffer;
  metadata?: unknown;
  config?: unknown;
  user_id?: string;
}

interface IngestUrlArgs {
  url: string;
  metadata?: unknown;
  config?: unknown;
  user_id?: string;
}

@Injectable()
export class MemoryService {
  private readonly logger = new Logger(MemoryService.name);
  private readonly TTL = 60000;
  private activeQueries = 0;
  private readonly maxActive = parseInt(
    process.env.ENGRAMMA_MAX_ACTIVE || '100',
    10,
  );
  private resultCache = new Map<string, { r: QueryMatch[]; t: number }>();
  private vecCache = new Map<string, { v: number[]; t: number }>();
  private vecCacheHits = 0;
  private vecCacheMisses = 0;
  private vecCacheEvictions = 0;
  private idfTTL = 300000;
  private idfCache = new Map<string, { idf: number; t: number; N: number }>();
  private sectorWeights: Record<Sector, number> = {
    episodic: 0.9,
    semantic: 1.0,
    procedural: 0.85,
    emotional: 0.8,
    reflective: 0.8,
  };
  private fusionBeta = parseFloat(process.env.ENGRAMMA_FUSION_BETA || '2.0');
  private bmTTL = 300000;
  private bmIndex: {
    df: Map<string, number>;
    docLens: Map<string, number>;
    N: number;
    t: number;
    avgLen: number;
  } | null = null;
  private cacheSegs = parseInt(process.env.ENGRAMMA_CACHE_SEGMENTS || '3', 10);
  private activeSegments: number[] = [];
  private sessionLast = new Map<string, { id: string; t: number }>();
  constructor(
    private repo: MemoryRepository,
    private emb: EmbeddingService,
  ) {
    this.startPruneScheduler();
    try {
      const w = process.env.ENGRAMMA_SECTOR_WEIGHTS;
      if (w) {
        const o = JSON.parse(w) as Partial<Record<Sector, number>>;
        this.sectorWeights = {
          episodic: o.episodic ?? this.sectorWeights.episodic,
          semantic: o.semantic ?? this.sectorWeights.semantic,
          procedural: o.procedural ?? this.sectorWeights.procedural,
          emotional: o.emotional ?? this.sectorWeights.emotional,
          reflective: o.reflective ?? this.sectorWeights.reflective,
        };
      }
    } catch {
      /* empty */
    }
    const fb = parseFloat(process.env.ENGRAMMA_FUSION_BETA || '');
    if (!Number.isNaN(fb)) this.fusionBeta = fb;
    this.startDecayScheduler();
    this.startReflectScheduler();
    this.startReflectHierarchyScheduler();
    this.startCoactivationScheduler();
    this.startDensePruneScheduler();
    this.startSessionEventPruneScheduler();
    this.startBm25Migration();
    void this.refreshActiveSegments();
  }

  private canonicalTokens(text: string): Set<string> {
    return new Set(
      text
        .normalize('NFKC')
        .toLowerCase()
        .split(/[^\p{L}\p{N}]+/u)
        .filter((t) => t && t.length > 1),
    );
  }
  private tokenOverlap(a: Set<string>, b: Set<string>): number {
    if (a.size === 0) return 0;
    let ov = 0;
    for (const t of a) if (b.has(t)) ov++;
    return ov / a.size;
  }
  private latencyBucket(ms: number): string {
    if (ms <= 10) return 'lat_0_10';
    if (ms <= 50) return 'lat_10_50';
    if (ms <= 100) return 'lat_50_100';
    if (ms <= 250) return 'lat_100_250';
    if (ms <= 500) return 'lat_250_500';
    if (ms <= 1000) return 'lat_500_1000';
    if (ms <= 2000) return 'lat_1000_2000';
    return 'lat_2000_plus';
  }
  private boostedSim(s: number): number {
    const tau = 3;
    return 1 - Math.exp(-tau * s);
  }
  private recencyScore(last_seen: number): number {
    const days = (Date.now() - (last_seen || 0)) / (1000 * 60 * 60 * 24);
    const t = 7;
    const tmax = 60;
    return Math.exp(-days / t) * (1 - days / tmax);
  }

  private async shortestPath(
    src: string,
    dst: string,
    maxDepth: number,
  ): Promise<string[]> {
    if (!src || !dst) return [dst];
    if (src === dst) return [src];
    const visited = new Set<string>([src]);
    const queue: Array<{ id: string; path: string[]; depth: number }> = [
      { id: src, path: [src], depth: 0 },
    ];
    const maxD = Math.max(1, Math.min(5, maxDepth));
    while (queue.length) {
      const cur = queue.shift()!;
      if (cur.depth >= maxD) continue;
      const edges = await this.repo.listWaypointsFrom(cur.id, 50);
      for (const e of edges) {
        if (visited.has(e.dst_id)) continue;
        const nextPath = [...cur.path, e.dst_id];
        if (e.dst_id === dst) return nextPath;
        visited.add(e.dst_id);
        queue.push({ id: e.dst_id, path: nextPath, depth: cur.depth + 1 });
      }
    }
    return [dst];
  }
  private hybridScore(
    sim: number,
    tokOv: number,
    wpWt: number,
    rec: number,
    keywordScore = 0,
  ): number {
    const w = { similarity: 0.6, overlap: 0.2, waypoint: 0.15, recency: 0.05 };
    const sP = this.boostedSim(sim);
    const raw =
      w.similarity * sP +
      w.overlap * tokOv +
      w.waypoint * wpWt +
      w.recency * rec +
      keywordScore;
    return 1 / (1 + Math.exp(-raw));
  }

  private crossSectorResonance(ms: Sector, qs: Sector, base: number): number {
    const defaults: Record<Sector, Record<Sector, number>> = {
      episodic: {
        episodic: 1.0,
        semantic: 0.7,
        procedural: 0.3,
        emotional: 0.6,
        reflective: 0.6,
      },
      semantic: {
        episodic: 0.7,
        semantic: 1.0,
        procedural: 0.4,
        emotional: 0.7,
        reflective: 0.8,
      },
      procedural: {
        episodic: 0.3,
        semantic: 0.4,
        procedural: 1.0,
        emotional: 0.5,
        reflective: 0.2,
      },
      emotional: {
        episodic: 0.6,
        semantic: 0.7,
        procedural: 0.5,
        emotional: 1.0,
        reflective: 0.8,
      },
      reflective: {
        episodic: 0.6,
        semantic: 0.8,
        procedural: 0.2,
        emotional: 0.8,
        reflective: 1.0,
      },
    };
    let matrix = defaults;
    const raw = process.env.ENGRAMMA_SECTOR_RESONANCE;
    if (raw) {
      try {
        const cfg = JSON.parse(raw) as Record<string, Record<string, number>>;
        const out = { ...defaults } as Record<Sector, Record<Sector, number>>;
        (Object.keys(out) as Sector[]).forEach((s) => {
          out[s] = { ...out[s] };
          const row = cfg[s];
          if (row && typeof row === 'object') {
            (Object.keys(out[s]) as Sector[]).forEach((t) => {
              const v = row[t];
              if (typeof v === 'number' && isFinite(v)) out[s][t] = v;
            });
          }
        });
        matrix = out;
      } catch {
        /* empty */
      }
    }
    const factor = matrix[ms]?.[qs] ?? 1;
    return base * factor;
  }

  private async spreadingActivation(
    ids: string[],
    steps: number,
  ): Promise<Map<string, number>> {
    const act = new Map<string, number>();
    for (const id of ids) act.set(id, 1.0);
    const gamma = parseFloat(process.env.ENGRAMMA_ACTIVATION_GAMMA || '0.35');
    const att = Math.exp(-gamma * 1);
    for (let i = 0; i < Math.max(1, steps); i++) {
      const ups = new Map<string, number>();
      for (const [nid, a] of act) {
        const edges = await this.repo.listWaypointsFrom(nid, 50);
        for (const e of edges) {
          const v = (ups.get(e.dst_id) || 0) + e.weight * a * att;
          ups.set(e.dst_id, v);
        }
      }
      for (const [uid, v] of ups) {
        const cur = act.get(uid) || 0;
        act.set(uid, Math.max(cur, v));
      }
    }
    return act;
  }

  private determineEnergyThreshold(actSum: number, tau: number): number {
    const nrm = Math.max(0.1, actSum);
    return Math.max(0.1, Math.min(0.9, tau * (1 + Math.log(nrm + 1))));
  }

  private tokenize(text: string): string[] {
    return text
      .normalize('NFKC')
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter((t) => t && t.length > 1);
  }

  private getStopSet(): Set<string> {
    try {
      const s = process.env.ENGRAMMA_STOPWORDS;
      if (s) {
        const arr = JSON.parse(s) as string[];
        if (Array.isArray(arr) && arr.length)
          return new Set(arr.map((x) => String(x).toLowerCase()));
      }
    } catch {
      /* ignore */
    }
    return new Set([
      'the',
      'a',
      'an',
      'and',
      'or',
      'of',
      'to',
      'in',
      'on',
      'for',
      'with',
      'by',
      'as',
      'is',
      'are',
      'was',
      'were',
      'be',
      'been',
      'has',
      'have',
      'had',
      'it',
      'that',
      'this',
      'at',
      'from',
      'but',
      'not',
    ]);
  }

  private getStopSetForText(text: string): Set<string> {
    try {
      const s = process.env.ENGRAMMA_STOPWORDS;
      if (s) {
        const parsed = JSON.parse(s) as Record<string, unknown>;
        if (Array.isArray(parsed) && parsed.length)
          return new Set(parsed.map((x: unknown) => String(x).toLowerCase()));
        if (parsed && typeof parsed === 'object') {
          const obj = parsed;
          const sample = text.normalize('NFKC').toLowerCase();
          const langs: string[] = [];
          try {
            if (/\p{Script=Cyrillic}/u.test(sample)) langs.push('uk', 'ru');
          } catch {
            /* ignore */
          }
          try {
            if (/\p{Script=Latin}/u.test(sample)) langs.push('en');
          } catch {
            /* ignore */
          }
          try {
            if (/\p{Script=Han}/u.test(sample)) langs.push('zh');
          } catch {
            /* ignore */
          }
          try {
            if (
              /\p{Script=Hiragana}/u.test(sample) ||
              /\p{Script=Katakana}/u.test(sample)
            )
              langs.push('ja');
          } catch {
            /* ignore */
          }
          try {
            if (/\p{Script=Arabic}/u.test(sample)) langs.push('ar');
          } catch {
            /* ignore */
          }
          try {
            if (/\p{Script=Devanagari}/u.test(sample)) langs.push('hi');
          } catch {
            /* ignore */
          }
          const out: string[] = [];
          const seen = new Set<string>();
          for (const l of langs) {
            const arr = obj[l];
            if (Array.isArray(arr)) {
              for (const w of arr as unknown[]) {
                const ww = String(w).toLowerCase();
                if (!seen.has(ww)) {
                  out.push(ww);
                  seen.add(ww);
                }
              }
            }
          }
          if (out.length) return new Set(out);
          const en = obj['en'];
          if (Array.isArray(en) && (en as unknown[]).length)
            return new Set(
              (en as unknown[]).map((x) => String(x).toLowerCase()),
            );
        }
      }
    } catch {
      /* ignore */
    }
    return this.getStopSet();
  }

  private getLemmaMap(): Map<string, string> {
    try {
      const s = process.env.ENGRAMMA_REFLECT_LEMMAS;
      if (s) {
        const obj = JSON.parse(s) as Record<string, unknown>;
        if (obj && typeof obj === 'object') {
          const m = new Map<string, string>();
          for (const k of Object.keys(obj)) {
            const v = obj[k];
            m.set(
              String(k).toLowerCase(),
              String(typeof v === 'string' ? v : '').toLowerCase(),
            );
          }
          return m;
        }
      }
    } catch {
      /* ignore */
    }
    return new Map<string, string>();
  }

  private normalizeForReflections(tokens: string[], text: string): string[] {
    const sample = text.normalize('NFKC').toLowerCase();
    const lem = this.getLemmaMap();
    const base = tokens.map((w) => String(w).toLowerCase());
    const mapped = lem.size ? base.map((w) => lem.get(w) || w) : base;
    let cyr = false;
    let lat = false;
    try {
      cyr = /\p{Script=Cyrillic}/u.test(sample);
    } catch {
      /* ignore */
    }
    try {
      lat = /\p{Script=Latin}/u.test(sample);
    } catch {
      /* ignore */
    }
    if (cyr) {
      const uk = [
        'ами',
        'ями',
        'ів',
        'ев',
        'ов',
        'им',
        'ім',
        'ий',
        'ій',
        'их',
        'іх',
        'ою',
        'ею',
        'єю',
        'ам',
        'ям',
        'ах',
        'ях',
      ];
      const ru = [
        'ами',
        'ями',
        'ов',
        'ев',
        'ей',
        'ам',
        'ям',
        'ах',
        'ях',
        'ой',
        'ей',
        'ый',
        'ий',
        'ого',
        'его',
        'ому',
        'ему',
      ];
      const set = new Set([...uk, ...ru]);
      return mapped.map((t) => {
        let out = t;
        for (const s of set) {
          if (t.endsWith(s) && t.length - s.length >= 4) {
            const cand = t.slice(0, t.length - s.length);
            if (cand.length >= 4) {
              out = cand;
              break;
            }
          }
        }
        return out;
      });
    }
    if (lat) {
      const enStem =
        String(process.env.ENGRAMMA_REFLECT_EN_STEM || 'true') === 'true';
      if (!enStem) return mapped;
      const stemEn = (t: string): string => {
        const x = String(t).toLowerCase();
        if (x.endsWith('ies') && x.length > 4) return x.slice(0, -3) + 'y';
        if (x.endsWith('ing') && x.length > 5) return x.slice(0, -3);
        if (x.endsWith('ed') && x.length > 4) return x.slice(0, -2);
        if (x.endsWith('ly') && x.length > 4) return x.slice(0, -2);
        if (x.endsWith('es') && x.length > 4) return x.slice(0, -2);
        if (x.endsWith('s') && x.length > 3) return x.slice(0, -1);
        return x;
      };
      return mapped.map((w) => stemEn(w));
    }
    return mapped;
  }
  private computeBM25Score(
    qTokens: string[],
    docText: string,
    idf: Map<string, number>,
    avgLen: number,
  ): number {
    const toks = this.tokenize(docText);
    const len = toks.length || 1;
    const k1 = 1.5;
    const b = 0.75;
    const freq: Record<string, number> = {};
    for (const t of toks) freq[t] = (freq[t] || 0) + 1;
    let sum = 0;
    for (const qt of qTokens) {
      const tf = freq[qt] || 0;
      if (!tf) continue;
      const id = idf.get(qt) || 0;
      const denom = tf + k1 * (1 - b + b * (len / Math.max(1, avgLen)));
      sum += id * ((tf * (k1 + 1)) / denom);
    }
    return sum;
  }

  private getVectorCached(id: string, sector: Sector, buf: Buffer): number[] {
    const key = `vec:${id}:${sector}`;
    const hit = this.vecCache.get(key);
    if (
      hit &&
      Date.now() - hit.t <
        parseInt(process.env.ENGRAMMA_VEC_CACHE_TTL || '300000', 10)
    ) {
      this.vecCache.delete(key);
      this.vecCache.set(key, hit);
      this.vecCacheHits++;
      return hit.v;
    }
    const v = this.emb.bufferToVector(buf);
    this.vecCache.set(key, { v, t: Date.now() });
    this.evictVec();
    this.vecCacheMisses++;
    return v;
  }
  private getMeanVectorCached(id: string, buf: Buffer): number[] {
    const key = `mean:${id}`;
    const hit = this.vecCache.get(key);
    if (
      hit &&
      Date.now() - hit.t <
        parseInt(process.env.ENGRAMMA_VEC_CACHE_TTL || '300000', 10)
    ) {
      this.vecCache.delete(key);
      this.vecCache.set(key, hit);
      this.vecCacheHits++;
      return hit.v;
    }
    const v = this.emb.bufferToVector(buf);
    this.vecCache.set(key, { v, t: Date.now() });
    this.evictVec();
    this.vecCacheMisses++;
    return v;
  }
  private evictVec() {
    const max = parseInt(process.env.ENGRAMMA_VEC_CACHE_MAX || '5000', 10);
    while (this.vecCache.size > max) {
      const k = this.vecCache.keys().next().value as string;
      if (!k) break;
      this.vecCache.delete(k);
      this.vecCacheEvictions++;
    }
  }
  getVecCacheMetrics() {
    const ttl = parseInt(process.env.ENGRAMMA_VEC_CACHE_TTL || '300000', 10);
    const max = parseInt(process.env.ENGRAMMA_VEC_CACHE_MAX || '5000', 10);
    return {
      hits: this.vecCacheHits,
      misses: this.vecCacheMisses,
      size: this.vecCache.size,
      evictions: this.vecCacheEvictions,
      ttl_ms: ttl,
      max_entries: max,
    };
  }

  private buildContentAndCompressed(content: string): {
    content: string;
    compressed_vec: Buffer | null;
  } {
    const useSummary =
      String(process.env.ENGRAMMA_USE_SUMMARY_ONLY || 'false') === 'true';
    const compress =
      String(process.env.ENGRAMMA_COMPRESSION_ENABLED || 'false') === 'true';
    const maxLen = parseInt(
      process.env.ENGRAMMA_SUMMARY_MAX_LENGTH || '300',
      10,
    );
    const minLen = parseInt(
      process.env.ENGRAMMA_COMPRESSION_MIN_LENGTH || '100',
      10,
    );
    const text = content.trim().replace(/\s+/g, ' ');
    let summary = text;
    if (text.length > maxLen) {
      const parts = text.split(/([.!?])\s+/);
      let acc = '';
      for (let i = 0; i < parts.length && acc.length < maxLen; i++) {
        acc += parts[i];
        if (acc.length >= maxLen) break;
      }
      summary = acc.slice(0, maxLen);
    }
    if (useSummary) {
      const vec = this.emb.embed(summary);
      const buf = Buffer.from(new Float32Array(vec).buffer);
      return { content: summary, compressed_vec: buf };
    }
    if (compress && text.length >= minLen) {
      const vec = this.emb.embed(summary);
      const buf = Buffer.from(new Float32Array(vec).buffer);
      return { content, compressed_vec: buf };
    }
    return { content, compressed_vec: null };
  }

  private computeSimhash(text: string): string {
    const tokens = text.toLowerCase().split(/\W+/).filter(Boolean);
    const vec = new Array(64).fill(0);
    for (const t of tokens) {
      let h = 0;
      for (let i = 0; i < t.length; i++)
        h = ((h << 5) - h + t.charCodeAt(i)) | 0;
      for (let i = 0; i < 64; i++) vec[i] += h & (1 << i) ? 1 : -1;
    }
    let out = '';
    for (let i = 0; i < 64; i += 4) {
      const nib =
        (vec[i] > 0 ? 8 : 0) +
        (vec[i + 1] > 0 ? 4 : 0) +
        (vec[i + 2] > 0 ? 2 : 0) +
        (vec[i + 3] > 0 ? 1 : 0);
      out += nib.toString(16);
    }
    return out;
  }

  private async getIdf(tokens: string[]): Promise<Map<string, number>> {
    const idx = await this.getBm25Index();
    const out = new Map<string, number>();
    const now = Date.now();
    for (const t of tokens) {
      const cached = this.idfCache.get(t);
      if (cached && now - cached.t < this.idfTTL && cached.N === idx.N) {
        out.set(t, cached.idf);
        continue;
      }
      const df = idx.df.get(t) || 0;
      const idf = Math.log((idx.N + 1) / (df + 1)) + 1;
      this.idfCache.set(t, { idf, t: now, N: idx.N });
      out.set(t, idf);
    }
    return out;
  }

  private async reinforceCoactivation(ids: string[]): Promise<void> {
    const set = new Set(ids);
    for (const a of ids) {
      const wps = await this.repo.listWaypointsFrom(a, 100);
      for (const w of wps) {
        if (set.has(w.dst_id) && w.dst_id !== a) {
          const nw = Math.min(1, w.weight + 0.05);
          await this.repo.updateWaypointWeight(a, w.dst_id, nw);
          await this.repo.updateWaypointWeight(w.dst_id, a, nw);
        }
      }
    }
  }

  private async linkChain(ids: string[], user_id?: string): Promise<void> {
    const now = Date.now();
    const n = Math.min(ids.length - 1, 2);
    for (let i = 0; i < n; i++) {
      const a = ids[i],
        b = ids[i + 1];
      await this.repo.insertWaypointIfNotExists(
        a,
        b,
        user_id ?? null,
        0.1,
        now,
        now,
      );
      await this.repo.insertWaypointIfNotExists(
        b,
        a,
        user_id ?? null,
        0.1,
        now,
        now,
      );
    }
  }

  private decaySalience(
    salience: number,
    last_seen: number,
    lambda: number,
  ): number {
    const days = (Date.now() - (last_seen || 0)) / (1000 * 60 * 60 * 24);
    const f = Math.exp((-lambda * days) / (salience + 0.1));
    return Math.max(0, Math.min(1, salience * f));
  }

  private startPruneScheduler() {
    const mins = parseInt(
      process.env.ENGRAMMA_PRUNE_INTERVAL_MINUTES || '5',
      10,
    );
    const weak = parseFloat(
      process.env.ENGRAMMA_PRUNE_WEAK_THRESHOLD || '0.05',
    );
    const oldDays = parseFloat(process.env.ENGRAMMA_PRUNE_AGE_DAYS || '30');
    const oldThresh = parseFloat(
      process.env.ENGRAMMA_PRUNE_OLD_THRESHOLD || '0.1',
    );
    if (!mins || mins <= 0) return;
    setInterval(() => {
      void (async () => {
        const ageMs = oldDays * 86400000;
        const now = Date.now();
        const cw = await this.repo.countWaypointsWeak(weak);
        const co = await this.repo.countWaypointsOld(now - ageMs, oldThresh);
        await this.repo.pruneWaypoints(weak);
        await this.repo.pruneWaypointsAdvanced(weak, now - ageMs, oldThresh);
        if (cw > 0) await this.repo.incStat('prune_weak', cw, now);
        if (co > 0) await this.repo.incStat('prune_old', co, now);
      })();
    }, mins * 60000);
  }

  private startDecayScheduler() {
    const mins = parseInt(
      process.env.ENGRAMMA_DECAY_INTERVAL_MINUTES || '0',
      10,
    );
    if (!mins || mins <= 0) return;
    setInterval(() => {
      this.decayTick().catch((e) =>
        this.logger.error(
          `decayTick failed: ${e instanceof Error ? e.message : String(e)}`,
        ),
      );
    }, mins * 60000);
  }

  private startReflectScheduler() {
    const enabled =
      String(process.env.ENGRAMMA_AUTO_REFLECT || 'false') === 'true';
    if (!enabled) return;
    const mins = parseInt(process.env.ENGRAMMA_REFLECT_INTERVAL || '10', 10);
    if (!mins || mins <= 0) return;
    setInterval(() => {
      this.reflectTick().catch((e) =>
        this.logger.error(
          `reflectTick failed: ${e instanceof Error ? e.message : String(e)}`,
        ),
      );
    }, mins * 60000);
  }

  private startReflectHierarchyScheduler() {
    const enabled =
      String(process.env.ENGRAMMA_REFLECT_HIER_ENABLED || 'false') === 'true';
    if (!enabled) return;
    const mins = parseInt(
      process.env.ENGRAMMA_REFLECT_HIER_INTERVAL || '30',
      10,
    );
    if (!mins || mins <= 0) return;
    setInterval(() => {
      this.reflectSuperTick().catch((e) =>
        this.logger.error(
          `reflectSuperTick failed: ${e instanceof Error ? e.message : String(e)}`,
        ),
      );
    }, mins * 60000);
  }

  private startCoactivationScheduler() {
    const mins = parseInt(
      process.env.ENGRAMMA_COACT_INTERVAL_MINUTES || '10',
      10,
    );
    if (!mins || mins <= 0) return;
    setInterval(() => {
      this.coactivationTick().catch((e) =>
        this.logger.error(
          `coactivationTick failed: ${e instanceof Error ? e.message : String(e)}`,
        ),
      );
    }, mins * 60000);
  }

  private async coactivationTick(): Promise<void> {
    await this.coactIngestRecentEvents();
    const limit = parseInt(process.env.ENGRAMMA_COACT_TOP || '200', 10);
    const boost = parseFloat(process.env.ENGRAMMA_COACT_BOOST || '0.02');
    const rows = await this.repo.listTopCoactivations(limit);
    for (const r of rows) {
      const delta = Math.max(0, boost * Math.log(1 + (r.count || 0)));
      await this.repo.boostWaypoint(r.src_id, r.dst_id, delta);
      await this.repo.boostWaypoint(r.dst_id, r.src_id, delta);
    }
  }

  private startDensePruneScheduler() {
    const mins = parseInt(
      process.env.ENGRAMMA_DENSE_PRUNE_INTERVAL || '15',
      10,
    );
    if (!mins || mins <= 0) return;
    setInterval(() => {
      this.densePruneTick().catch((e) =>
        this.logger.error(
          `densePruneTick failed: ${e instanceof Error ? e.message : String(e)}`,
        ),
      );
    }, mins * 60000);
  }

  private startSessionEventPruneScheduler() {
    const ttlMin = parseInt(
      process.env.ENGRAMMA_SESSION_EVENT_TTL_MINUTES || '240',
      10,
    );
    const intervalMin = parseInt(
      process.env.ENGRAMMA_SESSION_PRUNE_INTERVAL_MINUTES || '10',
      10,
    );
    const perUserCap = parseInt(
      process.env.ENGRAMMA_SESSION_MAX_EVENTS_PER_USER || '1000',
      10,
    );
    if (!intervalMin || intervalMin <= 0) return;
    setInterval(
      () => {
        this.pruneSessionEventsTick(ttlMin, perUserCap).catch((e) =>
          this.logger.error(
            `pruneSessionEventsTick failed: ${e instanceof Error ? e.message : String(e)}`,
          ),
        );
      },
      Math.max(1, intervalMin) * 60000,
    );
  }

  private async pruneSessionEventsTick(
    ttlMinutes: number,
    perUserCap: number,
  ): Promise<void> {
    const now = Date.now();
    const cutoff = now - Math.max(1, ttlMinutes) * 60000;
    await this.repo.pruneSessionEventsOlderThan(cutoff);
    const users = await this.repo.listSessionEventUsers();
    for (const u of users) {
      await this.repo.pruneSessionEventsKeepLatestForUser(
        u,
        Math.max(1, perUserCap),
      );
    }
    await this.repo.pruneSessionEventsKeepLatestForUser(
      null,
      Math.max(1, perUserCap),
    );
  }

  private async densePruneTick(): Promise<void> {
    const k = parseInt(process.env.ENGRAMMA_PRUNE_MAX_OUTDEG || '8', 10);
    const thresh = parseFloat(
      process.env.ENGRAMMA_DENSE_PRUNE_THRESHOLD || '0.05',
    );
    const beta = parseFloat(process.env.ENGRAMMA_DENSE_SOFTMAX_BETA || '2.0');
    const pageSize = 1000;
    let offset = 0;
    let pruned = 0;
    for (;;) {
      const ids = await this.repo.listIds(pageSize, offset);
      if (!ids.length) break;
      for (const row of ids) {
        const wps = await this.repo.listWaypointsFrom(row.id, 5000);
        if (!wps.length) continue;
        const sorted = wps.slice().sort((a, b) => b.weight - a.weight);
        const keep = sorted.slice(0, k);
        const drop = sorted.slice(k).filter((w) => w.weight < thresh);
        for (const w of drop) {
          await this.repo.deleteWaypoint(row.id, w.dst_id);
          pruned++;
        }
        const sumExp = keep.reduce((a, w) => a + Math.exp(beta * w.weight), 0);
        if (sumExp > 0) {
          for (const w of keep) {
            const nw = Math.min(1, Math.exp(beta * w.weight) / sumExp);
            await this.repo.setWaypointWeight(row.id, w.dst_id, nw);
          }
        }
      }
      offset += pageSize;
    }
    if (pruned > 0) await this.repo.incStat('prune_dense', pruned, Date.now());
  }

  private startBm25Migration() {
    const enable =
      String(process.env.ENGRAMMA_BM25_MIGRATE_ON_START || 'false') === 'true';
    if (!enable) return;
    void this.migrateBm25();
  }
  private async migrateBm25(): Promise<void> {
    try {
      const existing = await this.repo.loadBm25Tokens();
      const meta = await this.repo.getBm25Meta();
      if ((existing?.length || 0) > 0 && (meta?.N || 0) > 0) return;
      const page = parseInt(
        process.env.ENGRAMMA_BM25_MIGRATE_BATCH || '500',
        10,
      );
      let offset = 0;
      let N = 0;
      let sum = 0;
      for (;;) {
        const batch = (await this.repo.listAll(page, offset)) as MemoryRow[];
        if (!batch.length) break;
        for (const m of batch) {
          const toks = this.tokenize(m.content);
          const set = new Set(toks);
          for (const t of set) await this.repo.updateBm25Token(t, 1);
          await this.repo.setBm25DocLen(m.id, toks.length);
          N += 1;
          sum += toks.length;
        }
        offset += page;
      }
      const avg = N ? sum / N : 1;
      await this.repo.replaceBm25Meta(N, avg, Date.now());
      this.logger.log(`bm25 migrated N=${N} avgLen=${avg.toFixed(2)}`);
    } catch (e: unknown) {
      this.logger.error(
        `bm25 migrate failed: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  private async coactIngestRecentEvents(): Promise<void> {
    const mins = parseInt(
      process.env.ENGRAMMA_COACT_WINDOW_MINUTES || '30',
      10,
    );
    const limit = parseInt(
      process.env.ENGRAMMA_COACT_EVENTS_LIMIT || '1000',
      10,
    );
    const now = Date.now();
    const since = now - Math.max(1, mins) * 60000;
    const evs = await this.repo.listSessionEventsSince(since, limit);
    const twRaw = process.env.ENGRAMMA_COACT_TYPE_WEIGHTS || '';
    let tw: Record<string, number> = {};
    try {
      tw = twRaw ? (JSON.parse(twRaw) as Record<string, number>) : {};
    } catch {
      /*ignore */
    }
    const alpha = parseFloat(process.env.ENGRAMMA_COACT_EVENT_ALPHA || '1');
    const sym =
      String(process.env.ENGRAMMA_COACT_EVENT_SYMMETRIC || 'true') === 'true';
    const groups = new Map<
      string,
      { mem_id: string; ts: number; type: string }[]
    >();
    for (const e of evs) {
      const key = e.user_id || 'null';
      const arr = groups.get(key) || [];
      arr.push({ mem_id: e.mem_id, ts: e.ts, type: e.type });
      groups.set(key, arr);
    }
    for (const [u, arr] of groups) {
      arr.sort((a, b) => a.ts - b.ts);
      for (let i = 1; i < arr.length; i++) {
        const prev = arr[i - 1];
        const cur = arr[i];
        const dt = Math.max(1, cur.ts - prev.ts);
        const w0 = Math.max(0.5, Number(tw[prev.type] || 1));
        const w1 = Math.max(0.5, Number(tw[cur.type] || 1));
        const w = Math.max(1, Math.round((alpha * (w0 + w1) * 60000) / dt));
        await this.repo.upsertCoactivation(
          prev.mem_id,
          cur.mem_id,
          u === 'null' ? null : u,
          w,
          cur.ts,
        );
        if (sym) {
          await this.repo.upsertCoactivation(
            cur.mem_id,
            prev.mem_id,
            u === 'null' ? null : u,
            w,
            cur.ts,
          );
        }
      }
    }
  }

  private async reflectTick(): Promise<void> {
    const min = parseInt(process.env.ENGRAMMA_REFLECT_MIN_MEMORIES || '20', 10);
    const segs = this.activeSegments.length
      ? this.activeSegments
      : [await this.repo.getMaxSegment()];
    const rows = await this.repo.listMeanVectorsInSegments(segs, 500);
    if (!rows.length || rows.length < min) return;
    let created = 0;
    const vecs: Array<{ id: string; v: number[] }> = [];
    for (const r of rows) {
      if (!r.mean_vec) continue;
      vecs.push({ id: r.id, v: this.getMeanVectorCached(r.id, r.mean_vec) });
    }
    const thr = parseFloat(
      process.env.ENGRAMMA_REFLECT_SIM_THRESHOLD || '0.88',
    );
    const minC = parseInt(process.env.ENGRAMMA_REFLECT_MIN_CLUSTER || '3', 10);
    const maxC = parseInt(process.env.ENGRAMMA_REFLECT_MAX_CLUSTERS || '2', 10);
    const n = vecs.length;
    const parent = Array.from({ length: n }, (_, i) => i);
    const find = (x: number) => {
      while (parent[x] !== x) x = parent[x];
      return x;
    };
    const union = (a: number, b: number) => {
      const ra = find(a),
        rb = find(b);
      if (ra !== rb) parent[rb] = ra;
    };
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const sim = this.emb.cosine(vecs[i].v, vecs[j].v);
        if (sim >= thr) union(i, j);
      }
    }
    const groups = new Map<number, string[]>();
    for (let i = 0; i < n; i++) {
      const r = find(i);
      const arr = groups.get(r) || [];
      arr.push(vecs[i].id);
      groups.set(r, arr);
    }
    let clusters = Array.from(groups.values()).filter((g) => g.length >= minC);
    clusters = clusters.slice(0, Math.max(1, maxC));
    const existing = (await this.repo.listBySector(
      'reflective',
      100,
      0,
    )) as MemoryRow[];
    const existingSets: Set<string>[] = [];
    for (const m of existing) {
      try {
        const meta = JSON.parse(m.meta || '{}') as Record<string, unknown>;
        const src = (meta['sources'] as string[]) || [];
        existingSets.push(new Set(src));
      } catch {
        /* ignore */
      }
    }
    for (const cluster of clusters) {
      const ovThr = parseFloat(
        process.env.ENGRAMMA_REFLECT_MAX_OVERLAP || '0.8',
      );
      let skip = false;
      for (const s of existingSets) {
        const inter = cluster.filter((id) => s.has(id)).length;
        const union = new Set<string>([...cluster, ...Array.from(s)]).size;
        const j = union > 0 ? inter / union : 0;
        if (j >= ovThr) {
          skip = true;
          break;
        }
      }
      if (skip) continue;
      const mems: MemoryRow[] = [];
      for (const cid of cluster) {
        const m = (await this.repo.getMemory(cid)) as MemoryRow | null;
        if (m) mems.push(m);
      }
      if (!mems.length) continue;
      const toks: Record<string, number> = {};
      const all = new Set<string>();
      for (const m of mems) {
        const ct0 = this.canonicalTokens(m.content);
        const ct = new Set(
          this.normalizeForReflections(Array.from(ct0), m.content),
        );
        for (const t of ct) {
          if (t.length >= 5) {
            toks[t] = (toks[t] || 0) + 1;
            all.add(t);
          }
        }
      }
      const idf = await this.getIdf(Array.from(all));
      const themes = Object.entries(toks)
        .map(([t, f]) => [t, f * (idf.get(t) || 0)] as [string, number])
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map(([t]) => t);
      const sample = mems.map((m) => m.content).join(' ');
      const stop = this.getStopSetForText(sample);
      const hasHan = (() => {
        try {
          return /\p{Script=Han}/u.test(sample);
        } catch {
          return false;
        }
      })();
      const phraseScores: Record<string, number> = {};
      for (const m of mems) {
        if (hasHan) {
          const chars = Array.from(m.content.normalize('NFKC')).filter((ch) => {
            try {
              return /\p{Script=Han}/u.test(ch);
            } catch {
              return false;
            }
          });
          for (let i = 0; i + 1 < chars.length; i++) {
            const a = chars[i];
            const b = chars[i + 1];
            const key = `${a}${b}`;
            phraseScores[key] = (phraseScores[key] || 0) + 1;
          }
          for (let i = 0; i + 2 < chars.length; i++) {
            const a = chars[i];
            const b = chars[i + 1];
            const c = chars[i + 2];
            const key = `${a}${b}${c}`;
            phraseScores[key] = (phraseScores[key] || 0) + 1;
          }
        } else {
          const seq0 = this.tokenize(m.content);
          const seq = this.normalizeForReflections(seq0, m.content).filter(
            (t) => t.length >= 4 && !stop.has(t),
          );
          for (let i = 0; i + 1 < seq.length; i++) {
            const a = seq[i],
              b = seq[i + 1];
            if (stop.has(a) && stop.has(b)) continue;
            const key = `${a} ${b}`;
            const s = (idf.get(a) || 0) + (idf.get(b) || 0);
            phraseScores[key] = (phraseScores[key] || 0) + s;
          }
          for (let i = 0; i + 2 < seq.length; i++) {
            const a = seq[i],
              b = seq[i + 1],
              c = seq[i + 2];
            if (stop.has(a) && stop.has(b) && stop.has(c)) continue;
            const key = `${a} ${b} ${c}`;
            const s = (idf.get(a) || 0) + (idf.get(b) || 0) + (idf.get(c) || 0);
            phraseScores[key] = (phraseScores[key] || 0) + s;
          }
        }
      }
      const phrases = Object.entries(phraseScores)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([p]) => p);
      const quotes: Array<{ q: string; s: number; id: string; i: number }> = [];
      for (const m of mems) {
        const parts = m.content.split(/([.!?])\s+/);
        for (let i = 0; i < parts.length; i += 2) {
          const sent = (parts[i] || '') + (parts[i + 1] || '');
          const st0 = this.canonicalTokens(sent);
          const st = new Set(
            this.normalizeForReflections(Array.from(st0), sent),
          );
          let s = 0;
          for (const t of themes) if (st.has(t)) s += idf.get(t) || 0;
          const txt = sent.trim();
          if (txt.length > 20 && txt.length <= 240)
            quotes.push({ q: txt, s, id: m.id, i });
        }
      }
      quotes.sort((a, b) => b.s - a.s);
      const evidence: Array<{ id: string; index: number; text: string }> = [];
      const seen = new Set<string>();
      const evMax = parseInt(
        process.env.ENGRAMMA_REFLECT_EVIDENCE_COUNT || '3',
        10,
      );
      for (const q of quotes) {
        if (!seen.has(q.q)) {
          evidence.push({ id: q.id, index: q.i, text: q.q });
          seen.add(q.q);
        }
        if (evidence.length >= Math.max(1, evMax)) break;
      }
      const text = `Reflection: common themes across ${mems.length} memories — ${themes.join(', ')}. Key phrases — ${phrases.join('; ')}.`;
      const id = randomUUID();
      const now = Date.now();
      const seg = mems[0].segment ?? 0;
      await this.repo.insertMemory({
        id,
        user_id: mems[0].user_id || null,
        segment: seg,
        content: text,
        simhash: this.computeSimhash(text),
        primary_sector: 'reflective',
        tags: JSON.stringify(['reflection', ...themes.slice(0, 3), ...phrases]),
        meta: JSON.stringify({
          sources: mems.map((m) => m.id),
          evidence,
          phrases,
        }),
        created_at: now,
        updated_at: now,
        last_seen_at: now,
        salience: 0.5,
        decay_lambda: 0.01,
        version: 1,
        mean_dim: null,
        mean_vec: null,
        compressed_vec: null,
        feedback_score: 0,
      });
      const vecMap = await this.emb.embedForSectors(text, [
        'reflective',
      ] as Sector[]);
      const vRef = vecMap['reflective'];
      await this.repo.insertVector(
        id,
        'reflective',
        mems[0].user_id || null,
        vRef,
        this.emb.dim,
      );
      const vMean = await this.emb.embedAsync(text);
      await this.repo.updateMean(id, this.emb.dim, vMean);
      for (const cid of cluster) {
        await this.repo.insertWaypointIfNotExists(
          cid,
          id,
          mems[0].user_id || null,
          0.9,
          now,
          now,
        );
        await this.repo.insertWaypointIfNotExists(
          id,
          cid,
          mems[0].user_id || null,
          0.9,
          now,
          now,
        );
      }
      created++;
    }
    if (created > 0) await this.repo.incStat('reflect', created, Date.now());
  }

  private async reflectSuperTick(): Promise<void> {
    const minC = parseInt(
      process.env.ENGRAMMA_REFLECT_SUPER_MIN_CLUSTER || '2',
      10,
    );
    const maxC = parseInt(
      process.env.ENGRAMMA_REFLECT_SUPER_MAX_CLUSTERS || '2',
      10,
    );
    const thr = parseFloat(
      process.env.ENGRAMMA_REFLECT_SUPER_SIM_THRESHOLD || '0.9',
    );
    const existing = (await this.repo.listBySector(
      'reflective',
      500,
      0,
    )) as MemoryRow[];
    const segs = this.activeSegments.length
      ? this.activeSegments
      : [await this.repo.getMaxSegment()];
    const mvRows = await this.repo.listMeanVectorsInSegments(segs, 500);
    const parents: Array<{ id: string; v: number[] }> = [];
    for (const r of mvRows) {
      if (!r.mean_vec) continue;
      const m = (await this.repo.getMemory(r.id)) as MemoryRow | null;
      if (!m || m.primary_sector !== 'reflective') continue;
      const meta = (() => {
        try {
          return JSON.parse(m.meta || '{}') as Record<string, unknown>;
        } catch {
          return {} as Record<string, unknown>;
        }
      })();
      const lvl = Number((meta['level'] as number) ?? 1);
      if (lvl !== 1) continue;
      parents.push({ id: m.id, v: this.getMeanVectorCached(m.id, r.mean_vec) });
    }
    const n = parents.length;
    if (!n || n < minC) return;
    const uf = Array.from({ length: n }, (_, i) => i);
    const find = (x: number) => {
      while (uf[x] !== x) x = uf[x];
      return x;
    };
    const union = (a: number, b: number) => {
      const ra = find(a),
        rb = find(b);
      if (ra !== rb) uf[rb] = ra;
    };
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const sim = this.emb.cosine(parents[i].v, parents[j].v);
        if (sim >= thr) union(i, j);
      }
    }
    const groups = new Map<number, string[]>();
    for (let i = 0; i < n; i++) {
      const r = find(i);
      const arr = groups.get(r) || [];
      arr.push(parents[i].id);
      groups.set(r, arr);
    }
    let clusters = Array.from(groups.values()).filter((g) => g.length >= minC);
    clusters = clusters.slice(0, Math.max(1, maxC));
    const existingSets: Array<{ src: Set<string>; lvl: number }> = [];
    for (const m of existing) {
      try {
        const meta = JSON.parse(m.meta || '{}') as Record<string, unknown>;
        const lvl = Number((meta['level'] as number) ?? 1);
        const src = (meta['sources'] as string[]) || [];
        existingSets.push({ src: new Set(src), lvl });
      } catch {
        /* ignore */
      }
    }
    const ovThr = parseFloat(process.env.ENGRAMMA_REFLECT_MAX_OVERLAP || '0.8');
    let created = 0;
    for (const cluster of clusters) {
      let skip = false;
      for (const s of existingSets) {
        if (s.lvl !== 2) continue;
        const inter = cluster.filter((id) => s.src.has(id)).length;
        const unionSz = new Set<string>([...cluster, ...Array.from(s.src)])
          .size;
        const j = unionSz > 0 ? inter / unionSz : 0;
        if (j >= ovThr) {
          skip = true;
          break;
        }
      }
      if (skip) continue;
      const mems: MemoryRow[] = [];
      for (const cid of cluster) {
        const m = (await this.repo.getMemory(cid)) as MemoryRow | null;
        if (m) mems.push(m);
      }
      if (!mems.length) continue;
      const toks: Record<string, number> = {};
      const all = new Set<string>();
      for (const m of mems) {
        const ct0 = this.canonicalTokens(m.content);
        const ct = new Set(
          this.normalizeForReflections(Array.from(ct0), m.content),
        );
        for (const t of ct) {
          if (t.length >= 5) {
            toks[t] = (toks[t] || 0) + 1;
            all.add(t);
          }
        }
      }
      const idf = await this.getIdf(Array.from(all));
      const themes = Object.entries(toks)
        .map(([t, f]) => [t, f * (idf.get(t) || 0)] as [string, number])
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map(([t]) => t);
      const phrases: string[] = [];
      const text = `Consolidation across ${mems.length} reflections — ${themes.join(', ')}.`;
      const id = randomUUID();
      const now = Date.now();
      const seg = mems[0].segment ?? 0;
      await this.repo.insertMemory({
        id,
        user_id: mems[0].user_id || null,
        segment: seg,
        content: text,
        simhash: this.computeSimhash(text),
        primary_sector: 'reflective',
        tags: JSON.stringify(['consolidation', ...themes.slice(0, 3)]),
        meta: JSON.stringify({
          level: 2,
          sources: mems.map((m) => m.id),
          phrases,
        }),
        created_at: now,
        updated_at: now,
        last_seen_at: now,
        salience: 0.6,
        decay_lambda: 0.01,
        version: 1,
        mean_dim: null,
        mean_vec: null,
        compressed_vec: null,
        feedback_score: 0,
      });
      const vecMap = await this.emb.embedForSectors(text, [
        'reflective',
      ] as Sector[]);
      const vRef = vecMap['reflective'];
      await this.repo.insertVector(
        id,
        'reflective',
        mems[0].user_id || null,
        vRef,
        this.emb.dim,
      );
      const vMean = await this.emb.embedAsync(text);
      await this.repo.updateMean(id, this.emb.dim, vMean);
      for (const cid of cluster) {
        await this.repo.insertWaypointIfNotExists(
          cid,
          id,
          mems[0].user_id || null,
          0.95,
          now,
          now,
        );
        await this.repo.insertWaypointIfNotExists(
          id,
          cid,
          mems[0].user_id || null,
          0.95,
          now,
          now,
        );
      }
      created++;
    }
    if (created > 0)
      await this.repo.incStat('consolidate', created, Date.now());
  }

  private async decayTick(): Promise<void> {
    const threads = parseInt(process.env.ENGRAMMA_DECAY_THREADS || '3', 10);
    const pageSize = 1000;
    const coldTh = parseFloat(
      process.env.ENGRAMMA_DECAY_COLD_THRESHOLD || '0.25',
    );
    let offset = 0;
    let updated = 0;
    let hotUpd = 0;
    let warmUpd = 0;
    let coldUpd = 0;
    let compOps = 0;
    let fpOps = 0;

    const compressVec = (
      vec: number[],
      f: number,
      minDim = 64,
      maxDim = this.emb.dim,
    ): number[] => {
      const target = Math.max(minDim, Math.floor(maxDim * Math.max(0.2, f)));
      if (vec.length <= target) return vec;
      const buckets = target;
      const out: number[] = Array.from({ length: buckets }, () => 0);
      const step = vec.length / buckets;
      for (let i = 0; i < vec.length; i++) {
        const bi = Math.min(buckets - 1, Math.floor(i / step));
        out[bi] += vec[i];
      }
      const norm = 1 / Math.max(1, Math.floor(step));
      for (let i = 0; i < out.length; i++) out[i] *= norm;
      return out;
    };
    const summarize = (text: string, f: number): string => {
      const maxLen = f < 0.4 ? 200 : 300;
      const parts = text
        .trim()
        .replace(/\s+/g, ' ')
        .split(/([.!?])\s+/);
      let acc = '';
      for (let i = 0; i < parts.length && acc.length < maxLen; i++)
        acc += parts[i];
      return acc.length ? acc.slice(0, maxLen) : text.slice(0, maxLen);
    };
    const fingerprint = (text: string, d = 32): number[] => {
      const toks = text.toLowerCase().split(/\W+/).filter(Boolean);
      const v = new Array(d).fill(0);
      for (const t of toks) {
        let h = 0;
        for (let i = 0; i < t.length; i++)
          h = ((h << 5) - h + t.charCodeAt(i)) | 0;
        for (let i = 0; i < d; i++) v[i] += h & (1 << i % 31) ? 1 : -1;
      }
      const maxAbs = Math.max(...v.map((x) => Math.abs(x))) || 1;
      return v.map((x) => x / maxAbs);
    };

    for (;;) {
      const batch = (await this.repo.listAll(pageSize, offset)) as MemoryRow[];
      if (!batch.length) break;
      const buckets: MemoryRow[][] = Array.from(
        { length: Math.max(1, threads) },
        () => [],
      );
      for (let i = 0; i < batch.length; i++)
        buckets[i % Math.max(1, threads)].push(batch[i]);
      await Promise.all(
        buckets.map(async (chunk) => {
          for (const m of chunk) {
            const hotL = parseFloat(
              process.env.ENGRAMMA_DECAY_LAMBDA_HOT || '0.005',
            );
            const warmL = parseFloat(
              process.env.ENGRAMMA_DECAY_LAMBDA_WARM || '0.02',
            );
            const coldL = parseFloat(
              process.env.ENGRAMMA_DECAY_LAMBDA_COLD || '0.05',
            );
            const days = (Date.now() - (m.last_seen_at || 0)) / 86400000;
            const tier: 'hot' | 'warm' | 'cold' =
              m.salience >= 0.7 || days < 3
                ? 'hot'
                : m.salience >= 0.3 || days < 14
                  ? 'warm'
                  : 'cold';
            let lam =
              m.decay_lambda ||
              (tier === 'hot' ? hotL : tier === 'warm' ? warmL : coldL);
            const coMod = parseFloat(
              process.env.ENGRAMMA_DECAY_COACT_MOD || '0.15',
            );
            const wps2 = await this.repo.listWaypointsFrom(m.id, 1);
            if (wps2.length) lam = lam * Math.max(0.1, 1 - coMod);
            const ns = this.decaySalience(m.salience, m.last_seen_at, lam);
            const sal0 = Math.max(0.01, m.salience || 0.01);
            const f = Math.max(0, Math.min(1, ns / sal0));
            if (f < 0.7) {
              const vecs = (await this.repo.getVectorsById(
                m.id,
              )) as VectorRow[];
              const vr = vecs.find((x) => x.sector === m.primary_sector);
              if (vr) {
                const v0 = this.getVectorCached(m.id, vr.sector, vr.v);
                const vc = compressVec(v0, f);
                if (vc.length < vr.dim)
                  await this.repo.updateVector(m.id, vr.sector, vc, vc.length);
              }
              const sum = summarize(m.content, f);
              const cvec = this.emb.embed(sum);
              const cbuf = Buffer.from(new Float32Array(cvec).buffer);
              await this.repo.updateMemoryWithCompression(
                m.id,
                m.content,
                m.tags || '[]',
                m.meta || '{}',
                cbuf,
              );
              compOps++;
              if (f < coldTh && vr) {
                const fp = fingerprint(sum, 32);
                await this.repo.updateVector(m.id, vr.sector, fp, fp.length);
                fpOps++;
              }
            }
            if (ns !== m.salience) {
              await this.repo.updateSalience(m.id, ns);
              if (tier === 'hot') hotUpd++;
              else if (tier === 'warm') warmUpd++;
              else coldUpd++;
              updated++;
            }
          }
        }),
      );
      offset += pageSize;
    }
    if (updated > 0) {
      const ts = Date.now();
      await this.repo.incStat('decay', updated, ts);
      if (hotUpd > 0) await this.repo.incStat('decay_hot', hotUpd, ts);
      if (warmUpd > 0) await this.repo.incStat('decay_warm', warmUpd, ts);
      if (coldUpd > 0) await this.repo.incStat('decay_cold', coldUpd, ts);
      if (compOps > 0) await this.repo.incStat('compress', compOps, ts);
      if (fpOps > 0) await this.repo.incStat('fingerprint', fpOps, ts);
    }
  }

  private async getBm25Index(): Promise<{
    df: Map<string, number>;
    docLens: Map<string, number>;
    N: number;
    avgLen: number;
  }> {
    if (this.bmIndex && Date.now() - this.bmIndex.t < this.bmTTL)
      return this.bmIndex;
    const rows = await this.repo.loadBm25Tokens();
    const df = new Map<string, number>();
    for (const r of rows) df.set(r.token, r.df || 0);
    let N = 0;
    let avgLen = 1;
    const meta = await this.repo.getBm25Meta();
    if (meta && meta.N > 0) {
      N = meta.N;
      avgLen = meta.avgLen || 1;
    } else {
      const cs = await this.repo.countBm25Docs();
      N = cs?.c || 0;
      const sum = cs?.s || 0;
      avgLen = N ? sum / N : 1;
      await this.repo.replaceBm25Meta(N, avgLen, Date.now());
    }
    this.bmIndex = {
      df,
      docLens: new Map<string, number>(),
      N,
      t: Date.now(),
      avgLen,
    };
    if (df.size === 0 || N === 0) {
      const df2 = new Map<string, number>();
      const docLens2 = new Map<string, number>();
      let N2 = 0;
      const pageSize = 1000;
      let offset = 0;
      for (;;) {
        const batch = (await this.repo.listAll(
          pageSize,
          offset,
        )) as MemoryRow[];
        if (!batch.length) break;
        for (const m of batch) {
          const toks = this.tokenize(m.content);
          const set = new Set(toks);
          for (const t of set) df2.set(t, (df2.get(t) || 0) + 1);
          docLens2.set(m.id, toks.length);
          N2++;
        }
        offset += pageSize;
      }
      const avgLen2 = N2
        ? Array.from(docLens2.values()).reduce((a, b) => a + b, 0) / N2
        : 1;
      this.bmIndex = {
        df: df2,
        docLens: docLens2,
        N: N2,
        t: Date.now(),
        avgLen: avgLen2,
      };
    }
    return this.bmIndex;
  }

  private async updateBm25OnAdd(id: string, content: string): Promise<void> {
    const toks = this.tokenize(content);
    const set = new Set(toks);
    for (const t of set) await this.repo.updateBm25Token(t, 1);
    await this.repo.setBm25DocLen(id, toks.length);
    const meta = await this.repo.getBm25Meta();
    const N0 = meta?.N || 0;
    const avg0 = meta?.avgLen || 1;
    const N1 = N0 + 1;
    const avg1 = (avg0 * N0 + toks.length) / Math.max(1, N1);
    await this.repo.replaceBm25Meta(N1, avg1, Date.now());
    if (!this.bmIndex)
      this.bmIndex = {
        df: new Map(),
        docLens: new Map(),
        N: 0,
        t: 0,
        avgLen: 1,
      };
    for (const t of set)
      this.bmIndex.df.set(t, (this.bmIndex.df.get(t) || 0) + 1);
    this.bmIndex.docLens.set(id, toks.length);
    this.bmIndex.N = N1;
    this.bmIndex.avgLen = avg1;
    this.bmIndex.t = Date.now();
  }

  private async updateBm25OnPatch(
    id: string,
    oldContent: string,
    newContent: string,
  ): Promise<void> {
    const oldT = this.tokenize(oldContent);
    const newT = this.tokenize(newContent);
    const oldSet = new Set(oldT);
    const newSet = new Set(newT);
    for (const t of oldSet)
      if (!newSet.has(t)) await this.repo.updateBm25Token(t, -1);
    for (const t of newSet)
      if (!oldSet.has(t)) await this.repo.updateBm25Token(t, 1);
    const prevLen = (await this.repo.getBm25DocLen(id))?.len || oldT.length;
    await this.repo.setBm25DocLen(id, newT.length);
    const meta = await this.repo.getBm25Meta();
    const N0 = meta?.N || 0;
    const avg0 = meta?.avgLen || 1;
    const avg1 = N0 ? (avg0 * N0 - prevLen + newT.length) / N0 : avg0;
    await this.repo.replaceBm25Meta(N0, avg1, Date.now());
    if (!this.bmIndex)
      this.bmIndex = {
        df: new Map(),
        docLens: new Map(),
        N: N0,
        t: 0,
        avgLen: avg0,
      };
    for (const t of oldSet)
      if (!newSet.has(t))
        this.bmIndex.df.set(t, Math.max(0, (this.bmIndex.df.get(t) || 0) - 1));
    for (const t of newSet)
      if (!oldSet.has(t))
        this.bmIndex.df.set(t, (this.bmIndex.df.get(t) || 0) + 1);
    this.bmIndex.docLens.set(id, newT.length);
    this.bmIndex.avgLen = avg1;
    this.bmIndex.t = Date.now();
  }

  private async linkSession(user_id?: string, id?: string): Promise<void> {
    if (!user_id || !id) return;
    const prev = this.sessionLast.get(user_id);
    const now = Date.now();
    const timeoutMin = parseInt(
      process.env.ENGRAMMA_SESSION_TIMEOUT_MINUTES || '30',
      10,
    );
    const timeoutMs = Math.max(1, timeoutMin) * 60000;
    const within = prev && now - prev.t <= timeoutMs;
    if (prev && prev.id !== id && within) {
      await this.repo.insertWaypointIfNotExists(
        prev.id,
        id,
        user_id ?? null,
        0.1,
        now,
        now,
      );
      await this.repo.insertWaypointIfNotExists(
        id,
        prev.id,
        user_id ?? null,
        0.1,
        now,
        now,
      );
      await this.repo.upsertCoactivation(prev.id, id, user_id ?? null, 1, now);
      await this.repo.upsertCoactivation(id, prev.id, user_id ?? null, 1, now);
    }
    this.sessionLast.set(user_id, { id, t: now });
  }

  private async refreshActiveSegments(): Promise<void> {
    const n = Math.max(1, this.cacheSegs);
    const maxSeg = await this.repo.getMaxSegment();
    const segs: number[] = [];
    for (let s = maxSeg; s >= 0 && segs.length < n; s--) segs.push(s);
    this.activeSegments = segs;
  }

  private async logEvent(
    user_id?: string,
    id?: string,
    type?: string,
  ): Promise<void> {
    if (!id) return;
    const ts = Date.now();
    await this.repo.insertSessionEvent(user_id ?? null, id, type || 'view', ts);
  }

  async add(
    content: string,
    tags?: string[],
    metadata?: Record<string, unknown>,
    user_id?: string,
  ): Promise<AddResult> {
    const id = randomUUID();
    const now = Date.now();
    const cls = this.emb.classify(content, metadata);
    this.logger.log(
      `add id=${id} sector=${cls.primary_sector} user=${user_id ?? 'null'} len=${content.length}`,
    );
    const salience = Math.max(
      0,
      Math.min(1, 0.4 + 0.1 * (cls.sectors.length - 1)),
    );
    const decay_lambda = 0.01;
    const segSize = parseInt(process.env.ENGRAMMA_SEG_SIZE || '10000', 10);
    const maxSeg = await this.repo.getMaxSegment();
    const cntMax = await this.repo.countInSegment(maxSeg);
    const segment = cntMax >= segSize ? maxSeg + 1 : maxSeg;
    const built = this.buildContentAndCompressed(content);
    await this.repo.insertMemory({
      id,
      user_id: user_id ?? null,
      segment: segment,
      content: built.content,
      simhash: this.computeSimhash(content),
      primary_sector: cls.primary_sector,
      tags: JSON.stringify(tags || []),
      meta: JSON.stringify(metadata || {}),
      created_at: now,
      updated_at: now,
      last_seen_at: now,
      salience,
      decay_lambda,
      version: 1,
      mean_dim: null,
      mean_vec: null,
      compressed_vec: built.compressed_vec,
      feedback_score: 0,
    });
    await this.updateBm25OnAdd(id, built.content);
    await this.refreshActiveSegments();
    const vecMap = await this.emb.embedForSectors(
      content,
      cls.sectors as Sector[],
    );
    for (const s of cls.sectors) {
      const vecS = vecMap[s as Sector];
      await this.repo.insertVector(
        id,
        s as Sector,
        user_id ?? null,
        vecS,
        this.emb.dim,
      );
    }
    const vec0 = await this.emb.embedAsync(content);
    await this.repo.updateMean(id, this.emb.dim, vec0);
    const segs = this.activeSegments.length ? this.activeSegments : [segment];
    const cands = await this.repo.listMeanVectorsInSegments(segs, 200);
    let best: { id: string; sim: number } | null = null;
    for (const c of cands) {
      if (!c.mean_vec || c.id === id) continue;
      const mv = this.getMeanVectorCached(c.id, c.mean_vec);
      const sim = this.emb.cosine(vec0, mv);
      if (!best || sim > best.sim) best = { id: c.id, sim };
    }
    if (best && best.sim >= 0.75) {
      await this.repo.insertWaypoint(
        id,
        best.id,
        user_id ?? null,
        best.sim,
        now,
        now,
      );
    } else {
      await this.repo.insertWaypoint(id, id, user_id ?? null, 1.0, now, now);
    }
    const same = await this.repo.getVectorsBySector(
      cls.primary_sector as Sector,
      user_id ?? null,
    );
    const vecPrim = vecMap[cls.primary_sector as Sector];
    for (const vr of same) {
      if (vr.id === id) continue;
      const exVec = this.getVectorCached(
        vr.id,
        cls.primary_sector as Sector,
        vr.v,
      );
      const sim = this.emb.cosine(vecPrim, exVec);
      if (sim >= 0.75) {
        await this.repo.insertWaypoint(
          id,
          vr.id,
          user_id ?? null,
          0.5,
          now,
          now,
        );
        await this.repo.insertWaypoint(
          vr.id,
          id,
          user_id ?? null,
          0.5,
          now,
          now,
        );
      }
    }
    this.logger.log(
      `vector inserted id=${id} sectors=${cls.sectors.length} dim=${this.emb.dim}`,
    );
    await this.linkSession(user_id, id);
    await this.logEvent(user_id, id, 'add');
    return {
      id,
      primary_sector: cls.primary_sector as Sector,
      sectors: cls.sectors as Sector[],
    };
  }

  async query(
    query: string,
    k = 8,
    filters?: QueryFilters,
  ): Promise<QueryMatch[]> {
    const key = JSON.stringify({ q: query, k, f: filters || {} });
    const t0 = Date.now();
    const cached = this.resultCache.get(key);
    if (cached && Date.now() - cached.t < this.TTL) {
      await this.repo.incStat('request', 1, Date.now());
      await this.repo.incStat('cache_hit', 1, Date.now());
      const ms = Date.now() - t0;
      await this.repo.incStat('query_latency_sum', ms, Date.now());
      await this.repo.incStat('query_latency_count', 1, Date.now());
      await this.repo.incStat(this.latencyBucket(ms), 1, Date.now());
      return cached.r;
    }
    if (this.activeQueries >= this.maxActive)
      throw new Error(
        `Rate limit: ${this.activeQueries} active queries (max ${this.maxActive})`,
      );
    this.activeQueries++;
    try {
      const cls = this.emb.classify(query);
      const searchSectors: Sector[] = filters?.sector
        ? [filters.sector]
        : (cls.sectors as Sector[]);
      const qTok = this.canonicalTokens(query);
      const qVs: Record<Sector, number[]> = await this.emb.embedForSectors(
        query,
        searchSectors,
      );
      const u = filters?.user_id || null;
      const items = new Map<
        string,
        { sims: Partial<Record<Sector, number>> }
      >();
      for (const s of searchSectors) {
        const rows = (await this.repo.getVectorsBySector(s, u)) as VectorRow[];
        const qv = qVs[s];
        for (const r of rows) {
          const sim = this.emb.cosine(qv, this.getVectorCached(r.id, s, r.v));
          const cur = items.get(r.id) || { sims: {} };
          const prev = cur.sims[s] ?? 0;
          cur.sims[s] = prev > 0 ? Math.max(prev, sim) : sim;
          items.set(r.id, cur);
        }
      }
      const qMin = parseInt(process.env.ENGRAMMA_KEYWORD_MIN_LENGTH || '3', 10);
      const qLong = Array.from(qTok).filter((t) => t.length >= qMin);
      const idf = await this.getIdf(qLong);
      const idx = await this.getBm25Index();
      const avgLen = idx.avgLen || 1;
      const mems = new Map<string, MemoryRow>();
      for (const id of items.keys()) {
        const m = (await this.repo.getMemory(id)) as MemoryRow | null;
        if (m) mems.set(id, m);
      }
      const scored: Array<{ id: string; score: number }> = [];
      const prev = u ? this.sessionLast.get(u) : undefined;
      const useGraph =
        (filters?.use_graph ?? false) ||
        String(process.env.ENGRAMMA_USE_GRAPH || 'false') === 'true';
      const graphDepth = Math.max(
        1,
        filters?.graph_depth ||
          parseInt(process.env.ENGRAMMA_GRAPH_DEPTH || '2', 10),
      );
      const coBoost = parseFloat(
        process.env.ENGRAMMA_QUERY_COACT_BOOST || '0.05',
      );
      const coMap = new Map<string, number>();
      if (prev?.id) {
        const rows = await this.repo.listCoactivationsFrom(prev.id, u);
        for (const r of rows) coMap.set(r.dst_id, r.count || 0);
      }
      for (const [id, agg] of items) {
        const m = mems.get(id);
        if (!m) continue;
        const memTok = this.canonicalTokens(m.content);
        const tokOv = this.tokenOverlap(qTok, memTok);
        const rec = this.recencyScore(m.last_seen_at);
        const wps = await this.repo.listWaypointsFrom(id, 1);
        const wpWt = wps.length ? wps[0].weight : 0.3;
        let numW = 0,
          denW = 0;
        for (const s of searchSectors) {
          const simS = agg.sims[s] ?? 0;
          const wS =
            (this.sectorWeights[s] || 1) * Math.exp(this.fusionBeta * simS);
          numW += wS * simS;
          denW += wS;
        }
        const fusedSim = denW > 0 ? numW / denW : 0;
        const qs = searchSectors[0];
        const fusedAdj = this.crossSectorResonance(
          m.primary_sector,
          qs,
          fusedSim,
        );
        let kw = 0;
        const tier = String(process.env.ENGRAMMA_TIER || 'fast').toLowerCase();
        if (tier === 'hybrid') {
          const bm = this.computeBM25Score(qLong, m.content, idf, avgLen);
          const boost = parseFloat(process.env.ENGRAMMA_KEYWORD_BOOST || '2.5');
          kw = Math.log(1 + bm) * boost;
        } else {
          let num = 0,
            den = 0;
          for (const t of qLong) {
            const w = idf.get(t) || 0;
            den += w;
            if (memTok.has(t)) num += w;
          }
          kw = den > 0 ? num / den : 0;
        }
        const h =
          this.hybridScore(fusedAdj, tokOv, wpWt, rec, kw) +
          coBoost * Math.log(1 + (coMap.get(id) || 0));
        scored.push({ id, score: h });
      }
      const seeds = scored
        .slice(0, Math.min(5, scored.length))
        .map((x) => x.id);
      const steps = parseInt(process.env.ENGRAMMA_ACTIVATION_STEPS || '2', 10);
      const act = await this.spreadingActivation(seeds, Math.max(1, steps));
      const wEnergy = parseFloat(
        process.env.ENGRAMMA_ACTIVATION_WEIGHT || '0.3',
      );
      const tau = parseFloat(process.env.ENGRAMMA_ACTIVATION_TAU || '0.4');
      const sumE = Array.from(act.values()).reduce((a, b) => a + b, 0);
      const thr = this.determineEnergyThreshold(sumE, tau);
      const scored2 = scored
        .map((x) => ({
          id: x.id,
          score: x.score + wEnergy * (act.get(x.id) || 0),
        }))
        .filter((x) => x.score > thr);
      scored2.sort((a, b) => b.score - a.score);
      const out: QueryMatch[] = [];
      for (const t of scored2.slice(0, k)) {
        const m = (await this.repo.getMemory(t.id)) as MemoryRow | null;
        if (!m) continue;
        const regen =
          String(process.env.ENGRAMMA_REGENERATION_ENABLED || 'true') ===
          'true';
        const minDim = parseInt(
          process.env.ENGRAMMA_MIN_VECTOR_DIM || '64',
          10,
        );
        if (regen) {
          const vecs = (await this.repo.getVectorsById(m.id)) as VectorRow[];
          const vr = vecs.find((x) => x.sector === m.primary_sector);
          if (vr && vr.dim < this.emb.dim && vr.dim <= minDim) {
            const vFull = await this.emb.embedForSectorAsync(
              m.content,
              m.primary_sector,
            );
            await this.repo.updateVector(
              m.id,
              m.primary_sector,
              vFull,
              vFull.length,
            );
            await this.repo.incStat('regenerate', 1, Date.now());
          }
        }
        out.push({
          id: m.id,
          content: m.content,
          score: t.score,
          sectors: searchSectors,
          primary_sector: m.primary_sector,
          path:
            prev?.id && useGraph
              ? await this.shortestPath(prev.id, m.id, graphDepth)
              : [m.id],
          salience: m.salience,
          last_seen_at: m.last_seen_at,
        });
      }
      const reinforce =
        String(process.env.ENGRAMMA_DECAY_REINFORCE_ON_QUERY || 'true') ===
        'true';
      const coldTh = parseFloat(
        process.env.ENGRAMMA_DECAY_COLD_THRESHOLD || '0.25',
      );
      if (reinforce) {
        const now = Date.now();
        for (const o of out) {
          const regen =
            String(process.env.ENGRAMMA_REGENERATION_ENABLED || 'true') ===
            'true';
          const boost = regen && o.salience < coldTh ? 0.05 : 0.01;
          const ns = Math.min(1, (o.salience || 0) + boost);
          await this.repo.updateSeen(o.id, now, ns);
        }
      }
      await this.linkSession(filters?.user_id, out[0]?.id);
      await this.logEvent(filters?.user_id, out[0]?.id, 'query');
      await this.linkChain(
        out.map((o) => o.id),
        filters?.user_id,
      );
      await this.reinforceCoactivation(out.map((o) => o.id));
      this.resultCache.set(key, { r: out, t: Date.now() });
      const ms = Date.now() - t0;
      await this.repo.incStat('request', 1, Date.now());
      await this.repo.incStat('query_latency_sum', ms, Date.now());
      await this.repo.incStat('query_latency_count', 1, Date.now());
      await this.repo.incStat(this.latencyBucket(ms), 1, Date.now());
      return out;
    } finally {
      this.activeQueries--;
    }
  }

  async reinforce(id: string, boost = 0.1): Promise<ReinforceResult> {
    const m = (await this.repo.getMemory(id)) as MemoryRow | null;
    if (!m) return { nf: true };
    const now = Date.now();
    const newSal = Math.min(1, (m.salience || 0) + boost);
    await this.repo.updateSeen(id, now, newSal);
    const nbrs = await this.repo.listWaypointsFrom(id, 100);
    for (const w of nbrs) {
      const nm = (await this.repo.getMemory(w.dst_id)) as MemoryRow | null;
      if (!nm) continue;
      const delta = boost * Math.max(0, Math.min(1, w.weight));
      const ns = Math.min(1, (nm.salience || 0) + delta);
      await this.repo.updateSeen(w.dst_id, now, ns);
    }
    await this.repo.incStat('reinforce', 1, now);
    return { ok: true };
  }

  async patch(
    id: string,
    body: {
      content?: string;
      tags?: string[];
      metadata?: unknown;
      user_id?: string;
    },
  ): Promise<PatchResult> {
    const m = (await this.repo.getMemory(id)) as MemoryRow | null;
    if (!m) return { nf: true };
    if (body.user_id && m.user_id !== body.user_id) return { forbidden: true };

    const newContent = body.content ?? m.content;
    const newTags = body.tags ?? (JSON.parse(m.tags || '[]') as string[]);
    const newMeta =
      body.metadata ?? (JSON.parse(m.meta || '{}') as Record<string, unknown>);

    const built = this.buildContentAndCompressed(newContent);
    await this.repo.updateMemoryWithCompression(
      id,
      built.content,
      JSON.stringify(newTags),
      JSON.stringify(newMeta),
      built.compressed_vec,
    );
    await this.updateBm25OnPatch(id, m.content, built.content);

    if (body.content !== undefined && body.content !== m.content) {
      const cls = this.emb.classify(newContent, newMeta);
      await this.repo.deleteVectors(id);
      const vecMap = await this.emb.embedForSectors(
        newContent,
        cls.sectors as Sector[],
      );
      for (const s of cls.sectors) {
        const vecS = vecMap[s as Sector];
        await this.repo.insertVector(
          id,
          s as Sector,
          m.user_id || null,
          vecS,
          this.emb.dim,
        );
      }
      const vec0 = await this.emb.embedAsync(newContent);
      await this.repo.updateMean(id, this.emb.dim, vec0);
      await this.repo.deleteWaypoints(id, id);
      const segs = this.activeSegments.length
        ? this.activeSegments
        : [m.segment || 0];
      const cands = await this.repo.listMeanVectorsInSegments(segs, 200);
      let best: { id: string; sim: number } | null = null;
      for (const c of cands) {
        if (!c.mean_vec || c.id === id) continue;
        const mv = this.getMeanVectorCached(c.id, c.mean_vec);
        const sim = this.emb.cosine(vec0, mv);
        if (!best || sim > best.sim) best = { id: c.id, sim };
      }
      if (best && best.sim >= 0.75) {
        await this.repo.insertWaypoint(
          id,
          best.id,
          m.user_id || null,
          best.sim,
          Date.now(),
          Date.now(),
        );
      } else {
        await this.repo.insertWaypoint(
          id,
          id,
          m.user_id || null,
          1.0,
          Date.now(),
          Date.now(),
        );
      }
    }
    return { id, updated: true };
  }

  async listAll(
    limit = 100,
    offset = 0,
    sector?: Sector,
    user_id?: string,
  ): Promise<MemoryItem[]> {
    let r: MemoryRow[];
    if (user_id)
      r = (await this.repo.listByUser(user_id, limit, offset)) as MemoryRow[];
    else if (sector)
      r = (await this.repo.listBySector(sector, limit, offset)) as MemoryRow[];
    else r = (await this.repo.listAll(limit, offset)) as MemoryRow[];

    return r.map((x: MemoryRow) => ({
      id: x.id,
      content: x.content,
      tags: JSON.parse(x.tags || '[]') as string[],
      metadata: JSON.parse(x.meta || '{}') as Record<string, unknown>,
      created_at: x.created_at,
      updated_at: x.updated_at,
      last_seen_at: x.last_seen_at,
      salience: x.salience,
      decay_lambda: x.decay_lambda,
      primary_sector: x.primary_sector,
      version: x.version,
      user_id: x.user_id,
    }));
  }

  async getById(
    id: string,
    user_id?: string,
  ): Promise<MemoryDetails | { forbidden: true } | null> {
    const m = (await this.repo.getMemory(id)) as MemoryRow | null;
    if (!m) return null;
    if (user_id && m.user_id !== user_id) return { forbidden: true };
    const v = (await this.repo.getVectorsById(id)) as VectorRow[];
    const sec: Sector[] = v.map((x) => x.sector);
    await this.linkSession(user_id, m.id);
    await this.logEvent(user_id, m.id, 'view');
    return {
      id: m.id,
      content: m.content,
      primary_sector: m.primary_sector,
      sectors: sec,
      tags: JSON.parse(m.tags || '[]') as string[],
      metadata: JSON.parse(m.meta || '{}') as Record<string, unknown>,
      created_at: m.created_at,
      updated_at: m.updated_at,
      last_seen_at: m.last_seen_at,
      salience: m.salience,
      decay_lambda: m.decay_lambda,
      version: m.version,
      user_id: m.user_id,
    };
  }

  async deleteById(
    id: string,
    user_id?: string,
  ): Promise<{ ok: true } | { nf: true } | { forbidden: true }> {
    const m = (await this.repo.getMemory(id)) as MemoryRow | null;
    if (!m) return { nf: true };
    if (user_id && m.user_id !== user_id) return { forbidden: true };
    await this.repo.deleteMemory(id);
    await this.repo.deleteVectors(id);
    await this.repo.deleteWaypoints(id, id);
    return { ok: true };
  }

  async ingest(data: IngestArgs): Promise<AddResult> {
    const ct = (data.content_type || 'text/plain').toLowerCase();
    let txt = '';
    if (ct.includes('pdf')) {
      const mod = await import('pdf-parse');
      type PdfParseResult = { text?: string };
      const parser = (
        mod as unknown as { default: (data: Buffer) => Promise<PdfParseResult> }
      ).default;
      const buf = Buffer.isBuffer(data.data)
        ? data.data
        : Buffer.from(String(data.data));
      const r = await parser(buf);
      txt = String(r.text || '');
    } else if (ct.includes('docx')) {
      const mod = await import('mammoth');
      type MammothResult = { value?: string };
      const mammothMod = mod as unknown as {
        extractRawText: (input: { buffer: Buffer }) => Promise<MammothResult>;
      };
      const buf = Buffer.isBuffer(data.data)
        ? data.data
        : Buffer.from(String(data.data));
      const r = await mammothMod.extractRawText({ buffer: buf });
      txt = String(r.value || '');
    } else if (ct.includes('html')) {
      const src = Buffer.isBuffer(data.data)
        ? data.data.toString('utf-8')
        : String(data.data);
      const cleaned = src
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ');
      txt = cleaned;
    } else {
      txt = Buffer.isBuffer(data.data)
        ? data.data.toString('utf-8')
        : String(data.data);
    }
    return this.add(
      txt,
      [],
      data.metadata as Record<string, unknown> | undefined,
      data.user_id,
    );
  }

  async ingestUrl(
    data: IngestUrlArgs,
  ): Promise<AddResult | { error: 'fetch_failed' }> {
    try {
      const res = await fetch(data.url);
      const ct = (
        res.headers.get('content-type') || 'text/plain'
      ).toLowerCase();
      if (ct.includes('text') || ct.includes('html')) {
        const text = await res.text();
        return this.ingest({
          content_type: ct,
          data: text,
          metadata: data.metadata,
          config: data.config,
          user_id: data.user_id,
        });
      } else {
        const ab = await res.arrayBuffer();
        const buf = Buffer.from(ab);
        return this.ingest({
          content_type: ct,
          data: buf,
          metadata: data.metadata,
          config: data.config,
          user_id: data.user_id,
        });
      }
    } catch {
      return { error: 'fetch_failed' };
    }
  }
}
