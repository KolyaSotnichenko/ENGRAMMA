export type Sector =
  | 'episodic'
  | 'semantic'
  | 'procedural'
  | 'emotional'
  | 'reflective';

export interface MemoryRow {
  id: string;
  user_id: string | null;
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

export interface VectorRow {
  id: string;
  sector: Sector;
  v: Buffer;
  dim: number;
}

export interface AddResult {
  id: string;
  primary_sector: Sector;
  sectors: Sector[];
}
export interface QueryFilters {
  sector?: Sector;
  min_score?: number;
  user_id?: string;
}
export interface QueryMatch {
  id: string;
  content: string;
  score: number;
  sectors: Sector[];
  primary_sector: Sector;
  path: string[];
  salience: number;
  last_seen_at: number;
}

export type ReinforceResult = { ok: true } | { nf: true };
export type PatchResult =
  | { id: string; updated: true }
  | { nf: true }
  | { forbidden: true };

export interface MemoryItem {
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

export interface MemoryDetails extends Omit<MemoryItem, 'tags' | 'metadata'> {
  sectors: Sector[];
  tags: string[];
  metadata: Record<string, unknown>;
}

export interface IngestArgs {
  content_type: string;
  data: string | Buffer;
  metadata?: unknown;
  config?: unknown;
  user_id?: string;
}

export interface IngestUrlArgs {
  url: string;
  metadata?: unknown;
  config?: unknown;
  user_id?: string;
}

export interface Metadata {
  sector?: Sector;
}
