// LLM Layout Prompt - Interface for LLMs to specify widget layouts

import type { LayoutSpec, SlotId } from '@aprovan/patchwork';
import type { WidgetInfo } from './generation/generator.js';
import { PRESETS, getPreset } from '@aprovan/patchwork';
import { listWidgets } from './generation/generator.js';
import { smartComplete, parseJSONResponse } from '../ai/client.js';

export interface LayoutContext {
  cwd?: string;
  recentCommands?: string[];
  gitBranch?: string;
  projectType?: string;
}

export interface LayoutPromptSchema {
  presets: Array<{ name: string; description?: string; slots: string[] }>;
  widgets: Array<{
    name: string;
    description: string;
    inputs: Record<string, unknown>;
  }>;
}

export function buildLayoutSchema(widgets: WidgetInfo[]): LayoutPromptSchema {
  return {
    presets: Object.values(PRESETS).map((p) => ({
      name: p.name,
      description: p.description,
      slots: p.slots.map((s) => s.id),
    })),
    widgets: widgets.map((w) => ({
      name: w.name,
      description: w.description,
      inputs: {}, // Widget inputs from meta
    })),
  };
}

const LAYOUT_SYSTEM_PROMPT = `You are a UI layout assistant. Generate widget layout configurations based on context.

Rules:
- Only use widgets and presets from the provided schema
- Assign widgets to valid slot IDs from the chosen preset
- Provide props that match widget input schemas
- Return ONLY valid JSON, no explanation

Output format:
{
  "preset": "preset-name",
  "slots": [
    { "slotId": "slot-id", "widget": "widget-name", "props": {} }
  ]
}`;

export function buildLayoutPrompt(
  schema: LayoutPromptSchema,
  context: LayoutContext,
  userRequest?: string,
): string {
  const parts = [
    'Available presets and widgets:',
    JSON.stringify(schema, null, 2),
  ];

  if (Object.keys(context).length > 0) {
    parts.push('\nCurrent context:', JSON.stringify(context, null, 2));
  }

  if (userRequest) {
    parts.push('\nUser request:', userRequest);
  } else {
    parts.push('\nGenerate an appropriate layout based on the context.');
  }

  return parts.join('\n');
}

export interface LayoutGenerationResult {
  success: boolean;
  layout?: LayoutSpec;
  errors: string[];
}

function validateLayoutSpec(
  spec: unknown,
  schema: LayoutPromptSchema,
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!spec || typeof spec !== 'object') {
    return { valid: false, errors: ['Invalid layout specification'] };
  }

  const layout = spec as Record<string, unknown>;

  if (layout.preset && typeof layout.preset === 'string') {
    const preset = getPreset(layout.preset);
    if (!preset) {
      errors.push(`Unknown preset: ${layout.preset}`);
    }
  }

  if (!Array.isArray(layout.slots)) {
    return { valid: false, errors: ['Missing slots array'] };
  }

  const widgetNames = new Set(schema.widgets.map((w) => w.name));
  const preset = layout.preset
    ? getPreset(layout.preset as string)
    : PRESETS.minimal;
  const validSlots = new Set(preset?.slots.map((s) => s.id) || []);

  for (const slot of layout.slots as Array<Record<string, unknown>>) {
    if (!slot.slotId || typeof slot.slotId !== 'string') {
      errors.push('Slot missing slotId');
      continue;
    }

    if (!validSlots.has(slot.slotId)) {
      errors.push(`Invalid slot ID: ${slot.slotId}`);
    }

    if (!slot.widget || typeof slot.widget !== 'string') {
      errors.push(`Slot ${slot.slotId} missing widget`);
      continue;
    }

    if (!widgetNames.has(slot.widget)) {
      errors.push(`Unknown widget: ${slot.widget}`);
    }
  }

  return { valid: errors.length === 0, errors };
}

export async function generateLayout(
  context: LayoutContext,
  userRequest?: string,
): Promise<LayoutGenerationResult> {
  const widgets = await listWidgets();

  if (widgets.length === 0) {
    return { success: false, errors: ['No widgets available'] };
  }

  const schema = buildLayoutSchema(widgets);
  const prompt = buildLayoutPrompt(schema, context, userRequest);

  try {
    const result = await smartComplete(prompt, LAYOUT_SYSTEM_PROMPT, {
      temperature: 0.2,
    });
    const parsed = parseJSONResponse<Record<string, unknown>>(result.text);

    const validation = validateLayoutSpec(parsed, schema);
    if (!validation.valid) {
      return { success: false, errors: validation.errors };
    }

    const layout: LayoutSpec = {
      preset: (parsed.preset as string) || undefined,
      slots: (
        parsed.slots as Array<{
          slotId: string;
          widget: string;
          props?: Record<string, unknown>;
        }>
      ).map((s) => ({
        slotId: s.slotId,
        widget: s.widget,
        props: s.props,
      })),
    };

    return { success: true, layout, errors: [] };
  } catch (err) {
    return {
      success: false,
      errors: [err instanceof Error ? err.message : String(err)],
    };
  }
}

export async function getAvailableWidgets(): Promise<WidgetInfo[]> {
  return listWidgets();
}

export function getSlotDimensions(
  presetName: string,
): Map<SlotId, { width: number | 'fill'; height: number | 'fill' }> {
  const preset = getPreset(presetName);
  if (!preset) return new Map();

  const dimensions = new Map<
    SlotId,
    { width: number | 'fill'; height: number | 'fill' }
  >();
  for (const slot of preset.slots) {
    dimensions.set(slot.id, { width: slot.width, height: slot.height });
  }
  return dimensions;
}
