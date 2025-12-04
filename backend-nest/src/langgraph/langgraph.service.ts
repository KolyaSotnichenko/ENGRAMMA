// d:\Projects\openmemory\backend-nest\src\langgraph\langgraph.service.ts
import { Injectable } from '@nestjs/common';
import { MemoryService } from '../memory/memory.service';
import { MemoryRepository } from '../memory/memory.repository';
import { SqliteService } from '../sqlite/sqlite.service';
import { Sector } from '../shared/types';

const nodeSector: Record<string, Sector> = {
  observe: 'episodic',
  plan: 'semantic',
  reflect: 'reflective',
  act: 'procedural',
  emotion: 'emotional',
};
const defaultSector: Sector = 'semantic';

interface StoredMem {
  id: string;
  node: string;
  primary_sector: Sector;
  sectors: Sector[];
  namespace: string;
  graph_id: string | null;
  tags: string[];
  chunks: number;
  metadata: Record<string, unknown>;
}

interface HydratedMem {
  id: string;
  node: string;
  content: string;
  primary_sector: Sector;
  sectors: Sector[];
  tags: string[];
  created_at: number;
  updated_at: number;
  last_seen_at: number;
  salience: number;
  decay_lambda: number;
  version: number;
  score?: number;
  path?: string[];
  metadata?: Record<string, unknown>;
}

@Injectable()
export class LanggraphService {
  constructor(
    private memSvc: MemoryService,
    private repo: MemoryRepository,
    private db: SqliteService,
  ) {}

  private resolveSector(node: string): Sector {
    return nodeSector[node.toLowerCase()] ?? defaultSector;
  }
  private resolveNs(ns?: string) {
    return ns || 'default';
  }
  private buildTags(
    tags: string[] | undefined,
    node: string,
    ns: string,
    gid?: string,
  ) {
    const ts = new Set<string>(tags || []);
    ts.add(`lgm:node:${node.toLowerCase()}`);
    ts.add(`lgm:namespace:${ns}`);
    if (gid) ts.add(`lgm:graph:${gid}`);
    return Array.from(ts);
  }
  private buildMeta(
    p: { node: string; metadata?: Record<string, unknown>; graph_id?: string },
    sec: Sector,
    ns: string,
    ext?: Record<string, unknown>,
  ): Record<string, unknown> {
    const base: Record<string, unknown> = { ...(p.metadata || {}) };
    const prevLgm =
      typeof base['lgm'] === 'object' && base['lgm'] !== null
        ? (base['lgm'] as Record<string, unknown>)
        : {};
    base['lgm'] = {
      ...prevLgm,
      node: p.node.toLowerCase(),
      sector: sec,
      namespace: ns,
      graph_id: p.graph_id ?? null,
      stored_at: Date.now(),
      mode: 'langgraph',
      ...(ext || {}),
    };
    return base;
  }
  private matchesNs(meta: Record<string, unknown>, ns: string, gid?: string) {
    const lgm = meta['lgm'] as
      | { namespace?: string; graph_id?: string | null }
      | undefined;
    if (!lgm) return false;
    if (lgm.namespace !== ns) return false;
    if (gid && lgm.graph_id !== gid) return false;
    return true;
  }
  private trunc(txt: string, max = 320) {
    return txt.length <= max ? txt : `${txt.slice(0, max).trimEnd()}...`;
  }

  async store(p: {
    node: string;
    content: string;
    namespace?: string;
    graph_id?: string;
    tags?: string[];
    metadata?: Record<string, unknown>;
    reflective?: boolean;
  }): Promise<{ memory: StoredMem; reflection: StoredMem | null }> {
    if (!p?.node || !p?.content)
      throw new Error('node and content are required');
    const ns = this.resolveNs(p.namespace);
    const node = p.node.toLowerCase();
    const sec = this.resolveSector(node);
    const tag_list = this.buildTags(p.tags, node, ns, p.graph_id);
    const meta = this.buildMeta(p, sec, ns);
    const res = await this.memSvc.add(p.content, tag_list, meta);
    const stored = {
      id: res.id,
      node,
      primary_sector: res.primary_sector,
      sectors: res.sectors,
      namespace: ns,
      graph_id: p.graph_id ?? null,
      tags: tag_list,
      chunks: 1,
      metadata: meta,
    };
    const refl_set = p.reflective ?? true;
    const refl =
      refl_set && node !== 'reflect'
        ? await this.createAutoReflection(p, stored)
        : null;
    return { memory: stored, reflection: refl };
  }

  private async createAutoReflection(
    p: { node: string; content: string; namespace?: string; graph_id?: string },
    stored: { id: string; namespace: string; graph_id: string | null },
  ): Promise<StoredMem> {
    const tags = this.buildTags(
      [`lgm:auto:reflection`, `lgm:source:${stored.id}`],
      'reflect',
      stored.namespace,
      stored.graph_id ?? undefined,
    );
    const meta = {
      lgm: {
        node: 'reflect',
        sector: 'reflective',
        namespace: stored.namespace,
        graph_id: stored.graph_id,
        stored_at: Date.now(),
        mode: 'langgraph',
        source_memory: stored.id,
        source_node: p.node.toLowerCase(),
      },
    };
    const res = await this.memSvc.add(
      this.buildReflContent(p, stored.namespace),
      tags,
      meta,
    );
    return {
      id: res.id,
      node: 'reflect',
      primary_sector: res.primary_sector,
      sectors: res.sectors,
      namespace: stored.namespace,
      graph_id: stored.graph_id,
      tags,
      chunks: 1,
      metadata: meta,
    };
  }

  private buildReflContent(p: { node: string; content: string }, ns: string) {
    const parts = [
      `LangGraph reflection for node "${p.node}"`,
      `namespace=${ns}`,
    ];
    return `${parts.join(' | ')}\n\n${this.trunc(p.content, 480)}`;
  }

  async retrieve(p: {
    node: string;
    namespace?: string;
    graph_id?: string;
    limit?: number;
    include_metadata?: boolean;
    query?: string;
  }): Promise<{
    node: string;
    sector: Sector;
    namespace: string;
    graph_id: string | null;
    query: string | null;
    count: number;
    items: HydratedMem[];
  }> {
    const ns = this.resolveNs(p.namespace);
    const node = p.node.toLowerCase();
    const sec = this.resolveSector(node);
    const lim = p.limit || 16;
    const inc_meta = p.include_metadata ?? false;
    const gid = p.graph_id;
    const items: HydratedMem[] = [];
    if (p.query) {
      const matches = await this.memSvc.query(p.query, Math.max(lim * 2, lim), {
        sector: sec,
      });
      for (const match of matches) {
        const row = await this.repo.getMemory(match.id);
        if (!row) continue;
        const meta = JSON.parse(row.meta || '{}') as Record<string, unknown>;
        if (!this.matchesNs(meta, ns, gid)) continue;
        const vecs = await this.repo.getVectorsById(row.id);
        const secs = vecs.map((v) => v.sector);
        const lgm = meta['lgm'] as { node?: string } | undefined;
        const hyd: HydratedMem = {
          id: row.id,
          node: lgm?.node || row.primary_sector,
          content: row.content,
          primary_sector: row.primary_sector,
          sectors: secs,
          tags: JSON.parse(row.tags || '[]') as string[],
          created_at: row.created_at,
          updated_at: row.updated_at,
          last_seen_at: row.last_seen_at,
          salience: row.salience,
          decay_lambda: row.decay_lambda,
          version: row.version,
        };
        hyd.score = match.score;
        hyd.path = match.path;
        if (inc_meta) hyd.metadata = meta;
        items.push(hyd);
        if (items.length >= lim) break;
      }
    } else {
      const raw = await this.repo.listBySector(sec, lim * 4, 0);
      for (const row of raw) {
        const meta = JSON.parse(row.meta || '{}') as Record<string, unknown>;
        if (!this.matchesNs(meta, ns, gid)) continue;
        const vecs = await this.repo.getVectorsById(row.id);
        const secs = vecs.map((v) => v.sector);
        const lgm = meta['lgm'] as { node?: string } | undefined;
        const hyd: HydratedMem = {
          id: row.id,
          node: lgm?.node || row.primary_sector,
          content: row.content,
          primary_sector: row.primary_sector,
          sectors: secs,
          tags: JSON.parse(row.tags || '[]') as string[],
          created_at: row.created_at,
          updated_at: row.updated_at,
          last_seen_at: row.last_seen_at,
          salience: row.salience,
          decay_lambda: row.decay_lambda,
          version: row.version,
        };
        if (inc_meta) hyd.metadata = meta;
        items.push(hyd);
        if (items.length >= lim) break;
      }
      items.sort((a, b) => b.last_seen_at - a.last_seen_at);
    }
    return {
      node,
      sector: sec,
      namespace: ns,
      graph_id: gid ?? null,
      query: p.query || null,
      count: items.length,
      items,
    };
  }

  async context(p: { namespace?: string; graph_id?: string; limit?: number }) {
    const ns = this.resolveNs(p.namespace);
    const gid = p.graph_id;
    const lim = p.limit || 16;
    const nodes = Object.keys(nodeSector);
    const per = Math.max(1, Math.floor(lim / nodes.length) || 1);
    const node_ctxs: Array<{
      node: string;
      sector: Sector;
      items: HydratedMem[];
    }> = [];
    for (const node of nodes) {
      const res = await this.retrieve({
        node,
        namespace: ns,
        graph_id: gid,
        limit: per,
        include_metadata: true,
      });
      node_ctxs.push({ node, sector: res.sector, items: res.items });
    }
    const flat = node_ctxs.flatMap((e) =>
      e.items.map((i) => ({
        node: e.node,
        content: this.trunc(i.content, 160),
      })),
    );
    const summ = flat.length
      ? flat
          .slice(0, lim)
          .map((ln, idx) => `${idx + 1}. [${ln.node}] ${ln.content}`)
          .join('\n')
      : '';
    return {
      namespace: ns,
      graph_id: gid ?? null,
      limit: lim,
      nodes: node_ctxs,
      summary: summ,
    };
  }

  async reflection(p: {
    node?: string;
    content?: string;
    namespace?: string;
    graph_id?: string;
    context_ids?: string[];
  }): Promise<{ memory: StoredMem; reflection: StoredMem | null }> {
    const ns = this.resolveNs(p.namespace);
    const node = (p.node || 'reflect').toLowerCase();
    const base = p.content || (await this.buildCtxReflection(ns, p.graph_id));
    if (!base) throw new Error('reflection content could not be derived');
    const tags = [
      `lgm:manual:reflection`,
      ...(p.context_ids?.map((id) => `lgm:context:${id}`) || []),
    ];
    const meta: Record<string, unknown> = {
      lgm_context_ids: p.context_ids || [],
    };
    const res = await this.store({
      node,
      content: base,
      namespace: ns,
      graph_id: p.graph_id,
      tags,
      metadata: meta,
      reflective: false,
    });
    return res;
  }

  private async buildCtxReflection(
    ns: string,
    gid?: string,
  ): Promise<string | null> {
    const ctx = await this.context({ namespace: ns, graph_id: gid, limit: 16 });
    const lns = ctx.nodes.flatMap((e) =>
      e.items.map((i) => ({
        node: e.node,
        content: this.trunc(i.content, 160),
      })),
    );
    if (!lns.length) return null;
    const hdr = `Reflection synthesized from LangGraph context (namespace=${ns}${gid ? `, graph=${gid}` : ''})`;
    const body = lns
      .slice(0, 16)
      .map((ln, idx) => `${idx + 1}. [${ln.node}] ${ln.content}`)
      .join('\n');
    return `${hdr}\n\n${body}`;
  }

  cfg() {
    return {
      mode: 'langgraph',
      namespace_default: 'default',
      max_context: 16,
      reflective: true,
      node_sector_map: nodeSector,
    };
  }
}
