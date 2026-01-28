export type RefType = 'commit' | 'tag' | 'branch';
export type FileChangeStatus = 'added' | 'modified' | 'deleted' | 'renamed';
export type ProviderType = 'git' | 'manual';

export interface VersionRef {
  id: string;
  refType: RefType;
  name: string;
  parentIds: string[];
  timestamp: string;
  message?: string;
  metadata: Record<string, unknown>;
}

export interface FileChange {
  key: string;
  status: FileChangeStatus;
  renamedFrom?: string;
  contentHash?: string;
}

export interface VersionDiff {
  ref: VersionRef;
  changes: FileChange[];
}

export interface VersionProviderConfig {
  branches?: string[];
  maxDepth?: number;
  includeTags?: boolean;
  autoSync?: boolean;
}

export interface ListRefsOptions {
  branch?: string;
  since?: string;
  limit?: number;
}

export interface VersionProvider {
  readonly type: ProviderType;
  detect(contextPath: string): Promise<boolean>;
  getCurrentRef(contextPath: string): Promise<VersionRef | null>;
  getRef(contextPath: string, refId: string): Promise<VersionRef | null>;
  listRefs(
    contextPath: string,
    options?: ListRefsOptions,
  ): Promise<VersionRef[]>;
  getDiff(
    contextPath: string,
    fromRef: string | null,
    toRef: string,
  ): Promise<VersionDiff>;
  getContent(
    contextPath: string,
    key: string,
    refId: string,
  ): Promise<string | null>;
  getContentHash(
    contextPath: string,
    key: string,
    refId: string,
  ): Promise<string | null>;
  listFiles(contextPath: string, refId: string): Promise<string[]>;
  canRetrieve(contextPath: string, refId: string): Promise<boolean>;
}

export interface SyncResult {
  refsProcessed: number;
  filesIndexed: number;
  contentStored: number;
  errors: string[];
}

export interface SyncOptions {
  batchSize?: number;
  force?: boolean;
  maxDepth?: number;
}

export interface VersionFilter {
  ref?: string;
  branch?: string;
  before?: string;
  history?: boolean;
}

export interface AssetVersion {
  contextId: string;
  key: string;
  versionRefId: string;
  contentHash: string;
  status: FileChangeStatus;
  renamedFrom?: string;
}

export interface ContentRef {
  contentHash: string;
  contextId: string;
  isHead: boolean;
  versionRefId?: string;
}
