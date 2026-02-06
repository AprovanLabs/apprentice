// Compositor - Dynamic component generation based on context
//
// The compositor generates layout components based on context rather than
// using static preset layouts. It uses an LLM to decide widget arrangement.

import type { WidgetMeta } from '../runtime/types';

/**
 * Widget catalog entry - describes an available widget
 */
export interface WidgetCatalogEntry {
  /** Widget identifier */
  id: string;
  /** Widget metadata */
  meta: WidgetMeta;
  /** Widget source path */
  path: string;
  /** Relevance tags for LLM matching */
  tags?: string[];
}

/**
 * Context snapshot - current environmental state
 */
export interface ContextSnapshot {
  /** Git context */
  git?: {
    branch?: string;
    dirty?: boolean;
    ahead?: number;
    behind?: number;
  };
  /** Terminal context */
  terminal?: {
    cwd?: string;
    lastCommand?: string;
    lastExitCode?: number;
  };
  /** File context */
  files?: {
    active?: string;
    language?: string;
    modified?: boolean;
  };
  /** Custom context from providers */
  custom?: Record<string, unknown>;
}

/**
 * Slot binding - content to inject into a named slot
 */
export interface SlotBinding {
  /** Slot name */
  name: string;
  /** Content to render (widget ID or custom element) */
  content: string | WidgetCatalogEntry;
  /** Props to pass */
  props?: Record<string, unknown>;
}

/**
 * Generated layout result
 */
export interface CompositorResult {
  /** Generated JSX component source */
  componentSource: string;
  /** Widget imports needed */
  imports: Array<{ id: string; path: string }>;
  /** Slots exposed by the layout */
  exposedSlots: string[];
  /** Widgets directly included */
  includedWidgets: string[];
}

/**
 * LLM client interface for compositor
 */
export interface CompositorLLM {
  /**
   * Generate layout decisions based on context
   */
  generateLayout(
    context: ContextSnapshot,
    catalog: WidgetCatalogEntry[],
    constraints?: {
      maxWidgets?: number;
      preferredSlots?: string[];
    },
  ): Promise<{
    widgets: Array<{ id: string; placement: string }>;
    layoutStyle: 'sidebar' | 'stacked' | 'grid' | 'minimal';
    slots: string[];
  }>;
}

/**
 * Compositor configuration
 */
export interface CompositorConfig {
  /** Available widgets */
  widgets: WidgetCatalogEntry[];
  /** LLM client for decision making */
  llm?: CompositorLLM;
  /** Default layout when LLM unavailable */
  fallbackLayout?: 'minimal' | 'sidebar' | 'stacked';
}

/**
 * Compositor - generates layout components dynamically
 */
export class Compositor {
  private widgets: Map<string, WidgetCatalogEntry>;
  private llm?: CompositorLLM;
  private fallbackLayout: string;

  constructor(config: CompositorConfig) {
    this.widgets = new Map(config.widgets.map((w) => [w.id, w]));
    this.llm = config.llm;
    this.fallbackLayout = config.fallbackLayout ?? 'minimal';
  }

  /**
   * Add a widget to the catalog
   */
  addWidget(entry: WidgetCatalogEntry): void {
    this.widgets.set(entry.id, entry);
  }

  /**
   * Remove a widget from the catalog
   */
  removeWidget(id: string): void {
    this.widgets.delete(id);
  }

  /**
   * Get available widgets
   */
  getWidgets(): WidgetCatalogEntry[] {
    return Array.from(this.widgets.values());
  }

  /**
   * Generate a layout component based on context
   */
  async generate(
    context: ContextSnapshot,
    options: {
      maxWidgets?: number;
      preferredSlots?: string[];
    } = {},
  ): Promise<CompositorResult> {
    // If LLM available, use it for smart layout
    if (this.llm) {
      return this.generateWithLLM(context, options);
    }

    // Otherwise, use fallback layout
    return this.generateFallback(context);
  }

  /**
   * Generate layout using LLM
   */
  private async generateWithLLM(
    context: ContextSnapshot,
    options: {
      maxWidgets?: number;
      preferredSlots?: string[];
    },
  ): Promise<CompositorResult> {
    const catalog = this.getWidgets();

    const decision = await this.llm!.generateLayout(context, catalog, options);

    // Build imports
    const imports = decision.widgets
      .map((w) => {
        const entry = this.widgets.get(w.id);
        if (!entry) return null;
        return { id: w.id, path: entry.path };
      })
      .filter((i): i is { id: string; path: string } => i !== null);

    // Generate component source
    const componentSource = this.buildComponentSource(
      decision.layoutStyle,
      decision.widgets,
      decision.slots,
    );

    return {
      componentSource,
      imports,
      exposedSlots: decision.slots,
      includedWidgets: decision.widgets.map((w) => w.id),
    };
  }

  /**
   * Generate fallback layout without LLM
   */
  private generateFallback(context: ContextSnapshot): CompositorResult {
    // Pick widgets based on context heuristics
    const selectedWidgets: Array<{ id: string; placement: string }> = [];

    // If git context, add git status widget if available
    if (context.git && this.widgets.has('git-status')) {
      selectedWidgets.push({ id: 'git-status', placement: 'sidebar' });
    }

    // Build imports
    const imports = selectedWidgets
      .map((w) => {
        const entry = this.widgets.get(w.id);
        if (!entry) return null;
        return { id: w.id, path: entry.path };
      })
      .filter((i): i is { id: string; path: string } => i !== null);

    const componentSource = this.buildComponentSource(
      this.fallbackLayout as 'minimal' | 'sidebar' | 'stacked',
      selectedWidgets,
      ['main', 'status'],
    );

    return {
      componentSource,
      imports,
      exposedSlots: ['main', 'status'],
      includedWidgets: selectedWidgets.map((w) => w.id),
    };
  }

  /**
   * Build JSX component source for the layout
   */
  private buildComponentSource(
    style: 'sidebar' | 'stacked' | 'grid' | 'minimal',
    widgets: Array<{ id: string; placement: string }>,
    slots: string[],
  ): string {
    // Generate import statements
    const importStatements = widgets
      .map((w) => {
        const entry = this.widgets.get(w.id);
        if (!entry) return '';
        const componentName = this.toComponentName(w.id);
        return `import ${componentName} from '${entry.path}';`;
      })
      .filter(Boolean)
      .join('\n');

    // Generate slot components
    const slotElements = slots
      .map((slot) => `<Slot name="${slot}" />`)
      .join('\n        ');

    // Generate widget elements
    const widgetElements = widgets
      .map((w) => {
        const componentName = this.toComponentName(w.id);
        return `<${componentName} />`;
      })
      .join('\n        ');

    // Build layout based on style
    let layoutJsx: string;

    switch (style) {
      case 'sidebar':
        layoutJsx = `
      <div className="grid grid-cols-[250px_1fr] h-screen">
        <aside className="border-r p-4 overflow-auto">
          ${widgetElements}
          <Slot name="sidebar" />
        </aside>
        <main className="p-4 overflow-auto">
          <Slot name="main" />
        </main>
      </div>`;
        break;

      case 'stacked':
        layoutJsx = `
      <div className="flex flex-col h-screen">
        <header className="p-4 border-b">
          <Slot name="header" />
        </header>
        <main className="flex-1 p-4 overflow-auto">
          ${widgetElements}
          <Slot name="main" />
        </main>
        <footer className="p-2 border-t">
          <Slot name="status" />
        </footer>
      </div>`;
        break;

      case 'grid':
        layoutJsx = `
      <div className="grid grid-cols-2 gap-4 h-screen p-4">
        ${widgetElements}
        ${slotElements}
      </div>`;
        break;

      case 'minimal':
      default:
        layoutJsx = `
      <div className="h-screen p-4">
        <main className="h-full">
          ${widgetElements}
          <Slot name="main" />
        </main>
      </div>`;
        break;
    }

    return `
${importStatements}
import { Slot } from '@aprovan/patchwork-runtime';

export default function GeneratedLayout() {
  return (${layoutJsx}
  );
}
`;
  }

  /**
   * Convert widget ID to React component name
   */
  private toComponentName(id: string): string {
    return id
      .split(/[-_]/)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join('');
  }
}

/**
 * Create a compositor instance
 */
export function createCompositor(config: CompositorConfig): Compositor {
  return new Compositor(config);
}
