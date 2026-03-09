/**
 * 评分模块入口
 *
 * 提供记忆评分的高级封装功能。
 */

export {
  ImportanceScorer,
  calculateImportance,
  getDefaultImportance,
  ImportanceScorerConfigSchema,
  type ImportanceScorerConfig,
  type ImportanceFactors,
  type ScoringWeights,
} from './importance-scorer';
