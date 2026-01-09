import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Sector, Metadata } from '../shared/types';
import { existsSync, readFileSync } from 'fs';
import { MemoryRepository } from './memory.repository';
import { randomUUID } from 'crypto';

@Injectable()
export class EmbeddingService {
  readonly dim: number;
  private readonly logger = new Logger(EmbeddingService.name);
  private provider!: string;
  private mode!: string;
  private advParallel!: boolean;
  private delayMs!: number;
  private openaiBase!: string;
  private openaiModel!: string;
  private apiKey!: string;
  private sectorModels: Partial<Record<Sector, string>> = {};
  constructor(
    private cfg: ConfigService,
    private repo: MemoryRepository,
  ) {
    this.dim = parseInt(this.cfg.get<string>('ENGRAMMA_VEC_DIM') || '256', 10);
    this.provider = (
      this.cfg.get<string>('ENGRAMMA_EMBEDDINGS') || 'synthetic'
    ).toLowerCase();
    this.mode = (
      this.cfg.get<string>('ENGRAMMA_EMBED_MODE') || 'simple'
    ).toLowerCase();
    this.advParallel =
      (this.cfg.get<string>('ENGRAMMA_ADV_EMBED_PARALLEL') || 'false') ===
      'true';
    this.delayMs = parseInt(
      this.cfg.get<string>('ENGRAMMA_EMBED_DELAY_MS') || '0',
      10,
    );
    this.openaiBase = this.cfg.get<string>('ENGRAMMA_OPENAI_BASE_URL') || '';
    this.openaiModel = this.cfg.get<string>('ENGRAMMA_OPENAI_MODEL') || '';
    this.apiKey = this.cfg.get<string>('OPENAI_API_KEY') || '';
    const sm = this.cfg.get<string>('ENGRAMMA_OPENAI_SECTOR_MODELS') || '';
    if (sm) {
      try {
        this.sectorModels = JSON.parse(sm) as Partial<Record<Sector, string>>;
      } catch {
        this.logger.warn('Failed to parse ENGRAMMA_OPENAI_SECTOR_MODELS JSON');
      }
    }
    const smFile =
      this.cfg.get<string>('ENGRAMMA_OPENAI_SECTOR_MODELS_FILE') || '';
    if (smFile && existsSync(smFile)) {
      try {
        const data = readFileSync(smFile, 'utf-8');
        if (smFile.endsWith('.yaml') || smFile.endsWith('.yml')) {
          const conf = this.parseSectorModelsConf(data);
          if (conf.defaultModel) this.openaiModel = conf.defaultModel;
          if (conf.models && Object.keys(conf.models).length)
            this.sectorModels = conf.models;
        } else {
          const obj = JSON.parse(data) as Record<string, unknown>;
          if (obj && typeof obj === 'object') {
            const sec = obj['sectors'] as Record<string, string> | undefined;
            const def = obj['default_model'] as string | undefined;
            if (def) this.openaiModel = def;
            this.sectorModels = (sec ||
              (obj as unknown as Partial<Record<Sector, string>>)) as Partial<
              Record<Sector, string>
            >;
          }
        }
      } catch {
        this.logger.warn('Failed to load sector models from file');
      }
    }
  }
  private parseSectorModelsConf(txt: string): {
    models: Partial<Record<Sector, string>>;
    defaultModel?: string;
  } {
    const models: Partial<Record<Sector, string>> = {};
    let def: string | undefined;
    let inSectors = false;
    for (const ln of txt.split(/\r?\n/)) {
      const raw = ln.replace(/#.*$/, '');
      const s = raw.trim();
      if (!s) continue;
      if (/^sectors\s*:\s*$/.test(s)) {
        inSectors = true;
        continue;
      }
      const mTop = s.match(/^([A-Za-z_]+)\s*:\s*(.+)$/);
      if (mTop) {
        const k = mTop[1].trim();
        const v = mTop[2].trim();
        if (k === 'default_model') def = v;
        else if (!inSectors) models[k as Sector] = v;
        else models[k as Sector] = v;
        continue;
      }
    }
    return { models, defaultModel: def };
  }
  private async logEmbed(
    model: string,
    status: string,
    details?: {
      err?: string;
      op?: string;
      provider?: string;
      duration_ms?: number;
      input_len?: number;
      output_dim?: number;
      status_code?: number;
      memory_id?: string;
    },
  ) {
    const id = randomUUID();
    const ts = Date.now();
    try {
      await this.repo.insertEmbedLog(
        id,
        model,
        status,
        ts,
        details?.err,
        details,
      );
    } catch {
      this.logger.error(
        `Failed to log embed log id=${id} model=${model} status=${status} err=${details?.err}`,
      );
    }
  }
  embed(text: string): number[] {
    const t0 = Date.now();
    const v = new Array<number>(this.dim).fill(0);
    const tokens = text
      .normalize('NFKC')
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter(Boolean);
    for (const t of tokens) {
      let h = 0;
      for (let i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) | 0;
      const idx = Math.abs(h) % this.dim;
      v[idx] += 1;
    }
    const norm =
      Math.sqrt(v.reduce((s: number, x: number) => s + x * x, 0)) || 1;
    const nz = v.reduce((c: number, x: number) => c + (x > 0 ? 1 : 0), 0);
    this.logger.log(
      `embed dim=${this.dim} tokens=${tokens.length} nz=${nz} time=${Date.now() - t0}ms`,
    );
    return v.map((x) => x / norm);
  }
  embedForSector(text: string, sector: Sector): number[] {
    const salt: Record<Sector, number> = {
      episodic: 11,
      semantic: 23,
      procedural: 37,
      emotional: 41,
      reflective: 53,
    };
    const v = new Array<number>(this.dim).fill(0);
    const tokens = text
      .normalize('NFKC')
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter(Boolean);
    for (const t of tokens) {
      let h = 0;
      for (let i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) | 0;
      const idx = Math.abs((h + salt[sector]) % this.dim);
      v[idx] += 1;
    }
    const norm =
      Math.sqrt(v.reduce((s: number, x: number) => s + x * x, 0)) || 1;
    return v.map((x) => x / norm);
  }
  async embedAsync(text: string): Promise<number[]> {
    if (this.provider === 'openai' && this.openaiBase && this.openaiModel) {
      const v = await this.openaiEmbed(text);
      return this.normalizeDim(v);
    }
    return Promise.resolve(this.embed(text));
  }
  async embedForSectorAsync(text: string, sector: Sector): Promise<number[]> {
    if (this.provider === 'openai' && this.openaiBase && this.openaiModel) {
      const prefix = `[${sector}] `;
      const v = await this.openaiEmbed(
        prefix + text,
        this.modelForSector(sector),
      );
      return this.normalizeDim(v);
    }
    return Promise.resolve(this.embedForSector(text, sector));
  }
  private normalizeDim(vec: number[]): number[] {
    if (vec.length === this.dim) return vec;
    if (vec.length > this.dim) return vec.slice(0, this.dim);
    const out = vec.slice();
    while (out.length < this.dim) out.push(0);
    return out;
  }
  private modelForSector(sector: Sector): string {
    return this.sectorModels[sector] || this.openaiModel;
  }
  private queueTail: Promise<void> = Promise.resolve();
  private async throttle(): Promise<void> {
    if (
      this.provider !== 'openai' ||
      this.mode !== 'advanced' ||
      this.advParallel ||
      this.delayMs <= 0
    )
      return;
    const prev = this.queueTail;
    this.queueTail = prev.then(
      () => new Promise((r) => setTimeout(r, this.delayMs)),
    );
    await prev;
  }
  private async sleep(ms: number): Promise<void> {
    await new Promise((r) => setTimeout(r, ms));
  }
  private async openaiEmbed(text: string, model?: string): Promise<number[]> {
    const t0 = Date.now();
    const mdl = model || this.openaiModel;
    for (let attempt = 0; attempt < 3; attempt++) {
      await this.throttle();
      const res = await fetch(`${this.openaiBase}/embeddings`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(this.apiKey ? { authorization: `Bearer ${this.apiKey}` } : {}),
        },
        body: JSON.stringify({ model: mdl, input: text }),
      });
      if (res.ok) {
        const json = (await res.json()) as { data?: { embedding: number[] }[] };
        const emb = json?.data?.[0]?.embedding || [];
        const dur = Date.now() - t0;
        this.logger.log(`openai embed len=${emb.length} time=${dur}ms`);
        await this.logEmbed(mdl, 'completed', {
          op: 'openai_embed',
          provider: 'openai',
          duration_ms: dur,
          input_len: text.length,
          output_dim: emb.length,
          status_code: res.status,
        });
        return emb;
      }
      const msg = await res.text();
      this.logger.warn(
        `openai embed failed status=${res.status} attempt=${attempt + 1} msg=${msg}`,
      );
      if (res.status === 429 || res.status >= 500)
        await this.sleep(250 * Math.pow(2, attempt));
      else break;
    }
    await this.logEmbed(mdl, 'failed', {
      op: 'openai_embed',
      provider: 'openai',
      status_code: 0,
      err: 'failed',
    });
    return this.embed(text);
  }
  async embedForSectors(
    text: string,
    sectors: Sector[],
  ): Promise<Record<Sector, number[]>> {
    if (
      this.provider === 'openai' &&
      this.openaiBase &&
      this.openaiModel &&
      this.mode === 'simple'
    ) {
      const out: Partial<Record<Sector, number[]>> = {};
      const groups = new Map<string, Sector[]>();
      for (const s of sectors) {
        const m = this.modelForSector(s);
        const arr = groups.get(m) || [];
        arr.push(s);
        groups.set(m, arr);
      }
      for (const [m, ss] of groups) {
        const inputs = ss.map((s) => `[${s}] ` + text);
        const embs = await this.openaiEmbedBatch(inputs, m);
        for (let i = 0; i < ss.length; i++) {
          const v = this.normalizeDim(embs[i] || []);
          out[ss[i]] = v.length ? v : this.embedForSector(text, ss[i]);
        }
      }
      return out as Record<Sector, number[]>;
    }
    const pairs = await Promise.all(
      sectors.map(
        async (s) =>
          [s, await this.embedForSectorAsync(text, s)] as [Sector, number[]],
      ),
    );
    return Object.fromEntries(pairs) as Record<Sector, number[]>;
  }
  private async openaiEmbedBatch(
    inputs: string[],
    model?: string,
  ): Promise<number[][]> {
    const t0 = Date.now();
    const mdl = model || this.openaiModel;
    for (let attempt = 0; attempt < 3; attempt++) {
      await this.throttle();
      const res = await fetch(`${this.openaiBase}/embeddings`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(this.apiKey ? { authorization: `Bearer ${this.apiKey}` } : {}),
        },
        body: JSON.stringify({ model: mdl, input: inputs }),
      });
      if (res.ok) {
        const json = (await res.json()) as { data?: { embedding: number[] }[] };
        const embs = (json?.data || []).map((d) => d.embedding || []);
        const dur = Date.now() - t0;
        this.logger.log(`openai batch count=${embs.length} time=${dur}ms`);
        await this.logEmbed(mdl, 'completed', {
          op: 'openai_embed_batch',
          provider: 'openai',
          duration_ms: dur,
          input_len: inputs.reduce((s, t) => s + t.length, 0),
          output_dim: embs[0]?.length || 0,
          status_code: res.status,
        });
        return embs;
      }
      const msg = await res.text();
      this.logger.warn(
        `openai embed batch failed status=${res.status} attempt=${attempt + 1} msg=${msg}`,
      );
      if (res.status === 429 || res.status >= 500)
        await this.sleep(250 * Math.pow(2, attempt));
      else break;
    }
    await this.logEmbed(mdl, 'failed', {
      op: 'openai_embed_batch',
      provider: 'openai',
      status_code: 0,
      err: 'failed',
    });
    return inputs.map((t) => this.embed(t));
  }
  bufferToVector(buf: Buffer): number[] {
    const f = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
    return Array.from(f);
  }
  cosine(a: number[], b: number[]): number {
    let dot = 0,
      na = 0,
      nb = 0;
    for (let i = 0; i < a.length && i < b.length; i++) {
      dot += a[i] * b[i];
      na += a[i] * a[i];
      nb += b[i] * b[i];
    }
    const d = Math.sqrt(na) * Math.sqrt(nb);
    return d ? dot / d : 0;
  }
  classify(
    content: string,
    metadata?: Metadata,
  ): { primary_sector: Sector; sectors: Sector[] } {
    if (
      metadata &&
      typeof metadata === 'object' &&
      'sector' in metadata &&
      [
        'episodic',
        'semantic',
        'procedural',
        'emotional',
        'reflective',
      ].includes(metadata.sector as Sector)
    ) {
      this.logger.log(`classify override sector=${metadata.sector}`);
      return {
        primary_sector: metadata.sector!,
        sectors: [metadata.sector!],
      };
    }
    const patterns: Record<Sector, RegExp[]> = {
      episodic: [
        /\b(today|yesterday|last\s+week|remember\s+when|that\s+time)\b/i,
        /\b(I\s+(did|went|saw|met|felt))\b/i,
        /\b(at\s+\d+:\d+|on\s+\w+day|in\s+\d{4})\b/i,
        /\b(happened|occurred|experience|event|moment)\b/i,
      ],
      semantic: [
        /\b(define|definition|meaning|concept|theory)\b/i,
        /\b(what\s+is|how\s+does|why\s+do|facts?\s+about)\b/i,
        /\b(principle|rule|law|algorithm|method)\b/i,
        /\b(knowledge|information|data|research|study)\b/i,
      ],
      procedural: [
        /\b(how\s+to|step\s+by\s+step|procedure|process)\b/i,
        /\b(first|then|next|finally|afterwards)\b/i,
        /\b(install|configure|setup|run|execute)\b/i,
        /\b(tutorial|guide|instructions|manual)\b/i,
        /\b(click|press|type|enter|select)\b/i,
      ],
      emotional: [
        /\b(feel|feeling|felt|emotion|mood)\b/i,
        /\b(happy|sad|angry|excited|worried|anxious|calm)\b/i,
        /\b(love|hate|like|dislike|enjoy|fear)\b/i,
        /\b(amazing|terrible|wonderful|awful|fantastic|horrible)\b/i,
        /[!]{2,}|[?!]{2,}/,
      ],
      reflective: [
        /\b(think|thinking|thought|reflect|reflection)\b/i,
        /\b(realize|understand|insight|conclusion|lesson)\b/i,
        /\b(why|purpose|meaning|significance|impact)\b/i,
        /\b(philosophy|wisdom|belief|value|principle)\b/i,
        /\b(should\s+have|could\s+have|if\s+only|what\s+if)\b/i,
      ],
    };
    const scores: Record<Sector, number> = {
      episodic: 0,
      semantic: 0,
      procedural: 0,
      emotional: 0,
      reflective: 0,
    };
    for (const [sec, pats] of Object.entries(patterns) as [
      Sector,
      RegExp[],
    ][]) {
      let s = 0;
      for (const p of pats) {
        const m = content.match(p);
        if (m) s += m.length;
      }
      scores[sec] = s;
    }
    const total = Object.values(scores).reduce((sum, x) => sum + x, 0);
    let primary: Sector = 'semantic';
    let additional: Sector[] = [];
    if (total > 0) {
      const sorted = Object.entries(scores).sort(([, a], [, b]) => b - a) as [
        Sector,
        number,
      ][];
      primary = sorted[0][0];
      const topScore = sorted[0][1];
      const threshold = Math.max(1, topScore * 0.3);
      additional = sorted
        .slice(1)
        .filter(([, s]) => s > 0 && s >= threshold)
        .map(([sec]) => sec);
    }
    const sectors = [primary, ...additional];
    this.logger.log(
      `classify scores=${JSON.stringify(scores)} best=${primary} add=${additional.join(',')}`,
    );
    return { primary_sector: primary, sectors };
  }
}
