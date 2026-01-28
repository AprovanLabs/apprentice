// MCP Tools for Patchwork - Widget generation and management via MCP

import {
  generateWidget,
  regenerateWidget,
  listWidgets,
  searchWidgets,
  getWidget,
  deleteWidget,
} from './generation/index.js';
import type { WidgetRuntime } from '@aprovan/patchwork';
import {
  generateLayout,
  getSlotDimensions,
  type LayoutContext,
} from './llm-prompt.js';
import { getPresetNames } from '@aprovan/patchwork';

interface McpTool {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export const patchworkTools: McpTool[] = [
  {
    name: 'patchwork_generate_widget',
    description: 'Generate a new widget from natural language description',
    inputSchema: {
      type: 'object',
      properties: {
        description: {
          type: 'string',
          description: 'Natural language description of the widget to generate',
        },
        name: {
          type: 'string',
          description:
            'Optional widget name (generated from description if omitted)',
        },
        runtime: {
          type: 'string',
          enum: ['browser', 'terminal', 'data'],
          description:
            'Target runtime: browser (React), terminal (Ink), or data (JSON/Markdown output)',
        },
      },
      required: ['description', 'runtime'],
    },
  },
  {
    name: 'patchwork_list_widgets',
    description: 'List all available widgets with metadata',
    inputSchema: {
      type: 'object',
      properties: {
        runtime: {
          type: 'string',
          enum: ['browser', 'terminal', 'data'],
          description: 'Filter by runtime type',
        },
      },
    },
  },
  {
    name: 'patchwork_search_widgets',
    description: 'Search widgets by name, description, services, or packages',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
        runtime: {
          type: 'string',
          enum: ['browser', 'terminal', 'data'],
          description: 'Filter by runtime',
        },
        service: {
          type: 'string',
          description: 'Filter by service dependency',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'patchwork_get_widget',
    description: 'Get widget code and metadata by name',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Widget name' },
      },
      required: ['name'],
    },
  },
  {
    name: 'patchwork_update_widget',
    description: 'Regenerate a widget with a new description',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Widget name to update' },
        description: {
          type: 'string',
          description: 'New description for regeneration',
        },
      },
      required: ['name', 'description'],
    },
  },
  {
    name: 'patchwork_delete_widget',
    description: 'Delete a widget and its compiled assets',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Widget name to delete' },
      },
      required: ['name'],
    },
  },
  {
    name: 'patchwork_generate_layout',
    description: 'Generate a widget layout configuration using LLM',
    inputSchema: {
      type: 'object',
      properties: {
        request: {
          type: 'string',
          description: 'Natural language description of desired layout',
        },
        cwd: {
          type: 'string',
          description: 'Current working directory for context',
        },
        gitBranch: {
          type: 'string',
          description: 'Current git branch for context',
        },
        projectType: {
          type: 'string',
          description: 'Project type (node, python, etc)',
        },
      },
    },
  },
  {
    name: 'patchwork_list_presets',
    description: 'List available layout presets',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
];

export async function handlePatchworkTool(
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  switch (name) {
    case 'patchwork_generate_widget': {
      const description = args.description as string;
      const runtime = args.runtime as WidgetRuntime;
      const widgetName = args.name as string | undefined;

      const result = await generateWidget({
        description,
        runtime,
        name: widgetName,
        save: true,
      });

      return {
        success: result.success,
        path: result.path,
        name: result.meta?.name,
        errors: result.errors.length > 0 ? result.errors : undefined,
        validation: result.validation.valid
          ? undefined
          : result.validation.errors,
      };
    }

    case 'patchwork_list_widgets': {
      const runtime = args.runtime as WidgetRuntime | undefined;
      let widgets = await listWidgets();
      if (runtime) {
        widgets = widgets.filter((w) => w.runtime === runtime);
      }
      return {
        widgets: widgets.map((w) => ({
          name: w.name,
          runtime: w.runtime,
          description: w.description,
          services: w.services,
        })),
        total: widgets.length,
      };
    }

    case 'patchwork_search_widgets': {
      const query = args.query as string;
      const runtime = args.runtime as WidgetRuntime | undefined;
      const service = args.service as string | undefined;

      const widgets = await searchWidgets(query, { runtime, service });
      return {
        widgets: widgets.map((w) => ({
          name: w.name,
          runtime: w.runtime,
          description: w.description,
          services: w.services,
        })),
        total: widgets.length,
      };
    }

    case 'patchwork_get_widget': {
      const widgetName = args.name as string;
      const result = await getWidget(widgetName);
      if (!result) {
        return { success: false, error: `Widget '${widgetName}' not found` };
      }
      return {
        success: true,
        name: result.info.name,
        runtime: result.info.runtime,
        description: result.info.description,
        code: result.code,
        services: result.info.services,
        packages: result.info.packages,
      };
    }

    case 'patchwork_update_widget': {
      const widgetName = args.name as string;
      const description = args.description as string;

      const result = await regenerateWidget(widgetName, description);
      return {
        success: result.success,
        path: result.path,
        errors: result.errors.length > 0 ? result.errors : undefined,
      };
    }

    case 'patchwork_delete_widget': {
      const widgetName = args.name as string;
      const deleted = await deleteWidget(widgetName);
      return {
        success: deleted,
        deleted: deleted ? widgetName : undefined,
        error: deleted ? undefined : `Widget '${widgetName}' not found`,
      };
    }

    case 'patchwork_generate_layout': {
      const context: LayoutContext = {
        cwd: args.cwd as string | undefined,
        gitBranch: args.gitBranch as string | undefined,
        projectType: args.projectType as string | undefined,
      };
      const request = args.request as string | undefined;

      const result = await generateLayout(context, request);
      return {
        success: result.success,
        layout: result.layout,
        errors: result.errors.length > 0 ? result.errors : undefined,
      };
    }

    case 'patchwork_list_presets': {
      const presets = getPresetNames();
      return {
        presets: presets.map((name) => ({
          name,
          slots: [...getSlotDimensions(name).keys()],
        })),
      };
    }

    default:
      throw new Error(`Unknown Patchwork tool: ${name}`);
  }
}
