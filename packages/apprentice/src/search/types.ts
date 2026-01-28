import type { Event, Asset } from '../types';

export type SearchMode = 'fts' | 'vector' | 'hybrid';

export interface SearchOptions {
  query: string;
  mode?: SearchMode;
  limit?: number;
  offset?: number;
  scope?: {
    events?: boolean;
    assets?: boolean;
  };
  since?: string;
  until?: string;
  recentMinutes?: number;
  filters?: Record<string, string>;
  contextIds?: string[];
  extensions?: string[];
  hybridWeights?: {
    fts?: number;
    vector?: number;
  };
  related?: boolean;
  strategy?: GroupingStrategy;
  windowSeconds?: number;
  relatedLimit?: number;
}

export interface VersionedAssetResult {
  id: string;
  context_id: string;
  key: string;
  extension: string;
  content_hash: string;
  indexed_at: string;
  metadata: Record<string, unknown>;
  content?: string | null;
  version_ref?: string;
  version_name?: string;
  version_timestamp?: string;
}

export interface SearchResult {
  type: 'event' | 'asset';
  item: Event | Asset | VersionedAssetResult;
  score: number;
  matchType: 'fts' | 'vector' | 'both';
  ftsScore?: number;
  vectorDistance?: number;
  context?: RelatedContextResult;
}

export interface SearchResponse {
  results: SearchResult[];
  total: number;
  mode: SearchMode;
  durationMs: number;
  embeddingsAvailable: boolean;
}

export interface GroupingStrategy {
  /** Metadata field path to group by (e.g., "chat.session_id") */
  groupBy: string;
  /** Metadata field path or "timestamp" for ordering */
  orderBy?: string;
  /** Sort direction (default: "asc") */
  direction?: 'asc' | 'desc';
}

export interface RelatedContextOptions {
  /** Grouping strategy for related events */
  strategy?: GroupingStrategy;
  /** Temporal window in seconds for fallback (default: 60) */
  windowSeconds?: number;
  /** Maximum related events to return (default: 20) */
  limit?: number;
}

export interface RelatedContextResult {
  /** Related events (empty if none found) */
  events: Event[];
  /** Related assets (extracted from event metadata.relations) */
  assets: Asset[];
  /** Which strategy was used: "grouped" | "temporal" */
  strategyUsed: 'grouped' | 'temporal';
}
