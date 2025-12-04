import { Injectable } from '@nestjs/common';
import { SqliteService } from '../sqlite/sqlite.service';
import { Sector, MemoryRow, VectorRow } from '../shared/types';

@Injectable()
export class MemoryRepository {
  constructor(private db: SqliteService) {}

  insertMemory(m: {
    id: string;
    user_id: string | null;
    segment: number;
    content: string;
    simhash: string | null;
    primary_sector: string;
    tags: string | null;
    meta: string | null;
    created_at: number;
    updated_at: number;
    last_seen_at: number;
    salience: number;
    decay_lambda: number;
    version: number;
    mean_dim: number | null;
    mean_vec: Buffer | null;
    compressed_vec: Buffer | null;
    feedback_score: number;
  }) {
    return this.db.run(
      `insert into memories(id,user_id,segment,content,simhash,primary_sector,tags,meta,created_at,updated_at,last_seen_at,salience,decay_lambda,version,mean_dim,mean_vec,compressed_vec,feedback_score)
       values(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        m.id,
        m.user_id,
        m.segment,
        m.content,
        m.simhash,
        m.primary_sector,
        m.tags,
        m.meta,
        m.created_at,
        m.updated_at,
        m.last_seen_at,
        m.salience,
        m.decay_lambda,
        m.version,
        m.mean_dim,
        m.mean_vec,
        m.compressed_vec,
        m.feedback_score,
      ],
    );
  }

  updateMemory(id: string, content: string, tags: string, meta: string) {
    return this.db.run(
      `update memories set content=?, tags=?, meta=?, updated_at=? where id=?`,
      [content, tags, meta, Date.now(), id],
    );
  }

  updateMemoryWithCompression(
    id: string,
    content: string,
    tags: string,
    meta: string,
    compressed_vec: Buffer | null,
  ) {
    return this.db.run(
      `update memories set content=?, tags=?, meta=?, compressed_vec=?, updated_at=? where id=?`,
      [content, tags, meta, compressed_vec, Date.now(), id],
    );
  }

  updateSeen(id: string, last_seen_at: number, salience: number) {
    return this.db.run(
      `update memories set last_seen_at=?, salience=?, updated_at=? where id=?`,
      [last_seen_at, salience, Date.now(), id],
    );
  }

  updateSalience(id: string, salience: number) {
    return this.db.run(
      `update memories set salience=?, updated_at=? where id=?`,
      [salience, Date.now(), id],
    );
  }

  getMemory(id: string): Promise<MemoryRow | null> {
    return this.db.get<MemoryRow>(`select * from memories where id=?`, [id]);
  }

  listAll(limit: number, offset: number): Promise<MemoryRow[]> {
    return this.db.all<MemoryRow>(
      `select * from memories order by created_at desc limit ? offset ?`,
      [limit, offset],
    );
  }

  listByUser(
    user_id: string,
    limit: number,
    offset: number,
  ): Promise<MemoryRow[]> {
    return this.db.all<MemoryRow>(
      `select * from memories where user_id=? order by created_at desc limit ? offset ?`,
      [user_id, limit, offset],
    );
  }

  listBySector(
    sector: Sector,
    limit: number,
    offset: number,
  ): Promise<MemoryRow[]> {
    return this.db.all<MemoryRow>(
      `select * from memories where primary_sector=? order by created_at desc limit ? offset ?`,
      [sector, limit, offset],
    );
  }

  deleteMemory(id: string) {
    return this.db.run(`delete from memories where id=?`, [id]);
  }

  insertVector(
    id: string,
    sector: Sector,
    user_id: string | null,
    vec: number[],
    dim: number,
  ) {
    const buf = Buffer.from(new Float32Array(vec).buffer);
    return this.db.run(
      `insert into vectors(id,sector,user_id,v,dim) values(?,?,?,?,?)`,
      [id, sector, user_id, buf, dim],
    );
  }

  updateVector(id: string, sector: Sector, vec: number[], dim: number) {
    const buf = Buffer.from(new Float32Array(vec).buffer);
    return this.db.run(
      `update vectors set v=?, dim=? where id=? and sector=?`,
      [buf, dim, id, sector],
    );
  }

  getVectorsById(id: string): Promise<VectorRow[]> {
    return this.db.all<VectorRow>(
      `select id,sector,v,dim from vectors where id=?`,
      [id],
    );
  }

  getVectorsBySector(sector: Sector): Promise<VectorRow[]> {
    return this.db.all<VectorRow>(
      `select id,sector,v,dim from vectors where sector=?`,
      [sector],
    );
  }

  deleteVectors(id: string) {
    return this.db.run(`delete from vectors where id=?`, [id]);
  }

  deleteWaypoints(a: string, b: string) {
    return this.db.run(`delete from waypoints where src_id=? or dst_id=?`, [
      a,
      b,
    ]);
  }

  updateMean(id: string, meanDim: number, meanVec: number[]) {
    const buf = Buffer.from(new Float32Array(meanVec).buffer);
    return this.db.run(
      `update memories set mean_dim=?, mean_vec=?, updated_at=? where id=?`,
      [meanDim, buf, Date.now(), id],
    );
  }

  listMeanVectors(
    limit: number,
  ): Promise<{ id: string; mean_vec: Buffer | null }[]> {
    return this.db.all<{ id: string; mean_vec: Buffer | null }>(
      `select id, mean_vec from memories where mean_vec is not null order by updated_at desc limit ?`,
      [limit],
    );
  }

  insertWaypoint(
    src_id: string,
    dst_id: string,
    user_id: string | null,
    weight: number,
    created_at: number,
    updated_at: number,
  ) {
    return this.db.run(
      `insert into waypoints(src_id,dst_id,user_id,weight,created_at,updated_at)
       values(?,?,?,?,?,?)
       on conflict(src_id,dst_id,user_id)
       do update set weight=excluded.weight, updated_at=excluded.updated_at`,
      [src_id, dst_id, user_id, weight, created_at, updated_at],
    );
  }

  listWaypointsFrom(
    src_id: string,
    limit = 50,
  ): Promise<
    {
      dst_id: string;
      weight: number;
    }[]
  > {
    return this.db.all<{ dst_id: string; weight: number }>(
      `select dst_id, weight from waypoints where src_id=? order by weight desc limit ?`,
      [src_id, limit],
    );
  }

  pruneWaypoints(threshold: number) {
    return this.db.run(`delete from waypoints where weight < ?`, [threshold]);
  }

  async countWaypointsWeak(threshold: number): Promise<number> {
    const r = await this.db.get<{ cnt: number }>(
      `select count(1) as cnt from waypoints where weight < ?`,
      [threshold],
    );
    return r?.cnt || 0;
  }

  pruneWaypointsAdvanced(
    weakThreshold: number,
    olderThan: number,
    oldThreshold: number,
  ) {
    return this.db.run(
      `delete from waypoints where weight < ? or (updated_at < ? and weight < ?)`,
      [weakThreshold, olderThan, oldThreshold],
    );
  }

  async countWaypointsOld(
    olderThan: number,
    oldThreshold: number,
  ): Promise<number> {
    const r = await this.db.get<{ cnt: number }>(
      `select count(1) as cnt from waypoints where updated_at < ? and weight < ?`,
      [olderThan, oldThreshold],
    );
    return r?.cnt || 0;
  }

  updateWaypointWeight(src_id: string, dst_id: string, weight: number) {
    return this.db.run(
      `update waypoints set weight=?, updated_at=? where src_id=? and dst_id=?`,
      [weight, Date.now(), src_id, dst_id],
    );
  }

  insertWaypointIfNotExists(
    src_id: string,
    dst_id: string,
    user_id: string | null,
    weight: number,
    created_at: number,
    updated_at: number,
  ) {
    return this.db.run(
      `insert into waypoints(src_id,dst_id,user_id,weight,created_at,updated_at)
       select ?,?,?,?,?,?
       where not exists (
         select 1 from waypoints where src_id=? and dst_id=? and coalesce(user_id,'')=coalesce(?, '')
       )`,
      [
        src_id,
        dst_id,
        user_id,
        weight,
        created_at,
        updated_at,
        src_id,
        dst_id,
        user_id,
      ],
    );
  }

  async getMaxSegment(): Promise<number> {
    const r = await this.db.get<{ max_seg: number | null }>(
      `select max(segment) as max_seg from memories`,
      [],
    );
    return r?.max_seg ?? 0;
  }

  async countInSegment(segment: number): Promise<number> {
    const r = await this.db.get<{ c: number }>(
      `select count(1) as c from memories where segment=?`,
      [segment],
    );
    return r?.c ?? 0;
  }

  listMeanVectorsInSegments(
    segments: number[],
    limit: number,
  ): Promise<{ id: string; mean_vec: Buffer | null }[]> {
    if (!segments.length) return this.listMeanVectors(limit);
    const ph = segments.map(() => '?').join(',');
    const sql = `select id, mean_vec from memories where mean_vec is not null and segment in (${ph}) order by updated_at desc limit ?`;
    return this.db.all<{ id: string; mean_vec: Buffer | null }>(sql, [
      ...segments,
      limit,
    ]);
  }

  upsertCoactivation(
    src_id: string,
    dst_id: string,
    user_id: string | null,
    count: number,
    updated_at: number,
  ) {
    return this.db.run(
      `insert into coactivations(src_id,dst_id,user_id,count,updated_at)
       values(?,?,?,?,?)
       on conflict(src_id,dst_id,user_id)
       do update set count=coactivations.count+excluded.count, updated_at=excluded.updated_at`,
      [src_id, dst_id, user_id, count, updated_at],
    );
  }

  listTopCoactivations(
    limit: number,
  ): Promise<
    { src_id: string; dst_id: string; user_id: string | null; count: number }[]
  > {
    return this.db.all<{
      src_id: string;
      dst_id: string;
      user_id: string | null;
      count: number;
    }>(
      `select src_id, dst_id, user_id, count from coactivations order by count desc limit ?`,
      [limit],
    );
  }

  listCoactivationsFrom(
    src_id: string,
    user_id: string | null,
    limit = 1000,
  ): Promise<{ dst_id: string; count: number }[]> {
    if (user_id === null) {
      return this.db.all<{ dst_id: string; count: number }>(
        `select dst_id, count from coactivations where src_id=? and user_id is null order by count desc limit ?`,
        [src_id, limit],
      );
    }
    return this.db.all<{ dst_id: string; count: number }>(
      `select dst_id, count from coactivations where src_id=? and user_id=? order by count desc limit ?`,
      [src_id, user_id, limit],
    );
  }

  boostWaypoint(src_id: string, dst_id: string, delta: number) {
    return this.db.run(
      `update waypoints set weight=min(1, weight + ?), updated_at=? where src_id=? and dst_id=?`,
      [delta, Date.now(), src_id, dst_id],
    );
  }

  setWaypointWeight(src_id: string, dst_id: string, weight: number) {
    return this.db.run(
      `update waypoints set weight=?, updated_at=? where src_id=? and dst_id=?`,
      [weight, Date.now(), src_id, dst_id],
    );
  }

  deleteWaypoint(src_id: string, dst_id: string) {
    return this.db.run(`delete from waypoints where src_id=? and dst_id=?`, [
      src_id,
      dst_id,
    ]);
  }

  listIds(limit: number, offset: number): Promise<{ id: string }[]> {
    return this.db.all<{ id: string }>(
      `select id from memories order by created_at desc limit ? offset ?`,
      [limit, offset],
    );
  }

  getBm25Meta(): Promise<{ N: number; avgLen: number; t: number } | null> {
    return this.db.get<{ N: number; avgLen: number; t: number }>(
      `select N, avgLen, t from bm25_meta limit 1`,
      [],
    );
  }

  async replaceBm25Meta(N: number, avgLen: number, t: number): Promise<void> {
    await this.db.run(`delete from bm25_meta`, []);
    await this.db.run(`insert into bm25_meta(N,avgLen,t) values(?,?,?)`, [
      N,
      avgLen,
      t,
    ]);
  }

  updateBm25Token(token: string, delta: number) {
    return this.db.run(
      `insert into bm25_tokens(token,df) values(?,?)
       on conflict(token) do update set df=max(0, bm25_tokens.df + excluded.df)`,
      [token, delta],
    );
  }

  setBm25DocLen(id: string, len: number) {
    return this.db.run(
      `insert into bm25_docs(id,len) values(?,?) on conflict(id) do update set len=excluded.len`,
      [id, len],
    );
  }

  getBm25DocLen(id: string): Promise<{ len: number } | null> {
    return this.db.get<{ len: number }>(
      `select len from bm25_docs where id=?`,
      [id],
    );
  }

  loadBm25Tokens(): Promise<{ token: string; df: number }[]> {
    return this.db.all<{ token: string; df: number }>(
      `select token, df from bm25_tokens`,
      [],
    );
  }

  countBm25Docs(): Promise<{ c: number; s: number } | null> {
    return this.db.get<{ c: number; s: number }>(
      `select count(1) as c, sum(len) as s from bm25_docs`,
      [],
    );
  }

  insertSessionEvent(
    user_id: string | null,
    mem_id: string,
    type: string,
    ts: number,
  ) {
    return this.db.run(
      `insert into session_events(user_id, mem_id, type, ts) values(?,?,?,?)`,
      [user_id, mem_id, type, ts],
    );
  }

  listSessionEventsSince(
    sinceTs: number,
    limit: number,
  ): Promise<
    { user_id: string | null; mem_id: string; type: string; ts: number }[]
  > {
    return this.db.all<{
      user_id: string | null;
      mem_id: string;
      type: string;
      ts: number;
    }>(
      `select user_id, mem_id, type, ts from session_events where ts>=? order by user_id, ts asc limit ?`,
      [sinceTs, limit],
    );
  }

  pruneSessionEventsOlderThan(tsCutoff: number) {
    return this.db.run(`delete from session_events where ts < ?`, [tsCutoff]);
  }

  listSessionEventUsers(): Promise<(string | null)[]> {
    return this.db
      .all<{
        user_id: string | null;
      }>(`select distinct user_id from session_events`, [])
      .then((rows) => rows.map((r) => r.user_id));
  }

  pruneSessionEventsKeepLatestForUser(
    user_id: string | null,
    keepLast: number,
  ) {
    if (user_id === null) {
      return this.db.run(
        `delete from session_events 
         where user_id is null and ts < (
           select ts from session_events 
           where user_id is null 
           order by ts desc 
           limit 1 offset ?
         )`,
        [Math.max(0, keepLast - 1)],
      );
    }
    return this.db.run(
      `delete from session_events 
       where user_id=? and ts < (
         select ts from session_events 
         where user_id=? 
         order by ts desc 
         limit 1 offset ?
       )`,
      [user_id, user_id, Math.max(0, keepLast - 1)],
    );
  }

  incStat(type: string, count = 1, ts?: number) {
    return this.db.run(`insert into stats(type,count,ts) values(?,?,?)`, [
      type,
      Math.max(1, count),
      ts ?? Date.now(),
    ]);
  }
  insertEmbedLog(
    id: string,
    model: string,
    status: string,
    ts: number,
    err?: string,
  ) {
    return this.db.run(
      `insert into embed_logs(id,model,status,ts,err) values(?,?,?,?,?)`,
      [id, model, status, ts, err || null],
    );
  }
}
