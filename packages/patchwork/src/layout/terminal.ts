// Terminal Layout Manager - Slot-based terminal layout using Ink

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
import { type WidgetInstance } from '../runtime/terminal/index.js';
import { loadWidget } from '../runtime/loader.js';
import type { Services } from '../runtime/types.js';

type InkModule = typeof import('ink');
type ReactModule = typeof import('react');

let inkModule: InkModule | null = null;
let reactModule: ReactModule | null = null;

async function getInk(): Promise<InkModule> {
  if (!inkModule) inkModule = await import('ink');
  return inkModule;
}

async function getReact(): Promise<ReactModule> {
  if (!reactModule) reactModule = await import('react');
  return reactModule;
}

function getTerminalSize(): { width: number; height: number } {
  return {
    width: process.stdout.columns || 80,
    height: process.stdout.rows || 24,
  };
}

function calculateSlotBounds(
  slots: SlotDefinition[],
  viewportWidth: number,
  viewportHeight: number,
): Map<SlotId, SlotBounds> {
  const bounds = new Map<SlotId, SlotBounds>();
  let usedTop = 0;
  let usedBottom = 0;
  let usedLeft = 0;
  let usedRight = 0;

  const byPosition = {
    top: slots.filter((s) => s.position === 'top'),
    bottom: slots.filter((s) => s.position === 'bottom'),
    left: slots.filter((s) => s.position === 'left'),
    right: slots.filter((s) => s.position === 'right'),
    center: slots.filter((s) => s.position === 'center'),
  };

  for (const slot of byPosition.top) {
    const height =
      slot.height === 'fill'
        ? Math.floor((viewportHeight - usedTop - usedBottom) / 2)
        : slot.height;
    bounds.set(slot.id, { x: 0, y: usedTop, width: viewportWidth, height });
    usedTop += height;
  }

  for (const slot of byPosition.bottom) {
    const height =
      slot.height === 'fill'
        ? Math.floor((viewportHeight - usedTop - usedBottom) / 2)
        : slot.height;
    bounds.set(slot.id, {
      x: 0,
      y: viewportHeight - usedBottom - height,
      width: viewportWidth,
      height,
    });
    usedBottom += height;
  }

  const middleHeight = viewportHeight - usedTop - usedBottom;

  for (const slot of byPosition.left) {
    const width =
      slot.width === 'fill'
        ? Math.floor((viewportWidth - usedLeft - usedRight) / 3)
        : slot.width;
    bounds.set(slot.id, {
      x: usedLeft,
      y: usedTop,
      width,
      height: middleHeight,
    });
    usedLeft += width;
  }

  for (const slot of byPosition.right) {
    const width =
      slot.width === 'fill'
        ? Math.floor((viewportWidth - usedLeft - usedRight) / 3)
        : slot.width;
    bounds.set(slot.id, {
      x: viewportWidth - usedRight - width,
      y: usedTop,
      width,
      height: middleHeight,
    });
    usedRight += width;
  }

  const centerWidth = viewportWidth - usedLeft - usedRight;
  for (const slot of byPosition.center) {
    bounds.set(slot.id, {
      x: usedLeft,
      y: usedTop,
      width: centerWidth,
      height: middleHeight,
    });
  }

  return bounds;
}

export interface TerminalLayoutManagerOptions {
  services?: Services;
  preset?: string;
}

interface SlotInstance {
  widget: MountedWidget;
  instance: WidgetInstance | null;
}

export function createTerminalLayoutManager(
  options: TerminalLayoutManagerOptions = {},
): LayoutManager {
  const { preset: initialPreset = 'minimal' } = options;
  let currentPreset = getPreset(initialPreset) || PRESETS.minimal!;
  let viewport = getTerminalSize();
  let slots = calculateSlotBounds(
    currentPreset.slots,
    viewport.width,
    viewport.height,
  );
  const mounted = new Map<SlotId, SlotInstance>();
  let resizeHandler: (() => void) | null = null;

  function setupResizeHandler() {
    if (resizeHandler) return;
    resizeHandler = () =>
      manager.resize(process.stdout.columns, process.stdout.rows);
    process.stdout.on('resize', resizeHandler);
  }

  function cleanupResizeHandler() {
    if (resizeHandler) {
      process.stdout.off('resize', resizeHandler);
      resizeHandler = null;
    }
  }

  const manager: LayoutManager = {
    getPresets(): LayoutPreset[] {
      return Object.values(PRESETS);
    },

    setPreset(name: string): void {
      const preset = getPreset(name);
      if (!preset) throw new Error(`Unknown preset: ${name}`);
      currentPreset = preset;
      slots = calculateSlotBounds(
        preset.slots,
        viewport.width,
        viewport.height,
      );
    },

    getSlots(): Map<SlotId, SlotBounds> {
      return new Map(slots);
    },

    async mount(
      slotId: SlotId,
      widgetPath: string,
      props: Record<string, unknown> = {},
    ): Promise<void> {
      const slotBounds = slots.get(slotId);
      if (!slotBounds)
        throw new Error(`Slot '${slotId}' not found in current layout`);

      this.unmount(slotId);

      const result = await loadWidget(widgetPath);
      if (result.errors.length > 0 || !result.widget) {
        throw new Error(
          `Failed to load widget: ${result.errors
            .map((e) => e.message)
            .join(', ')}`,
        );
      }

      const mountedWidget: MountedWidget = {
        slotId,
        widgetPath,
        meta: result.widget.meta,
        props,
      };

      mounted.set(slotId, { widget: mountedWidget, instance: null });
      setupResizeHandler();
    },

    unmount(slotId: SlotId): void {
      const slot = mounted.get(slotId);
      if (slot?.instance) {
        slot.instance.unmount();
      }
      mounted.delete(slotId);
    },

    unmountAll(): void {
      for (const slotId of mounted.keys()) {
        this.unmount(slotId);
      }
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
      slots = calculateSlotBounds(currentPreset.slots, width, height);
    },

    destroy(): void {
      this.unmountAll();
      cleanupResizeHandler();
    },
  };

  return manager;
}

export async function renderLayout(
  manager: LayoutManager,
  _services: Services = {},
): Promise<{ unmount: () => void }> {
  const ink = await getInk();
  const React = await getReact();
  const slots = manager.getSlots();

  const LayoutView = () => {
    const elements: React.ReactElement[] = [];

    for (const [slotId, bounds] of slots) {
      elements.push(
        React.createElement(
          ink.Box,
          {
            key: slotId,
            width: bounds.width,
            height: bounds.height,
            borderStyle: 'single',
            borderColor: 'gray',
          },
          React.createElement(ink.Text, { dimColor: true }, `[${slotId}]`),
        ),
      );
    }

    return React.createElement(ink.Box, { flexDirection: 'column' }, elements);
  };

  const instance = ink.render(React.createElement(LayoutView), {
    exitOnCtrlC: true,
  });

  return {
    unmount: () => {
      instance.unmount();
      manager.destroy();
    },
  };
}
