/**
 * 检索模块入口
 *
 * 提供记忆检索的核心组件。
 */

// FTS5 全文检索
export { FTSSearcher } from './fts-searcher';
export type {
  FTSSearchOptions,
  FTSSearchResult,
  FTSSearcherConfig,
} from './fts-searcher';

// RRF 融合算法
export { RRFFusion, rrfUtils } from './rrf-fusion';
export type {
  SearchResult,
  RRFFusionConfig,
} from './rrf-fusion';

// 时间衰减
export { TemporalDecayScorer, forgettingCurve } from './temporal-decay';
export type { TemporalDecayConfig } from './temporal-decay';

// 混合检索器
export { HybridSearcher } from './hybrid-searcher';
export type {
  VectorSearcher,
  HybridSearcherConfig,
  HybridSearchMode,
} from './hybrid-searcher';

// 检索模式选择器
export {
  RetrievalModeSelector,
  selectRetrievalMode,
} from './retrieval-mode-selector';
export type { RetrievalMode, ModeSelectorConfig } from './retrieval-mode-selector';

// 结果排序器
export { ResultSorter } from './result-sorter';
export type {
  SortOptions,
  PaginationOptions,
  SortedResult,
} from './result-sorter';

// 降级检索器
export { FallbackSearcher } from './fallback-searcher';
export type {
  Searcher,
  FallbackConfig,
} from './fallback-searcher';
