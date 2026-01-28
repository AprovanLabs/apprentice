// Browser Layout Manager - CSS Grid layout for browser widget iframes

import type {
  LayoutManager,
  LayoutPreset,
  LayoutSpec,
  SlotId,
  SlotBounds,
  SlotDefinition,
  MountedWidget,
} from './types.js';
import { PRESETS, getPreset } from './presets.js';
import { loadWidget } from '../runtime/loader.js';
import { executeBrowserWidget } from '../runtime/browser/index.js';
import type { Services } from '../runtime/types.js';

export interface BrowserLayoutOptions {
  container?: string;
  services?: Services;
  preset?: string;
  responsive?: boolean;
}

function generateGridTemplate(slots: SlotDefinition[]): {
  columns: string;
  rows: string;
  areas: string;
} {
  const byPosition = {
    top: slots.filter((s) => s.position === 'top'),
    bottom: slots.filter((s) => s.position === 'bottom'),
    left: slots.filter((s) => s.position === 'left'),
    right: slots.filter((s) => s.position === 'right'),
    center: slots.filter((s) => s.position === 'center'),
  };

  const rows: string[] = [];
  const areas: string[][] = [];

  const hasTop = byPosition.top.length > 0;
  const hasBottom = byPosition.bottom.length > 0;
  const hasLeft = byPosition.left.length > 0;
  const hasRight = byPosition.right.length > 0;
  const hasCenter = byPosition.center.length > 0;

  const colCount =
    (hasLeft ? 1 : 0) + (hasCenter ? 1 : 0) + (hasRight ? 1 : 0) || 1;

  if (hasTop) {
    const topSlot = byPosition.top[0]!;
    rows.push(topSlot.height === 'fill' ? '1fr' : `${topSlot.height}ch`);
    areas.push(Array(colCount).fill(topSlot.id));
  }

  const middleRow: string[] = [];
  if (hasLeft) {
    const leftSlot = byPosition.left[0]!;
    middleRow.push(leftSlot.id);
  }
  if (hasCenter || (!hasLeft && !hasRight)) {
    middleRow.push(byPosition.center[0]?.id || 'main');
  }
  if (hasRight) {
    const rightSlot = byPosition.right[0]!;
    middleRow.push(rightSlot.id);
  }

  if (middleRow.length > 0) {
    rows.push('1fr');
    areas.push(middleRow);
  }

  if (hasBottom) {
    const bottomSlot = byPosition.bottom[0]!;
    rows.push(bottomSlot.height === 'fill' ? '1fr' : `${bottomSlot.height}ch`);
    areas.push(Array(colCount).fill(bottomSlot.id));
  }

  const columns: string[] = [];
  if (hasLeft) {
    const leftSlot = byPosition.left[0]!;
    columns.push(leftSlot.width === 'fill' ? '1fr' : `${leftSlot.width}ch`);
  }
  if (hasCenter || (!hasLeft && !hasRight)) {
    columns.push('1fr');
  }
  if (hasRight) {
    const rightSlot = byPosition.right[0]!;
    columns.push(rightSlot.width === 'fill' ? '1fr' : `${rightSlot.width}ch`);
  }

  return {
    columns: columns.join(' '),
    rows: rows.join(' '),
    areas: areas.map((row) => `"${row.join(' ')}"`).join('\n'),
  };
}

export function generateLayoutCSS(
  preset: LayoutPreset,
  containerId: string,
): string {
  const grid = generateGridTemplate(preset.slots);

  const slotStyles = preset.slots
    .map(
      (slot) => `
#${containerId} .patchwork-slot-${slot.id} {
  grid-area: ${slot.id};
  overflow: hidden;
  position: relative;
}
#${containerId} .patchwork-slot-${slot.id} iframe {
  width: 100%;
  height: 100%;
  border: none;
}`,
    )
    .join('\n');

  return `
#${containerId} {
  display: grid;
  grid-template-columns: ${grid.columns};
  grid-template-rows: ${grid.rows};
  grid-template-areas: ${grid.areas};
  width: 100%;
  height: 100%;
  gap: 4px;
}
${slotStyles}
`;
}

export function generateLayoutHTML(
  preset: LayoutPreset,
  containerId: string,
): string {
  const slotDivs = preset.slots
    .map(
      (slot) =>
        `  <div class="patchwork-slot-${slot.id}" data-slot-id="${slot.id}"></div>`,
    )
    .join('\n');

  return `<div id="${containerId}">\n${slotDivs}\n</div>`;
}

interface SlotMount {
  widget: MountedWidget;
  iframe?: HTMLIFrameElement;
  html?: string;
}

export function createBrowserLayoutManager(
  options: BrowserLayoutOptions = {},
): LayoutManager {
  const { services = {}, preset: initialPreset = 'minimal' } = options;
  let currentPreset = getPreset(initialPreset) || PRESETS.minimal!;
  let viewport = { width: 800, height: 600 };
  const mounted = new Map<SlotId, SlotMount>();

  function calculateBounds(): Map<SlotId, SlotBounds> {
    const bounds = new Map<SlotId, SlotBounds>();
    for (const slot of currentPreset.slots) {
      const width =
        slot.width === 'fill' ? Math.floor(viewport.width / 2) : slot.width * 8;
      const height =
        slot.height === 'fill'
          ? Math.floor(viewport.height / 2)
          : slot.height * 16;
      bounds.set(slot.id, { x: 0, y: 0, width, height });
    }
    return bounds;
  }

  const manager: LayoutManager = {
    getPresets(): LayoutPreset[] {
      return Object.values(PRESETS);
    },

    setPreset(name: string): void {
      const preset = getPreset(name);
      if (!preset) throw new Error(`Unknown preset: ${name}`);
      currentPreset = preset;
    },

    getSlots(): Map<SlotId, SlotBounds> {
      return calculateBounds();
    },

    async mount(
      slotId: SlotId,
      widgetPath: string,
      props: Record<string, unknown> = {},
    ): Promise<void> {
      if (!currentPreset.slots.find((s) => s.id === slotId)) {
        throw new Error(`Slot '${slotId}' not found in current layout`);
      }

      this.unmount(slotId);

      const result = await loadWidget(widgetPath);
      if (result.errors.length > 0 || !result.widget) {
        throw new Error(
          `Failed to load widget: ${result.errors
            .map((e) => e.message)
            .join(', ')}`,
        );
      }

      const execResult = await executeBrowserWidget(
        widgetPath,
        result.widget.meta,
        services,
        { props },
      );

      if (!execResult.success) {
        throw new Error(`Failed to execute widget: ${execResult.error}`);
      }

      mounted.set(slotId, {
        widget: { slotId, widgetPath, meta: result.widget.meta, props },
        html: execResult.html,
      });
    },

    unmount(slotId: SlotId): void {
      mounted.delete(slotId);
    },

    unmountAll(): void {
      mounted.clear();
    },

    async applyLayout(spec: LayoutSpec): Promise<void> {
      if (spec.preset) this.setPreset(spec.preset);
      this.unmountAll();

      for (const assignment of spec.slots) {
        await this.mount(
          assignment.slotId,
          assignment.widget,
          assignment.props,
        );
      }
    },

    resize(width: number, height: number): void {
      viewport = { width, height };
    },

    destroy(): void {
      this.unmountAll();
    },
  };

  return manager;
}

export function getLayoutAssets(
  presetName: string,
  containerId = 'patchwork-container',
): { css: string; html: string } {
  const preset = getPreset(presetName);
  if (!preset) throw new Error(`Unknown preset: ${presetName}`);

  return {
    css: generateLayoutCSS(preset, containerId),
    html: generateLayoutHTML(preset, containerId),
  };
}
