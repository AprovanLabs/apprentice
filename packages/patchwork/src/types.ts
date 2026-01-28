// Patchwork Types - Context providers and selection engine types

// ============================================================================
// Context Provider Types
// ============================================================================

export interface ContextProvider {
  name: string;
  schema?: Record<string, unknown>;
  getContext(): Promise<Record<string, unknown>>;
  subscribe?(callback: (context: Record<string, unknown>) => void): () => void;
}

export interface AggregatedContext {
  timestamp: string;
  providers: {
    [providerName: string]: Record<string, unknown>;
  };
}

export interface ContextManagerOptions {
  debounce_ms?: number;
}

// ============================================================================
// Common Context Shapes
// ============================================================================

export interface ShellContext {
  cwd: string;
  recent_commands?: string[];
  shell?: string;
}

export interface GitContext {
  is_repo: boolean;
  branch?: string;
  remote_url?: string;
  uncommitted_changes?: number;
  staged_files?: number;
}

export interface ProjectContext {
  type?: string;
  package_manager?: string;
  scripts?: string[];
}

// ============================================================================
// Selection Engine Types
// ============================================================================

export interface Viewport {
  width: number;
  height: number;
}

export interface SelectionOptions {
  limit?: number;
  strategy?: 'llm' | 'rules';
  minConfidence?: number;
}

export interface WidgetSuggestion {
  name: string;
  confidence: number;
  position: 'primary' | 'secondary' | 'ambient';
  reason: string;
  suggested_size: {
    width: number;
    height: number;
  };
}

export interface CompositionRules {
  max_primary: number;
  max_secondary: number;
  max_ambient: number;
  ambient_stacking: boolean;
}

export const DEFAULT_COMPOSITION_RULES: CompositionRules = {
  max_primary: 1,
  max_secondary: 3,
  max_ambient: 5,
  ambient_stacking: true,
};

export interface ComposedLayout {
  widgets: Array<{
    name: string;
    position: 'primary' | 'secondary' | 'ambient';
    bounds: { x: number; y: number; width: number; height: number };
  }>;
  remaining_space: { width: number; height: number };
}

// ============================================================================
// Usage Tracking Types
// ============================================================================

export interface UsageRecord {
  widget_name: string;
  context_hash: string;
  was_suggested: boolean;
  viewport: Viewport;
  timestamp: string;
}

export interface UsagePattern {
  context_hash: string;
  selected_widget: string;
  was_suggested: boolean;
  viewport_size: Viewport;
  timestamp: string;
}

// ============================================================================
// Legacy Types (for backward compatibility with selection engine)
// ============================================================================

export interface WidgetDimensions {
  min_width: number;
  max_width: number;
  min_height: number;
  max_height: number;
  preferred_ratio: number;
  information_density: 'low' | 'medium' | 'high';
}

export const DEFAULT_DIMENSIONS: WidgetDimensions = {
  min_width: 150,
  max_width: 600,
  min_height: 100,
  max_height: 400,
  preferred_ratio: 1.5,
  information_density: 'medium',
};

export interface WidgetMetadata {
  id: string;
  name: string;
  path: string;
  tags: string[];
  description?: string;
  backend: 'vue' | 'cli';
  dimensions: WidgetDimensions;
  usage_count: number;
  created_at: string;
  updated_at: string;
  last_used: string | null;
  created_by: 'user' | 'generated';
}

export interface Widget {
  metadata: WidgetMetadata;
  code: string;
}
