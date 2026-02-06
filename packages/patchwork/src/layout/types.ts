// Layout Types - Types for slot-based layout system

import type { WidgetMeta } from '../runtime/types';

export type SlotPosition = 'top' | 'bottom' | 'left' | 'right' | 'center';
export type SlotId = string;

export interface SlotDefinition {
  id: SlotId;
  position: SlotPosition;
  width: number | 'fill';
  height: number | 'fill';
  minWidth?: number;
  minHeight?: number;
  maxWidth?: number;
  maxHeight?: number;
}

export interface SlotBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface MountedWidget {
  slotId: SlotId;
  widgetPath: string;
  meta: WidgetMeta;
  props: Record<string, unknown>;
}

export interface LayoutState {
  slots: Map<SlotId, SlotBounds>;
  mounted: Map<SlotId, MountedWidget>;
  viewport: { width: number; height: number };
}

export interface LayoutAssignment {
  slotId: SlotId;
  widget: string;
  props?: Record<string, unknown>;
}

export interface LayoutSpec {
  slots: LayoutAssignment[];
}

export interface LayoutManager {
  getSlots(): Map<SlotId, SlotBounds>;
  mount(
    slotId: SlotId,
    widgetPath: string,
    props?: Record<string, unknown>,
  ): Promise<void>;
  unmount(slotId: SlotId): void;
  unmountAll(): void;
  applyLayout(spec: LayoutSpec): Promise<void>;
  resize(width: number, height: number): void;
  destroy(): void;
}
