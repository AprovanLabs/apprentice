export interface Entity {
  uri: string;
  type: string;
  attrs: Record<string, unknown>;
  version?: string;
  syncedAt?: string;
}

export interface EntityLink {
  type: string;
  targetUri: string;
  attrs?: Record<string, unknown>;
}

export interface EntityFilter {
  types?: string[];
  uriPrefix?: string;
  attrs?: Record<string, unknown>;
  limit?: number;
  offset?: number;
}

export interface EntityGraph {
  upsert(entity: Entity): Promise<void>;
  get(uri: string, version?: string): Promise<Entity | null>;
  delete(uri: string): Promise<void>;
  link(
    from: string,
    to: string,
    type: string,
    attrs?: Record<string, unknown>,
  ): Promise<void>;
  unlink(from: string, to: string, type: string): Promise<void>;
  traverse(uri: string, depth?: number): Promise<Entity[]>;
  query(filter: EntityFilter): Promise<Entity[]>;
}
