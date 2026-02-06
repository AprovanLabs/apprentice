// Terminal Layout Manager - Slot-based terminal layout using image-provided rendering
//
// This layout manager is framework-agnostic. The actual rendering is delegated
// to the terminal image (e.g., @aprovan/patchwork-ink) which provides React/Ink.

import type {
  LayoutManager,
  LayoutSpec,
  SlotId,
  SlotBounds,
  SlotDefinition,
  MountedWidget,
} from './types';
import { type WidgetInstance } from '../runtime/terminal/index';
import { loadWidget } from '../runtime/loader';
import type { Services } from '../runtime/types';

/**
 * Terminal Image interface for layout rendering
 */
interface TerminalLayoutImageModule {
  /** Re-exported React for creating elements */
  React: {
    createElement: (
      type: unknown,
      props?: Record<string, unknown> | null,
      ...children: unknown[]
    ) => unknown;
  };
  /** Re-exported Ink Box component */
  Box: unknown;
  /** Re-exported Ink Text component */
  Text: unknown;
  /** Render function */
  render: (
    element: unknown,
    options?: { exitOnCtrlC?: boolean },
  ) => {
    unmount: () => void;
    waitUntilExit: () => Promise<void>;
    rerender: (element: unknown) => void;
  };
}

// Cache for the loaded image
let layoutImageModule: TerminalLayoutImageModule | null = null;

async function loadLayoutImage(
  imageName = '@aprovan/patchwork-ink',
): Promise<TerminalLayoutImageModule> {
  if (layoutImageModule) return layoutImageModule;

  try {
    const imageModule = (await import(imageName)) as TerminalLayoutImageModule;

    if (!imageModule.React || !imageModule.render || !imageModule.Box) {
      throw new Error(
        `Terminal image '${imageName}' missing required exports: React, render, Box, Text`,
      );
    }

    layoutImageModule = imageModule;
    return imageModule;
  } catch (err) {
    throw new Error(
      `Failed to load terminal image '${imageName}': ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
}

/**
 * Clear the cached layout image module
 */
export function clearLayoutImageCache(): void {
  layoutImageModule = null;
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
  slots?: SlotDefinition[];
}

interface SlotInstance {
  widget: MountedWidget;
  instance: WidgetInstance | null;
}

const DEFAULT_SLOTS: SlotDefinition[] = [
  { id: 'main', position: 'center', width: 'fill', height: 'fill' },
  { id: 'status', position: 'bottom', width: 'fill', height: 3 },
];

export function createTerminalLayoutManager(
  options: TerminalLayoutManagerOptions = {},
): LayoutManager {
  const slotDefs = options.slots ?? DEFAULT_SLOTS;
  let viewport = getTerminalSize();
  let slots = calculateSlotBounds(slotDefs, viewport.width, viewport.height);
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
      slots = calculateSlotBounds(slotDefs, width, height);
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
  imageName = '@aprovan/patchwork-ink',
): Promise<{ unmount: () => void }> {
  const image = await loadLayoutImage(imageName);
  const { React, Box, Text, render } = image;
  const slots = manager.getSlots();

  const LayoutView = () => {
    const elements: unknown[] = [];

    for (const [slotId, bounds] of slots) {
      elements.push(
        React.createElement(
          Box,
          {
            key: slotId,
            width: bounds.width,
            height: bounds.height,
            borderStyle: 'single',
            borderColor: 'gray',
          },
          React.createElement(Text, { dimColor: true }, `[${slotId}]`),
        ),
      );
    }

    return React.createElement(Box, { flexDirection: 'column' }, elements);
  };

  const instance = render(React.createElement(LayoutView), {
    exitOnCtrlC: true,
  });

  return {
    unmount: () => {
      instance.unmount();
      manager.destroy();
    },
  };
}
