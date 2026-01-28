// Selection Engine - LLM-based widget selection with rule-based fallback
// NOTE: Widget storage removed - this module is deprecated

import {
  Widget,
  AggregatedContext,
  Viewport,
  WidgetSuggestion,
  SelectionOptions,
  UsageRecord,
} from './types';
import { fastComplete, parseJSONResponse } from '../ai/client';
import { getContextManager } from '@aprovan/patchwork';

/**
 * System prompt for LLM widget selection
 */
const SELECTION_SYSTEM_PROMPT = `You are a UI assistant selecting widgets to display based on user context.

Your task is to analyze the current context and available widgets, then select the most relevant ones.

Selection Rules:
- Match widget tags to context keywords and values
- Respect viewport dimension constraints
- Prefer high information_density widgets for ambient positions
- Small, high-density widgets can always be included if space permits
- Fill viewport efficiently without overflow
- Only one widget can be "primary"

Return ONLY a valid JSON array, no other text.`;

/**
 * Build prompt for LLM widget selection
 */
function buildSelectionPrompt(
  context: AggregatedContext,
  widgets: Widget[],
  viewport: Viewport,
  recentUsage: UsageRecord[],
  limit: number,
): string {
  // Format widgets for prompt
  const widgetSummaries = widgets.slice(0, 15).map((w) => ({
    name: w.metadata.name,
    tags: w.metadata.tags,
    description: w.metadata.description,
    dimensions: w.metadata.dimensions,
    usage_count: w.metadata.usage_count,
  }));

  // Get recently used widget names
  const recentWidgetNames = [
    ...new Set(recentUsage.slice(-10).map((r) => r.widget_name)),
  ];

  return `Current Context (from providers):
${JSON.stringify(context.providers, null, 2)}

Available Viewport:
Width: ${viewport.width}px, Height: ${viewport.height}px

Available Widgets:
${JSON.stringify(widgetSummaries, null, 2)}

Recently Used (last hour):
${recentWidgetNames.length > 0 ? recentWidgetNames.join(', ') : 'None'}

Select up to ${limit} widgets. For each, provide:
- name: widget identifier (must match an available widget)
- confidence: 0.0-1.0 (how relevant is this widget)
- position: "primary", "secondary", or "ambient"
- reason: brief explanation (1 sentence)
- width: suggested width in pixels (within widget's min/max)
- height: suggested height in pixels (within widget's min/max)

Return JSON array like:
[{"name": "widget-name", "confidence": 0.9, "position": "primary", "reason": "explanation", "width": 400, "height": 300}]`;
}

/**
 * Parse LLM response into widget suggestions
 */
function parseLLMResponse(
  response: string,
  availableWidgets: Widget[],
): WidgetSuggestion[] {
  try {
    const parsed = parseJSONResponse<
      Array<{
        name: string;
        confidence: number;
        position: string;
        reason: string;
        width: number;
        height: number;
      }>
    >(response);

    if (!Array.isArray(parsed)) {
      return [];
    }

    const widgetNames = new Set(availableWidgets.map((w) => w.metadata.name));

    return parsed
      .filter((item) => widgetNames.has(item.name)) // Only include valid widgets
      .map((item) => ({
        name: item.name,
        confidence: Math.max(0, Math.min(1, item.confidence || 0)),
        position: ['primary', 'secondary', 'ambient'].includes(item.position)
          ? (item.position as 'primary' | 'secondary' | 'ambient')
          : 'secondary',
        reason: item.reason || 'Selected by LLM',
        suggested_size: {
          width: Math.round(item.width || 300),
          height: Math.round(item.height || 200),
        },
      }));
  } catch (error) {
    console.warn('Failed to parse LLM response:', error);
    return [];
  }
}

/**
 * Select widgets using LLM
 */
async function selectWidgetsLLM(
  widgets: Widget[],
  _context: AggregatedContext,
  _viewport: Viewport,
  usageHistory: UsageRecord[],
  limit: number,
): Promise<WidgetSuggestion[] | null> {
  try {
    const prompt = buildSelectionPrompt(
      context,
      widgets,
      viewport,
      usageHistory,
      limit,
    );

    const result = await fastComplete(prompt, SELECTION_SYSTEM_PROMPT);
    const suggestions = parseLLMResponse(result.text, widgets);

    if (suggestions.length === 0) {
      return null; // Fall back to rules
    }

    return suggestions;
  } catch (error) {
    console.warn('LLM selection failed, falling back to rules:', error);
    return null;
  }
}

/**
 * Main selection function - selects widgets based on context and viewport
 * NOTE: Deprecated - widget storage removed
 */
export async function selectWidgets(
  _context: AggregatedContext,
  _viewport: Viewport,
  _options?: SelectionOptions,
): Promise<WidgetSuggestion[]> {
  console.warn('selectWidgets is deprecated - widget storage removed');
  return [];
}

/**
 * Get widget suggestions using current context
 * NOTE: Deprecated - widget storage removed
 */
export async function suggestWidgets(
  _viewport: Viewport,
  _options?: SelectionOptions,
): Promise<{
  suggestions: WidgetSuggestion[];
  context_used: AggregatedContext;
}> {
  console.warn('suggestWidgets is deprecated - widget storage removed');
  const contextManager = getContextManager();
  const context = contextManager.getContext();

  return {
    suggestions: [],
    context_used: context,
  };
}

/**
 * Pre-filter widgets to top candidates for LLM selection
 * NOTE: Deprecated - widget storage removed
 */
export function preFilterWidgets(
  _widgets: Widget[],
  _context: AggregatedContext,
  _viewport: Viewport,
  _maxCandidates: number = 15,
): Widget[] {
  console.warn('preFilterWidgets is deprecated - widget storage removed');
  return [];
}
