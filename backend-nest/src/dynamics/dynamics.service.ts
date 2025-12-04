import { Injectable } from '@nestjs/common';
import { SqliteService } from '../sqlite/sqlite.service';
import { EmbeddingService } from '../memory/embedding.service';
import { MemoryRepository } from '../memory/memory.repository';
import { Sector } from '../shared/types';

const ALPHA = 0.15;
const BETA = 0.2;
const GAMMA = 0.35;
const THETA = 0.4;
const ETA = 0.18;
const LAMBDA_ONE = 0.015;
const LAMBDA_TWO = 0.002;
const TAU = 0.4;

type EnergyItem = {
  id: string;
  content: string;
  primary_sector: Sector;
  salience: number;
  activation_energy: number;
};

const M = [
  [1.0, 0.7, 0.3, 0.6, 0.6],
  [0.7, 1.0, 0.4, 0.7, 0.8],
  [0.3, 0.4, 1.0, 0.5, 0.2],
  [0.6, 0.7, 0.5, 1.0, 0.8],
  [0.6, 0.8, 0.2, 0.8, 1.0],
];
const IDX: Record<Sector, number> = {
  episodic: 0,
  semantic: 1,
  procedural: 2,
  emotional: 3,
  reflective: 4,
};

@Injectable()
export class DynamicsService {
  constructor(
    private db: SqliteService,
    private emb: EmbeddingService,
    private memRepo: MemoryRepository,
  ) {}

  getConstants() {
    return {
      alpha_learning_rate_for_recall_reinforcement_value: ALPHA,
      beta_learning_rate_for_emotional_frequency_value: BETA,
      gamma_attenuation_constant_for_graph_distance_value: GAMMA,
      theta_consolidation_coefficient_for_long_term_memory: THETA,
      eta_reinforcement_factor_for_trace_learning_value: ETA,
      lambda_one_fast_decay_rate_for_short_term: LAMBDA_ONE,
      lambda_two_slow_decay_rate_for_consolidation: LAMBDA_TWO,
      tau_energy_threshold_for_retrieval_cutoff: TAU,
      sectoral_interdependence_matrix_for_cross_sector_resonance: M,
    };
  }

  calcSalience(
    i: number,
    lambda: number,
    r: number,
    e: number,
    t_days: number,
  ): number {
    const d = i * Math.exp(-lambda * t_days);
    const rc = ALPHA * r;
    const ef = BETA * e;
    return Math.max(0, Math.min(1, d + rc + ef));
  }

  calcResonance(ms: Sector, qs: Sector, base: number): number {
    const si = IDX[ms] ?? 1;
    const ti = IDX[qs] ?? 1;
    return base * M[si][ti];
  }

  async energyRetrieval(
    query: string,
    sector: Sector,
    minEnergy?: number,
  ): Promise<EnergyItem[]> {
    const qv = this.emb.embed(query);
    const vecs = await this.memRepo.getVectorsBySector(sector);
    const scores = new Map<string, number>();
    for (const v of vecs) {
      const base = this.emb.cosine(qv, this.emb.bufferToVector(v.v));
      const m = await this.memRepo.getMemory(v.id);
      if (!m) continue;
      const res = this.calcResonance(m.primary_sector, sector, base);
      const energy = res * (m.salience || 0);
      scores.set(v.id, energy);
    }
    const total = Array.from(scores.values()).reduce((s, v) => s + v, 0);
    const tau = Math.max(
      0.1,
      Math.min(
        0.9,
        (minEnergy ?? TAU) * (1 + Math.log(Math.max(0.1, total) + 1)),
      ),
    );
    const items: EnergyItem[] = [];
    for (const [id, energy] of scores) {
      if (energy > tau) {
        const m = await this.memRepo.getMemory(id);
        if (m)
          items.push({
            id: m.id,
            content: m.content,
            primary_sector: m.primary_sector,
            salience: m.salience,
            activation_energy: energy,
          });
      }
    }
    return items;
  }

  async reinforceTrace(memory_id: string) {
    const m = await this.memRepo.getMemory(memory_id);
    if (!m) return { err: 'memory_not_found' };
    const nsal = Math.min(1, (m.salience || 0) + ETA * (1 - (m.salience || 0)));
    await this.memRepo.updateSeen(memory_id, Date.now(), nsal);
    const wps = await this.db.all<{ dst_id: string; weight: number }>(
      'select dst_id,weight from waypoints where src_id=?',
      [memory_id],
    );
    for (const wp of wps) {
      const row = await this.memRepo.getMemory(wp.dst_id);
      if (!row) continue;
      const pr = ETA * (wp.weight || 0) * nsal;
      const upd = Math.min(1, (row.salience || 0) + pr);
      await this.memRepo.updateSeen(wp.dst_id, Date.now(), upd);
    }
    return { ok: true };
  }

  async spreadingActivation(
    initial_ids: string[],
    max = 3,
  ): Promise<Array<{ memory_id: string; activation_level: number }>> {
    const edges = await this.db.all<{
      src_id: string;
      dst_id: string;
      weight: number;
      created_at: number;
    }>('select src_id,dst_id,weight,created_at from waypoints', []);
    const graph = new Map<
      string,
      Array<{ target: string; weight: number; gap: number }>
    >();
    const now = Date.now();
    for (const e of edges) {
      const arr = graph.get(e.src_id) || [];
      arr.push({
        target: e.dst_id,
        weight: e.weight,
        gap: Math.abs(now - e.created_at),
      });
      graph.set(e.src_id, arr);
    }
    const act = new Map<string, number>();
    for (const id of initial_ids) act.set(id, 1.0);
    const atten = (d: number) => Math.exp(-GAMMA * d);
    for (let i = 0; i < max; i++) {
      const ups = new Map<string, number>();
      for (const [nid, ca] of act) {
        const edges = graph.get(nid) || [];
        for (const e of edges) {
          const inc = e.weight * ca * atten(1);
          ups.set(e.target, (ups.get(e.target) || 0) + inc);
        }
      }
      for (const [uid, nav] of ups) {
        const cv = act.get(uid) || 0;
        act.set(uid, Math.max(cv, nav));
      }
    }
    return Array.from(act.entries())
      .map(([memory_id, activation_level]) => ({ memory_id, activation_level }))
      .sort((a, b) => b.activation_level - a.activation_level);
  }

  async waypointGraph(filters?: {
    user_id?: string;
    sector?: Sector;
    tag?: string;
  }) {
    const params: any[] = [];
    const base =
      'select w.src_id as src_id, w.dst_id as dst_id, w.weight as weight, w.created_at as created_at from waypoints w';
    let joins = '';
    let where = ' where 1=1';
    if (filters?.user_id || filters?.sector || filters?.tag) {
      joins =
        ' join memories ms on ms.id=w.src_id join memories md on md.id=w.dst_id';
      if (filters.user_id) {
        where += ' and ms.user_id=? and md.user_id=?';
        params.push(filters.user_id, filters.user_id);
      }
      if (filters.sector) {
        where += ' and ms.primary_sector=? and md.primary_sector=?';
        params.push(filters.sector, filters.sector);
      }
      if (filters.tag) {
        where += " and ifnull(ms.tags,'') like ? and ifnull(md.tags,'') like ?";
        const like = `%${filters.tag}%`;
        params.push(like, like);
      }
    }
    const edges = await this.db.all<{
      src_id: string;
      dst_id: string;
      weight: number;
      created_at: number;
    }>(base + joins + where, params);
    const nodes = new Map<
      string,
      Array<{ target: string; weight: number; gap: number }>
    >();
    const now = Date.now();
    for (const e of edges) {
      const arr = nodes.get(e.src_id) || [];
      arr.push({
        target: e.dst_id,
        weight: e.weight,
        gap: Math.abs(now - e.created_at),
      });
      nodes.set(e.src_id, arr);
      if (!nodes.has(e.dst_id)) nodes.set(e.dst_id, []);
    }
    const details = Array.from(nodes.entries()).map(([id, list]) => ({
      node_memory_id: id,
      outgoing_edges_count: list.length,
      connected_targets: list.map((x) => ({
        target_memory_id: x.target,
        link_weight: x.weight,
        time_gap_milliseconds: x.gap,
      })),
    }));
    const total_nodes = nodes.size;
    const total_edges = edges.length;
    const avg_edges = total_nodes > 0 ? total_edges / total_nodes : 0;
    const isolated = details.filter((d) => d.outgoing_edges_count === 0).length;
    return {
      graph_summary_statistics: {
        total_nodes_in_graph: total_nodes,
        total_edges_across_all_nodes: total_edges,
        average_edges_per_node: avg_edges,
        nodes_with_no_connections: isolated,
      },
      detailed_node_information: details,
    };
  }

  async calcWaypointWeight(src_id: string, dst_id: string) {
    const src = await this.memRepo.getMemory(src_id);
    const dst = await this.memRepo.getMemory(dst_id);
    if (!src || !dst) return { err: 'one_or_both_memories_not_found' };
    const sv = await this.memRepo.getVectorsById(src_id);
    const dv = await this.memRepo.getVectorsById(dst_id);
    const svbuf = sv[0]?.v;
    const dvbuf = dv[0]?.v;
    if (!svbuf || !dvbuf) return { err: 'memories_missing_embeddings' };
    const svec = this.emb.bufferToVector(svbuf);
    const dvec = this.emb.bufferToVector(dvbuf);
    const base = this.emb.cosine(svec, dvec);
    const gapMs = Math.abs(src.created_at - dst.created_at);
    const days = gapMs / 86400000;
    const weight = Math.max(0, base / (1 + days));
    return {
      source_memory_identifier: src_id,
      target_memory_identifier: dst_id,
      calculated_link_weight_value: weight,
      time_gap_in_days: days,
      calculation_details: {
        temporal_decay_factor_applied: true,
        cosine_similarity_computed: true,
      },
    };
  }

  async dualPhaseDecayAll(): Promise<{ ok: true; updated: number }> {
    const mems = await this.db.all<{
      id: string;
      salience: number;
      decay_lambda: number;
      last_seen_at: number | null;
      updated_at: number;
      created_at: number;
    }>(
      'select id,salience,decay_lambda,last_seen_at,updated_at,created_at from memories',
      [],
    );
    const now = Date.now();
    let updated = 0;
    for (const m of mems) {
      const tms = Math.max(0, now - (m.last_seen_at || m.updated_at));
      const td = tms / 86400000;
      const fast = Math.exp(-LAMBDA_ONE * td);
      const slow = THETA * Math.exp(-LAMBDA_TWO * td);
      const rt = Math.max(0, Math.min(1, fast + slow));
      const nsal = Math.max(0, m.salience * rt);
      await this.db.run(
        'update memories set salience=?,updated_at=? where id=?',
        [nsal, now, m.id],
      );
      updated++;
    }
    return { ok: true, updated };
  }
}
