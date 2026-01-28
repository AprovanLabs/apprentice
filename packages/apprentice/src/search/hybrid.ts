import type { Client } from '@libsql/client';
import type { EmbeddingProvider } from '../embeddings/types';
import type {
  SearchOptions,
  SearchResult,
  SearchResponse,
  SearchMode,
} from './types';
import {
  searchEventsFts,
  searchAssetsFts,
  type FtsEventResult,
  type FtsAssetResult,
} from './fts';
import {
  searchEventsVector,
  searchAssetsVector,
  hasEventEmbeddings,
  hasAssetEmbeddings,
  type VectorEventResult,
  type VectorAssetResult,
} from './vector';
import { getRelatedContext } from './context';
import { extractVersionFilters } from './version-filters';

const DEFAULT_WEIGHTS = {
  fts: 0.4,
  vector: 0.6,
};

const RRF_K = 60;

// Boost multiplier for results matching all query terms
// Higher values strongly prefer exact multi-term matches over semantic-only matches
const FULL_TERM_MATCH_BOOST = 3.0;
// Minimum terms required to apply boost (single term queries don't need boosting)
const MIN_TERMS_FOR_BOOST = 2;

/**
 * Extract search terms from a query string.
 * Handles quoted phrases and individual words.
 */
function extractQueryTerms(query: string): string[] {
  const terms: string[] = [];
  // Match quoted phrases or individual words
  const regex = /"([^"]+)"|(\S+)/g;
  let match;
  while ((match = regex.exec(query)) !== null) {
    if (!match[1] || !match[2]) continue;
    const term = (match[1] || match[2]).toLowerCase();
    // Skip common stop words and very short terms
    if (
      term.length > 1 &&
      !['the', 'a', 'an', 'is', 'of', 'to', 'in'].includes(term)
    ) {
      terms.push(term);
    }
  }
  return terms;
}

/**
 * Count how many query terms appear in the target text.
 * Returns ratio of matched terms (0.0 to 1.0).
 */
function calculateTermMatchRatio(text: string, queryTerms: string[]): number {
  if (queryTerms.length === 0) return 0;
  const lowerText = text.toLowerCase();
  const matchedTerms = queryTerms.filter((term) => lowerText.includes(term));
  return matchedTerms.length / queryTerms.length;
}

/**
 * Calculate boost multiplier based on term match ratio.
 * Full matches get maximum boost, partial matches get proportional boost.
 */
function calculateTermMatchBoost(
  matchRatio: number,
  termCount: number,
): number {
  if (termCount < MIN_TERMS_FOR_BOOST) return 1.0;
  // Scale boost based on match ratio: 1.0 at 0%, FULL_TERM_MATCH_BOOST at 100%
  return 1.0 + (FULL_TERM_MATCH_BOOST - 1.0) * matchRatio;
}

function calculateRrfScore(rank: number, weight: number): number {
  return weight / (RRF_K + rank);
}

function normalizeFtsEventScores(results: FtsEventResult[]): FtsEventResult[] {
  if (results.length === 0) return results;
  const maxScore = Math.max(...results.map((r) => r.score));
  const minScore = Math.min(...results.map((r) => r.score));
  const range = maxScore - minScore || 1;
  return results.map((r) => ({ ...r, score: (r.score - minScore) / range }));
}

function normalizeFtsAssetScores(results: FtsAssetResult[]): FtsAssetResult[] {
  if (results.length === 0) return results;
  const maxScore = Math.max(...results.map((r) => r.score));
  const minScore = Math.min(...results.map((r) => r.score));
  const range = maxScore - minScore || 1;
  return results.map((r) => ({ ...r, score: (r.score - minScore) / range }));
}

function normalizeVectorEventResults(
  results: VectorEventResult[],
): Array<VectorEventResult & { score: number }> {
  if (results.length === 0) return [];
  return results.map((r) => ({ ...r, score: 1 - r.distance / 2 }));
}

function normalizeVectorAssetResults(
  results: VectorAssetResult[],
): Array<VectorAssetResult & { score: number }> {
  if (results.length === 0) return [];
  return results.map((r) => ({ ...r, score: 1 - r.distance / 2 }));
}

export async function search(
  db: Client,
  embeddingProvider: EmbeddingProvider | null,
  options: SearchOptions,
): Promise<SearchResponse> {
  const startTime = Date.now();
  const {
    query,
    limit = 20,
    offset = 0,
    mode = 'hybrid',
    scope = { events: true, assets: false },
    hybridWeights,
    filters,
    ...filterOptions
  } = options;

  const { versionFilter, regularFilters } = extractVersionFilters(filters);

  const weights = {
    fts: hybridWeights?.fts ?? DEFAULT_WEIGHTS.fts,
    vector: hybridWeights?.vector ?? DEFAULT_WEIGHTS.vector,
  };

  const canUseVectorEvents = !!(
    embeddingProvider &&
    scope.events &&
    (await hasEventEmbeddings(db))
  );
  const canUseVectorAssets = !!(
    embeddingProvider &&
    scope.assets &&
    !versionFilter &&
    (await hasAssetEmbeddings(db))
  );
  const canUseVector = canUseVectorEvents || canUseVectorAssets;

  let effectiveMode: SearchMode = mode;
  if (mode === 'vector' && !canUseVector) {
    effectiveMode = 'fts';
  }
  if (mode === 'hybrid' && !canUseVector) {
    effectiveMode = 'fts';
  }

  const searchOpts = {
    limit: limit * 2,
    filters: regularFilters,
    versionFilter,
    ...filterOptions,
  };
  const results: SearchResult[] = [];

  const queryTerms = extractQueryTerms(query);
  const termCount = queryTerms.length;

  if (scope.events) {
    let ftsEventResults: FtsEventResult[] = [];
    let vectorEventResults: VectorEventResult[] = [];

    if (effectiveMode === 'fts' || effectiveMode === 'hybrid') {
      ftsEventResults = await searchEventsFts(db, query, searchOpts);
    }

    if (
      (effectiveMode === 'vector' || effectiveMode === 'hybrid') &&
      embeddingProvider &&
      canUseVectorEvents
    ) {
      try {
        vectorEventResults = await searchEventsVector(
          db,
          query,
          embeddingProvider,
          searchOpts,
        );
      } catch (error) {
        console.warn('Vector event search failed:', error);
        if (effectiveMode === 'vector') {
          effectiveMode = 'fts';
          ftsEventResults = await searchEventsFts(db, query, searchOpts);
        }
      }
    }

    if (effectiveMode === 'fts' || vectorEventResults.length === 0) {
      results.push(
        ...ftsEventResults.map((r) => ({
          type: 'event' as const,
          item: r.event,
          score: r.score,
          matchType: 'fts' as const,
          ftsScore: r.score,
        })),
      );
    } else if (effectiveMode === 'vector' || ftsEventResults.length === 0) {
      const normalized = normalizeVectorEventResults(vectorEventResults);
      results.push(
        ...normalized.map((r) => ({
          type: 'event' as const,
          item: r.event,
          score: r.score,
          matchType: 'vector' as const,
          vectorDistance: r.distance,
        })),
      );
    } else {
      const eventScores = new Map<
        string,
        {
          event: (typeof ftsEventResults)[0]['event'];
          rrfScore: number;
          ftsRank?: number;
          vectorRank?: number;
          ftsScore?: number;
          vectorDistance?: number;
          termMatchRatio?: number;
        }
      >();

      const normalizedFts = normalizeFtsEventScores(ftsEventResults);
      normalizedFts.forEach((result, rank) => {
        // Calculate term match ratio for this result
        const matchRatio = calculateTermMatchRatio(
          result.event.message,
          queryTerms,
        );
        const boost = calculateTermMatchBoost(matchRatio, termCount);
        const rrfContribution =
          calculateRrfScore(rank + 1, weights.fts) * boost;
        eventScores.set(result.event.id, {
          event: result.event,
          rrfScore: rrfContribution,
          ftsRank: rank + 1,
          ftsScore: result.score,
          termMatchRatio: matchRatio,
        });
      });

      const normalizedVector = normalizeVectorEventResults(vectorEventResults);
      normalizedVector.forEach((result, rank) => {
        const existing = eventScores.get(result.event.id);
        // Also calculate boost for vector-only results
        const matchRatio = calculateTermMatchRatio(
          result.event.message,
          queryTerms,
        );
        const boost = calculateTermMatchBoost(matchRatio, termCount);
        const rrfContribution =
          calculateRrfScore(rank + 1, weights.vector) * boost;

        if (existing) {
          existing.rrfScore += rrfContribution;
          existing.vectorRank = rank + 1;
          existing.vectorDistance = result.distance;
        } else {
          eventScores.set(result.event.id, {
            event: result.event,
            rrfScore: rrfContribution,
            vectorRank: rank + 1,
            vectorDistance: result.distance,
            termMatchRatio: matchRatio,
          });
        }
      });

      const sortedResults = Array.from(eventScores.values()).sort(
        (a, b) => b.rrfScore - a.rrfScore,
      );

      results.push(
        ...sortedResults.map((r) => ({
          type: 'event' as const,
          item: r.event,
          score: r.rrfScore,
          matchType: (r.ftsRank && r.vectorRank
            ? 'both'
            : r.ftsRank
            ? 'fts'
            : 'vector') as 'fts' | 'vector' | 'both',
          ftsScore: r.ftsScore,
          vectorDistance: r.vectorDistance,
        })),
      );
    }
  }

  if (scope.assets) {
    let ftsAssetResults: FtsAssetResult[] = [];
    let vectorAssetResults: VectorAssetResult[] = [];

    if (effectiveMode === 'fts' || effectiveMode === 'hybrid') {
      ftsAssetResults = await searchAssetsFts(db, query, searchOpts);
    }

    if (
      (effectiveMode === 'vector' || effectiveMode === 'hybrid') &&
      embeddingProvider &&
      canUseVectorAssets
    ) {
      try {
        vectorAssetResults = await searchAssetsVector(
          db,
          query,
          embeddingProvider,
          searchOpts,
        );
      } catch (error) {
        console.warn('Vector asset search failed:', error);
        if (effectiveMode === 'vector') {
          effectiveMode = 'fts';
          ftsAssetResults = await searchAssetsFts(db, query, searchOpts);
        }
      }
    }

    if (effectiveMode === 'fts' || vectorAssetResults.length === 0) {
      results.push(
        ...ftsAssetResults.map((r) => ({
          type: 'asset' as const,
          item: r.asset,
          score: r.score,
          matchType: 'fts' as const,
          ftsScore: r.score,
        })),
      );
    } else if (effectiveMode === 'vector' || ftsAssetResults.length === 0) {
      const normalized = normalizeVectorAssetResults(vectorAssetResults);
      results.push(
        ...normalized.map((r) => ({
          type: 'asset' as const,
          item: r.asset,
          score: r.score,
          matchType: 'vector' as const,
          vectorDistance: r.distance,
        })),
      );
    } else {
      const assetScores = new Map<
        string,
        {
          asset: (typeof ftsAssetResults)[0]['asset'];
          rrfScore: number;
          ftsRank?: number;
          vectorRank?: number;
          ftsScore?: number;
          vectorDistance?: number;
          termMatchRatio?: number;
        }
      >();

      const normalizedFts = normalizeFtsAssetScores(ftsAssetResults);
      normalizedFts.forEach((result, rank) => {
        // For assets, check both key and id for term matches
        const searchText = `${result.asset.id} ${result.asset.key}`;
        const matchRatio = calculateTermMatchRatio(searchText, queryTerms);
        const boost = calculateTermMatchBoost(matchRatio, termCount);
        const rrfContribution =
          calculateRrfScore(rank + 1, weights.fts) * boost;
        assetScores.set(result.asset.id, {
          asset: result.asset,
          rrfScore: rrfContribution,
          ftsRank: rank + 1,
          ftsScore: result.score,
          termMatchRatio: matchRatio,
        });
      });

      const normalizedVector = normalizeVectorAssetResults(vectorAssetResults);
      normalizedVector.forEach((result, rank) => {
        const existing = assetScores.get(result.asset.id);
        const searchText = `${result.asset.id} ${result.asset.key}`;
        const matchRatio = calculateTermMatchRatio(searchText, queryTerms);
        const boost = calculateTermMatchBoost(matchRatio, termCount);
        const rrfContribution =
          calculateRrfScore(rank + 1, weights.vector) * boost;

        if (existing) {
          existing.rrfScore += rrfContribution;
          existing.vectorRank = rank + 1;
          existing.vectorDistance = result.distance;
        } else {
          assetScores.set(result.asset.id, {
            asset: result.asset,
            rrfScore: rrfContribution,
            vectorRank: rank + 1,
            vectorDistance: result.distance,
            termMatchRatio: matchRatio,
          });
        }
      });

      const sortedResults = Array.from(assetScores.values()).sort(
        (a, b) => b.rrfScore - a.rrfScore,
      );

      results.push(
        ...sortedResults.map((r) => ({
          type: 'asset' as const,
          item: r.asset,
          score: r.rrfScore,
          matchType: (r.ftsRank && r.vectorRank
            ? 'both'
            : r.ftsRank
            ? 'fts'
            : 'vector') as 'fts' | 'vector' | 'both',
          ftsScore: r.ftsScore,
          vectorDistance: r.vectorDistance,
        })),
      );
    }
  }

  results.sort((a, b) => b.score - a.score);
  const paginatedResults = results.slice(offset, offset + limit);

  if (options.related && scope.events) {
    await Promise.all(
      paginatedResults.map(async (result) => {
        if (result.type === 'event') {
          const eventResult = result as Extract<
            (typeof paginatedResults)[number],
            { type: 'event' }
          >;
          eventResult.context = await getRelatedContext(db, eventResult.item, {
            strategy: options.strategy,
            windowSeconds: options.windowSeconds,
            limit: options.relatedLimit,
          });
        }
      }),
    );
  }

  return {
    results: paginatedResults,
    total: results.length,
    mode: effectiveMode,
    durationMs: Date.now() - startTime,
    embeddingsAvailable: canUseVector,
  };
}
