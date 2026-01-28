// Layout Presets - Standard slot configurations

import type { LayoutPreset } from './types.js';

export const PRESETS: Record<string, LayoutPreset> = {
  dashboard: {
    name: 'dashboard',
    description: 'Full dashboard with top banner and sidebar',
    slots: [
      { id: 'banner', position: 'top', width: 'fill', height: 8 },
      { id: 'sidebar-left', position: 'left', width: 20, height: 'fill' },
      { id: 'main', position: 'center', width: 'fill', height: 'fill' },
      { id: 'sidebar-right', position: 'right', width: 20, height: 'fill' },
    ],
  },
  sidebar: {
    name: 'sidebar',
    description: 'Single sidebar with main content',
    slots: [
      { id: 'sidebar', position: 'left', width: 25, height: 'fill' },
      { id: 'main', position: 'center', width: 'fill', height: 'fill' },
    ],
  },
  split: {
    name: 'split',
    description: 'Two-panel horizontal split',
    slots: [
      { id: 'left', position: 'left', width: 'fill', height: 'fill' },
      { id: 'right', position: 'right', width: 'fill', height: 'fill' },
    ],
  },
  stacked: {
    name: 'stacked',
    description: 'Vertically stacked panels',
    slots: [
      { id: 'top', position: 'top', width: 'fill', height: 'fill' },
      { id: 'bottom', position: 'bottom', width: 'fill', height: 'fill' },
    ],
  },
  minimal: {
    name: 'minimal',
    description: 'Single ambient slot',
    slots: [{ id: 'status', position: 'bottom', width: 'fill', height: 3 }],
  },
  focus: {
    name: 'focus',
    description: 'Primary content with ambient status',
    slots: [
      { id: 'main', position: 'center', width: 'fill', height: 'fill' },
      { id: 'status', position: 'bottom', width: 'fill', height: 4 },
    ],
  },
};

export function getPreset(name: string): LayoutPreset | undefined {
  return PRESETS[name];
}

export function getPresetNames(): string[] {
  return Object.keys(PRESETS);
}
