// Rule-Based Selector - Fallback widget selection when LLM is unavailable

import {
  Widget,
  WidgetMetadata,
  AggregatedContext,
  Viewport,
  WidgetSuggestion,
  UsageRecord,
} from './types';

/**
 * Scoring weights for rule-based selection
 */
const WEIGHTS = {
  tagMatch: 0.35,
  usageHistory: 0.25,
  dimensionFit: 0.25,
  informationDensity: 0.15,
};

/**
 * Calculate tag overlap score between widget tags and context
 * Returns 0-1 where 1 is perfect overlap
 */
function calculateTagOverlap(
  tags: string[],
  context: AggregatedContext,
): number {
  if (tags.length === 0) return 0;

  // Extract all text from context to match against
  const contextText = extractContextText(context).toLowerCase();
  const contextWords = new Set(contextText.split(/\s+/).filter(Boolean));

  let matchCount = 0;
  for (const tag of tags) {
    const tagLower = tag.toLowerCase();
    // Check if tag appears in context text or matches any context word
    if (
      contextText.includes(tagLower) ||
      contextWords.has(tagLower) ||
      Array.from(contextWords).some(
        (word) => word.includes(tagLower) || tagLower.includes(word),
      )
    ) {
      matchCount++;
    }
  }

  return matchCount / tags.length;
}

/**
 * Extract searchable text from context
 */
function extractContextText(context: AggregatedContext): string {
  const parts: string[] = [];

  for (const [providerName, providerContext] of Object.entries(
    context.providers,
  )) {
    parts.push(providerName);
    for (const [key, value] of Object.entries(providerContext)) {
      parts.push(key);
      if (typeof value === 'string') {
        parts.push(value);
      } else if (Array.isArray(value)) {
        parts.push(...value.filter((v) => typeof v === 'string'));
      }
    }
  }

  return parts.join(' ');
}

/**
 * Calculate usage score based on recent usage history
 * Returns 0-1 where 1 is most recently/frequently used
 */
function calculateUsageScore(
  widgetName: string,
  usageHistory: UsageRecord[],
): number {
  if (usageHistory.length === 0) return 0;

  const widgetUsage = usageHistory.filter((r) => r.widget_name === widgetName);
  if (widgetUsage.length === 0) return 0;

  // Score based on frequency and recency
  const totalUsage = usageHistory.length;
  const widgetCount = widgetUsage.length;
  const frequencyScore = Math.min(widgetCount / Math.max(totalUsage, 1), 1);

  // Recency: how recently was this widget used?
  const mostRecent = widgetUsage[widgetUsage.length - 1];
  if (!mostRecent) return frequencyScore * 0.5;

  const now = Date.now();
  const lastUsedMs = new Date(mostRecent.timestamp).getTime();
  const hoursSinceUse = (now - lastUsedMs) / (1000 * 60 * 60);

  // Decay: full score if used in last hour, decaying over 24 hours
  const recencyScore = Math.max(0, 1 - hoursSinceUse / 24);

  return frequencyScore * 0.5 + recencyScore * 0.5;
}

/**
 * Calculate dimension fit score
 * Returns 0-1 where 1 is perfect fit, 0 is doesn't fit at all
 */
function calculateDimensionFit(
  dimensions: WidgetMetadata['dimensions'],
  viewport: Viewport,
): number {
  // Widget doesn't fit at all
  if (
    dimensions.min_width > viewport.width ||
    dimensions.min_height > viewport.height
  ) {
    return 0;
  }

  // Calculate how well the preferred size fits
  const preferredWidth = Math.min(dimensions.max_width, viewport.width);
  const preferredHeight = Math.min(dimensions.max_height, viewport.height);

  // Calculate space utilization (how much of viewport is used)
  const widthUtilization = preferredWidth / viewport.width;
  const heightUtilization = preferredHeight / viewport.height;

  // Prefer widgets that use 30-70% of space (not too small, not too big)
  const optimalUtilization = (utilization: number) => {
    if (utilization < 0.3) return utilization / 0.3;
    if (utilization > 0.7) return 1 - (utilization - 0.7) / 0.3;
    return 1;
  };

  return (
    optimalUtilization(widthUtilization) * 0.5 +
    optimalUtilization(heightUtilization) * 0.5
  );
}

/**
 * Calculate density bonus
 * High-density widgets get a bonus, especially for ambient positions
 */
function calculateDensityBonus(density: 'low' | 'medium' | 'high'): number {
  switch (density) {
    case 'high':
      return WEIGHTS.informationDensity;
    case 'medium':
      return WEIGHTS.informationDensity * 0.5;
    case 'low':
      return 0;
  }
}

/**
 * Score a widget based on context and viewport
 */
export function scoreWidget(
  widget: Widget,
  context: AggregatedContext,
  viewport: Viewport,
  usageHistory: UsageRecord[],
): number {
  const tagScore = calculateTagOverlap(widget.metadata.tags, context);
  const usageScore = calculateUsageScore(widget.metadata.name, usageHistory);
  const fitScore = calculateDimensionFit(widget.metadata.dimensions, viewport);
  const densityBonus = calculateDensityBonus(
    widget.metadata.dimensions.information_density,
  );

  return (
    tagScore * WEIGHTS.tagMatch +
    usageScore * WEIGHTS.usageHistory +
    fitScore * WEIGHTS.dimensionFit +
    densityBonus
  );
}

/**
 * Determine position based on widget dimensions and score
 */
function determinePosition(
  widget: Widget,
  score: number,
  viewport: Viewport,
): 'primary' | 'secondary' | 'ambient' {
  const dims = widget.metadata.dimensions;

  // High-density, small widgets are ambient
  if (
    dims.information_density === 'high' &&
    dims.max_width < viewport.width * 0.3 &&
    dims.max_height < viewport.height * 0.3
  ) {
    return 'ambient';
  }

  // High score and larger size = primary
  if (score > 0.7 && dims.max_width > viewport.width * 0.4) {
    return 'primary';
  }

  return 'secondary';
}

/**
 * Calculate suggested size for a widget
 */
function calculateSuggestedSize(
  widget: Widget,
  position: 'primary' | 'secondary' | 'ambient',
  viewport: Viewport,
): { width: number; height: number } {
  const dims = widget.metadata.dimensions;

  let targetWidth: number;
  let targetHeight: number;

  switch (position) {
    case 'primary':
      // Primary takes up to 60-80% of viewport
      targetWidth = Math.min(
        Math.max(dims.min_width, viewport.width * 0.7),
        dims.max_width,
      );
      break;
    case 'secondary':
      // Secondary takes 30-50% of viewport
      targetWidth = Math.min(
        Math.max(dims.min_width, viewport.width * 0.4),
        dims.max_width,
      );
      break;
    case 'ambient':
      // Ambient uses minimum comfortable size
      targetWidth = Math.min(
        Math.max(dims.min_width, viewport.width * 0.2),
        dims.max_width,
      );
      break;
  }

  // Calculate height based on preferred ratio
  targetHeight = Math.round(targetWidth / dims.preferred_ratio);

  // Clamp to min/max
  targetHeight = Math.max(
    dims.min_height,
    Math.min(dims.max_height, targetHeight),
  );
  targetWidth = Math.max(dims.min_width, Math.min(dims.max_width, targetWidth));

  // Ensure fits in viewport
  if (targetWidth > viewport.width) targetWidth = viewport.width;
  if (targetHeight > viewport.height) targetHeight = viewport.height;

  return { width: Math.round(targetWidth), height: Math.round(targetHeight) };
}

/**
 * Generate reason string for widget selection
 */
function generateReason(
  widget: Widget,
  context: AggregatedContext,
  _score: number,
): string {
  const reasons: string[] = [];

  // Check for tag matches
  const contextText = extractContextText(context).toLowerCase();
  const matchingTags = widget.metadata.tags.filter((tag) =>
    contextText.includes(tag.toLowerCase()),
  );

  if (matchingTags.length > 0) {
    reasons.push(`Tags match: ${matchingTags.slice(0, 3).join(', ')}`);
  }

  if (widget.metadata.usage_count > 0) {
    reasons.push(`Used ${widget.metadata.usage_count} times`);
  }

  if (widget.metadata.dimensions.information_density === 'high') {
    reasons.push('High information density');
  }

  return reasons.length > 0 ? reasons.join('; ') : 'General relevance';
}

/**
 * Select widgets using rule-based scoring
 */
export function selectWidgetsRuleBased(
  widgets: Widget[],
  context: AggregatedContext,
  viewport: Viewport,
  usageHistory: UsageRecord[],
  limit: number = 5,
): WidgetSuggestion[] {
  // Filter widgets that don't fit in viewport
  const fittingWidgets = widgets.filter(
    (w) =>
      w.metadata.dimensions.min_width <= viewport.width &&
      w.metadata.dimensions.min_height <= viewport.height,
  );

  // Score all widgets
  const scored = fittingWidgets.map((widget) => ({
    widget,
    score: scoreWidget(widget, context, viewport, usageHistory),
  }));

  // Sort by score descending
  scored.sort((a, b) => b.score - a.score);

  // Take top N
  const topWidgets = scored.slice(0, limit);

  // Convert to suggestions
  const suggestions: WidgetSuggestion[] = [];
  let hasPrimary = false;

  for (const { widget, score } of topWidgets) {
    let position = determinePosition(widget, score, viewport);

    // Only one primary
    if (position === 'primary') {
      if (hasPrimary) {
        position = 'secondary';
      } else {
        hasPrimary = true;
      }
    }

    const suggestedSize = calculateSuggestedSize(widget, position, viewport);

    suggestions.push({
      name: widget.metadata.name,
      confidence: Math.min(score, 1),
      position,
      reason: generateReason(widget, context, score),
      suggested_size: suggestedSize,
    });
  }

  return suggestions;
}
