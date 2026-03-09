/**
 * 语义记忆检索 - 集成测试
 *
 * 验证语义检索和模糊查询功能：
 * - T021: 记忆分类器
 * - T022: 重要性评分算法
 * - T023: 向量存储流程
 * - T024: 检索结果排序
 * - T025-T028: API 和集成
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { join } from 'path';
import { rm } from 'fs/promises';
import { MemoryClassifier, classifyMemory, getMemoryTypeDescription, ImportanceScorer, calculateImportance, getDefaultImportance } from '@micro-agent/sdk';
import { ResultSorter } from '../../runtime/capability/memory/searcher/result-sorter';
import { FTSSearcher } from '../../runtime/capability/memory/searcher/fts-searcher';
import { HybridSearcher } from '../../runtime/capability/memory/searcher/hybrid-searcher';
import { FallbackSearcher, type Searcher } from '../../runtime/capability/memory/searcher/fallback-searcher';
import { RRFFusion } from '../../runtime/capability/memory/searcher/rrf-fusion';
import { TemporalDecayScorer, forgettingCurve } from '../../runtime/capability/memory/searcher/temporal-decay';
import type { MemoryEntry, MemoryType, MemorySearchResult } from '../../types/memory';

// 测试数据存储路径
const TEST_STORAGE_PATH = join(__dirname, '.test-memory-us2');

// ========== Mock 数据 ==========

/** 创建测试记忆条目 */
function createTestEntry(overrides: Partial<MemoryEntry> = {}): MemoryEntry {
  return {
    id: crypto.randomUUID(),
    type: 'fact',
    content: '这是一条测试记忆',
    createdAt: new Date(),
    accessedAt: new Date(),
    accessCount: 0,
    importance: 0.5,
    stability: 1.0,
    status: 'active',
    ...overrides,
  };
}

/** 测试记忆数据集 */
const TEST_MEMORIES: Array<{ content: string; type: MemoryType }> = [
  { content: '我喜欢使用 TypeScript 编写代码', type: 'preference' },
  { content: '我讨厌冗长的文档说明', type: 'preference' },
  { content: '我的工作是一名软件工程师', type: 'fact' },
  { content: '我们决定使用 Bun 作为运行时', type: 'decision' },
  { content: '我的邮箱是 test@example.com', type: 'entity' },
  { content: '今天的会议讨论了项目进度', type: 'conversation' },
  { content: '会议总结：完成了第一阶段的开发', type: 'summary' },
  { content: 'API 文档：GET /users 返回用户列表', type: 'document' },
  { content: '项目使用 React 框架', type: 'fact' },
  { content: '我喜欢简洁的代码风格', type: 'preference' },
];

describe('语义记忆检索', () => {
  let classifier: MemoryClassifier;
  let importanceScorer: ImportanceScorer;
  let resultSorter: ResultSorter;
  let ftsSearcher: FTSSearcher;
  let rrfFusion: RRFFusion;
  let temporalScorer: TemporalDecayScorer;

  beforeEach(async () => {
    // 清理旧数据
    try {
      await rm(TEST_STORAGE_PATH, { recursive: true, force: true });
    } catch {
      // 忽略清理错误
    }

    // 初始化组件
    classifier = new MemoryClassifier({ llmThreshold: 0.7, useLLM: false });
    importanceScorer = new ImportanceScorer();
    resultSorter = new ResultSorter();
    rrfFusion = new RRFFusion();
    temporalScorer = new TemporalDecayScorer();

    // 初始化 FTS 检索器
    ftsSearcher = new FTSSearcher({
      dbPath: join(TEST_STORAGE_PATH, 'test.db'),
    });
  });

  afterEach(async () => {
    if (ftsSearcher) {
      ftsSearcher.close();
    }
    try {
      await rm(TEST_STORAGE_PATH, { recursive: true, force: true });
    } catch {
      // 忽略清理错误
    }
  });

  // ========== T021: 记忆分类器测试 ==========

  describe('T021: 记忆分类器', () => {
    it('应该正确分类偏好类型', async () => {
      const result = await classifier.classify('我喜欢使用 TypeScript');

      expect(result.type).toBe('preference');
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it('应该正确分类事实类型', async () => {
      const result = await classifier.classify('我是一名软件工程师');

      expect(result.type).toBe('fact');
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it('应该正确分类决策类型', async () => {
      const result = await classifier.classify('我们决定使用 React 框架');

      expect(result.type).toBe('decision');
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it('应该正确分类实体类型', async () => {
      const result = await classifier.classify('我的邮箱是 test@example.com');

      expect(result.type).toBe('entity');
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it('应该批量分类记忆', async () => {
      const contents = TEST_MEMORIES.map(m => m.content);
      const results = await classifier.classifyBatch(contents);

      expect(results.length).toBe(contents.length);
      expect(results.every(r => r.confidence >= 0 && r.confidence <= 1)).toBe(true);
    });

    it('分类准确率应大于 80%', async () => {
      let correct = 0;

      for (const { content, type } of TEST_MEMORIES) {
        const result = await classifier.classify(content);
        if (result.type === type) {
          correct++;
        }
      }

      const accuracy = correct / TEST_MEMORIES.length;
      expect(accuracy).toBeGreaterThanOrEqual(0.8);
    });

    it('应该返回类型描述', () => {
      const description = getMemoryTypeDescription('preference');
      expect(description).toContain('偏好');
    });

    it('应该返回置信度分数', async () => {
      const result = await classifier.classify('我非常喜欢 Python 编程');

      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    });

    it('应该支持便捷分类函数', async () => {
      const result = await classifyMemory('我喜欢 TypeScript');

      expect(result.type).toBeDefined();
      expect(result.confidence).toBeDefined();
    });
  });

  // ========== T022: 重要性评分算法测试 ==========

  describe('T022: 重要性评分算法', () => {
    it('新记忆默认重要性应为 0.5', () => {
      const defaultImportance = getDefaultImportance();
      expect(defaultImportance).toBe(0.5);
    });

    it('重要性评分应在 [0, 1] 范围内', () => {
      const entry = createTestEntry({ accessCount: 0 });
      const score = importanceScorer.calculate(entry);

      expect(score).toBeGreaterThanOrEqual(0.1);
      expect(score).toBeLessThanOrEqual(1.0);
    });

    it('访问频率应正相关', () => {
      const lowAccess = createTestEntry({ accessCount: 1 });
      const highAccess = createTestEntry({ accessCount: 50 });

      const lowScore = importanceScorer.calculate(lowAccess);
      const highScore = importanceScorer.calculate(highAccess);

      expect(highScore).toBeGreaterThan(lowScore);
    });

    it('时间衰减应负相关', () => {
      const recentEntry = createTestEntry({
        createdAt: new Date(),
      });

      const oldEntry = createTestEntry({
        createdAt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000), // 60 天前
      });

      const recentScore = importanceScorer.calculate(recentEntry);
      const oldScore = importanceScorer.calculate(oldEntry);

      expect(recentScore).toBeGreaterThan(oldScore);
    });

    it('偏好类型应有更高权重', () => {
      const preference = createTestEntry({ type: 'preference' });
      const other = createTestEntry({ type: 'other' });

      const preferenceScore = importanceScorer.calculate(preference);
      const otherScore = importanceScorer.calculate(other);

      expect(preferenceScore).toBeGreaterThan(otherScore);
    });

    it('应该支持批量计算', () => {
      const entries = [
        createTestEntry({ accessCount: 5 }),
        createTestEntry({ accessCount: 10 }),
        createTestEntry({ accessCount: 15 }),
      ];

      const scores = importanceScorer.calculateBatch(entries);

      expect(scores.size).toBe(3);
      expect(scores.has(entries[0].id)).toBe(true);
    });

    it('访问后应提升重要性', () => {
      const entry = createTestEntry({ accessCount: 1 });
      const currentImportance = importanceScorer.calculate(entry);
      const updatedImportance = importanceScorer.updateAfterAccess(
        { ...entry, accessCount: 2 },
        currentImportance
      );

      expect(updatedImportance).toBeGreaterThanOrEqual(currentImportance);
    });

    it('应该支持便捷计算函数', () => {
      const entry = createTestEntry();
      const score = calculateImportance(entry);

      expect(score).toBeGreaterThanOrEqual(0.1);
      expect(score).toBeLessThanOrEqual(1.0);
    });
  });

  // ========== T023: 向量存储流程测试 ==========

  describe('T023: 向量存储流程', () => {
    it('FTS 检索器应该正确索引记忆', () => {
      const entry = createTestEntry({ content: 'TypeScript programming test' });
      ftsSearcher.index(entry);

      const results = ftsSearcher.search({
        query: 'TypeScript',
        limit: 10,
      });

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].entry.id).toBe(entry.id);
    });

    it('应该支持批量索引', () => {
      // 获取索引前数量
      const statsBefore = ftsSearcher.getStats();
      const entries = TEST_MEMORIES.map((m, i) =>
        createTestEntry({ content: m.content, id: `test-${i}` })
      );

      ftsSearcher.indexBatch(entries);

      const statsAfter = ftsSearcher.getStats();
      expect(statsAfter.totalCount).toBe(statsBefore.totalCount + entries.length);
    });

    it('应该支持删除索引', () => {
      const entry = createTestEntry({ content: '待删除的内容' });
      ftsSearcher.index(entry);

      ftsSearcher.delete(entry.id);

      const results = ftsSearcher.search({
        query: '待删除',
        limit: 10,
      });

      expect(results.find(r => r.entry.id === entry.id)).toBeUndefined();
    });
  });

  // ========== T024: 检索结果排序测试 ==========

  describe('T024: 检索结果排序', () => {
    it('应该按分数排序', () => {
      const results = [
        { entry: createTestEntry(), score: 0.5 },
        { entry: createTestEntry(), score: 0.9 },
        { entry: createTestEntry(), score: 0.7 },
      ];

      const sorted = resultSorter.sort(results, { field: 'score', order: 'desc' });

      expect(sorted[0].score).toBe(0.9);
      expect(sorted[1].score).toBe(0.7);
      expect(sorted[2].score).toBe(0.5);
    });

    it('应该按重要性排序', () => {
      const results = [
        { entry: createTestEntry({ importance: 0.5 }), score: 0.8 },
        { entry: createTestEntry({ importance: 0.9 }), score: 0.8 },
        { entry: createTestEntry({ importance: 0.7 }), score: 0.8 },
      ];

      const sorted = resultSorter.sort(results, { field: 'importance', order: 'desc' });

      expect(sorted[0].entry.importance).toBe(0.9);
    });

    it('应该支持混合排序', () => {
      const results = [
        { entry: createTestEntry({ importance: 0.5 }), score: 0.9 },
        { entry: createTestEntry({ importance: 0.9 }), score: 0.7 },
        { entry: createTestEntry({ importance: 0.7 }), score: 0.8 },
      ];

      const sorted = resultSorter.hybridSort(results);

      expect(sorted.length).toBe(3);
    });

    it('应该支持多字段排序', () => {
      const results = [
        { entry: createTestEntry({ importance: 0.5 }), score: 0.9 },
        { entry: createTestEntry({ importance: 0.9 }), score: 0.9 },
        { entry: createTestEntry({ importance: 0.7 }), score: 0.7 },
      ];

      const sorted = resultSorter.multiFieldSort(results, [
        { field: 'score', order: 'desc' },
        { field: 'importance', order: 'desc' },
      ]);

      // 分数相同时，按重要性降序
      expect(sorted[0].entry.importance).toBe(0.9);
      expect(sorted[1].entry.importance).toBe(0.5);
    });

    it('应该正确去重', () => {
      const entry = createTestEntry();
      const results = [
        { entry, score: 0.9 },
        { entry, score: 0.8 },
        { entry, score: 0.7 },
      ];

      const deduped = resultSorter.deduplicate(results);

      expect(deduped.length).toBe(1);
      expect(deduped[0].score).toBe(0.9); // 保留最高分
    });

    it('应该支持 Top-K', () => {
      const results = Array.from({ length: 20 }, (_, i) => ({
        entry: createTestEntry(),
        score: i / 20,
      }));

      const top5 = resultSorter.topK(results, 5, { field: 'score', order: 'desc' });

      expect(top5.length).toBe(5);
    });

    it('应该支持分页', () => {
      const results = Array.from({ length: 25 }, (_, i) => ({
        entry: createTestEntry(),
        score: i / 25,
      }));

      const page1 = resultSorter.paginate(results, { page: 1, pageSize: 10 });
      const page2 = resultSorter.paginate(results, { page: 2, pageSize: 10 });

      expect(page1.length).toBe(10);
      expect(page2.length).toBe(10);
    });

    it('应该合并多个结果集', () => {
      const entry1 = createTestEntry({ content: '结果1' });
      const entry2 = createTestEntry({ content: '结果2' });

      const set1 = [
        { entry: entry1, score: 0.9 },
        { entry: entry2, score: 0.7 },
      ];

      const set2 = [
        { entry: entry1, score: 0.8 }, // 重复条目
        { entry: createTestEntry(), score: 0.6 },
      ];

      const merged = resultSorter.merge([set1, set2], 5);

      expect(merged.length).toBeLessThanOrEqual(5);
      // 去重后应该只有 3 条
      expect(merged.length).toBe(3);
    });

    it('应该支持相关性-重要性混合排序', () => {
      const results = [
        { entry: createTestEntry({ importance: 0.9 }), score: 0.5 },
        { entry: createTestEntry({ importance: 0.5 }), score: 0.9 },
      ];

      // 相关性优先
      const relevanceFirst = resultSorter.sortByRelevanceAndImportance(results, 0.8, 0.2);
      expect(relevanceFirst[0].score).toBe(0.9);

      // 重要性优先
      const importanceFirst = resultSorter.sortByRelevanceAndImportance(results, 0.2, 0.8);
      expect(importanceFirst[0].entry.importance).toBe(0.9);
    });
  });

  // ========== T025-T027: 检索集成测试 ==========

  describe('T025-T027: 检索集成', () => {
    it('RRF 融合应该正确合并结果', () => {
      const vectorResults = [
        { entry: createTestEntry(), score: 0.9, source: 'vector' as const },
        { entry: createTestEntry(), score: 0.8, source: 'vector' as const },
      ];

      const ftsResults = [
        { entry: createTestEntry(), score: 0.95, source: 'fulltext' as const },
        { entry: createTestEntry(), score: 0.7, source: 'fulltext' as const },
      ];

      const fused = rrfFusion.fuse(vectorResults, ftsResults);

      expect(fused.length).toBe(4);
    });

    it('时间衰减应该正确计算', () => {
      const now = new Date();
      const recentEntry = createTestEntry({
        createdAt: now,
        accessedAt: now,
      });
      const oldEntry = createTestEntry({
        createdAt: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000), // 30 天前
        accessedAt: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
      });

      const recentScore = temporalScorer.calculateScore(recentEntry, 0.8);
      const oldScore = temporalScorer.calculateScore(oldEntry, 0.8);

      expect(recentScore).toBeGreaterThan(oldScore);
    });

    it('遗忘曲线函数应该正确', () => {
      // 刚创建的记忆，衰减应该很小
      const freshDecay = forgettingCurve.retention(0, 30);
      expect(freshDecay).toBeCloseTo(1.0, 1);

      // 30 天后，衰减到约 0.5
      const halfLifeDecay = forgettingCurve.retention(30, 30);
      expect(halfLifeDecay).toBeCloseTo(0.5, 1);
    });

    it('降级检索器应该正确工作', async () => {
      // 创建降级检索器（无主检索器）
      const fallbackSearcher = new FallbackSearcher({
        fts: { dbPath: join(TEST_STORAGE_PATH, 'fallback.db') },
      });

      // 索引测试数据（使用英文关键词避免中文分词问题）
      const entry = createTestEntry({ content: 'fallback test keyword' });
      fallbackSearcher.index(entry);

      // 执行检索
      const results = await fallbackSearcher.search('keyword');

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].entry.id).toBe(entry.id);

      // 检查状态
      const status = fallbackSearcher.getStatus();
      expect(status.isDegraded).toBe(true); // 无主检索器，应为降级状态

      fallbackSearcher.close();
    });

    it('降级检索器应该在主检索器失败时自动降级', async () => {
      // 创建失败的主检索器
      const failingSearcher: Searcher = {
        search: async () => {
          throw new Error('模拟检索失败');
        },
      };

      const fallbackSearcher = new FallbackSearcher(
        { fts: { dbPath: join(TEST_STORAGE_PATH, 'fallback2.db') } },
        failingSearcher
      );

      // 索引测试数据（使用英文关键词避免中文分词问题）
      const entry = createTestEntry({ content: 'auto fallback test' });
      fallbackSearcher.index(entry);

      // 执行检索（应该自动降级）
      const results = await fallbackSearcher.search('fallback');

      expect(results.length).toBeGreaterThan(0);

      fallbackSearcher.close();
    });

    it('降级检索器应该追踪统计信息', async () => {
      const fallbackSearcher = new FallbackSearcher({
        fts: { dbPath: join(TEST_STORAGE_PATH, 'fallback3.db') },
      });

      // 索引测试数据
      for (let i = 0; i < 5; i++) {
        fallbackSearcher.index(createTestEntry({ content: `测试内容 ${i}` }));
      }

      // 执行多次检索
      await fallbackSearcher.search('测试');
      await fallbackSearcher.search('内容');
      await fallbackSearcher.search('不存在');

      const stats = fallbackSearcher.getStats();
      expect(stats.totalSearches).toBe(3);
      expect(stats.fallbackSearches).toBe(3); // 全部是降级检索

      fallbackSearcher.close();
    });
  });

  // ========== US2 集成测试：端到端检索流程 ==========

  describe('端到端检索流程', () => {
    it('场景1: 关键词精确匹配', async () => {
      // 索引测试数据
      const entries = TEST_MEMORIES.map((m, i) =>
        createTestEntry({ content: m.content, type: m.type, id: `test-${i}` })
      );
      ftsSearcher.indexBatch(entries);

      // 执行关键词检索
      const results = ftsSearcher.search({
        query: 'TypeScript',
        limit: 5,
      });

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].entry.content).toContain('TypeScript');
    });

    it('场景2: 按类型过滤检索', async () => {
      const entries = TEST_MEMORIES.map((m, i) =>
        createTestEntry({ content: m.content, type: m.type, id: `test-${i}` })
      );
      ftsSearcher.indexBatch(entries);

      const results = ftsSearcher.search({
        query: '我',
        types: ['preference'],
        limit: 10,
      });

      expect(results.every(r => r.entry.type === 'preference')).toBe(true);
    });

    it('场景3: 混合检索和排序', () => {
      // 创建模拟向量检索结果
      const vectorResults: Array<{ entry: MemoryEntry; score: number; rrfScore: number; importanceScore: number }> = [
        {
          entry: createTestEntry({ content: '向量匹配1', importance: 0.8 }),
          score: 0.95,
          rrfScore: 0.1,
          importanceScore: 0.8,
        },
        {
          entry: createTestEntry({ content: '向量匹配2', importance: 0.6 }),
          score: 0.85,
          rrfScore: 0.05,
          importanceScore: 0.6,
        },
      ];

      // 创建模拟全文检索结果
      const ftsResults: Array<{ entry: MemoryEntry; score: number; rrfScore: number; importanceScore: number }> = [
        {
          entry: createTestEntry({ content: '全文匹配1', importance: 0.9 }),
          score: 0.92,
          rrfScore: 0.08,
          importanceScore: 0.9,
        },
        {
          entry: createTestEntry({ content: '全文匹配2', importance: 0.5 }),
          score: 0.75,
          rrfScore: 0.03,
          importanceScore: 0.5,
        },
      ];

      // RRF 融合
      const fused = rrfFusion.fuse(
        vectorResults.map(r => ({ ...r, source: 'vector' as const })),
        ftsResults.map(r => ({ ...r, source: 'fulltext' as const }))
      );

      // 混合排序
      const sorted = resultSorter.hybridSort(fused);

      expect(sorted.length).toBe(4);
    });

    it('场景4: 时间衰减影响排序', () => {
      const now = Date.now();

      const results = [
        {
          entry: createTestEntry({
            content: '新记忆',
            createdAt: new Date(now),
            accessedAt: new Date(now),
          }),
          score: 0.8,
        },
        {
          entry: createTestEntry({
            content: '旧记忆',
            createdAt: new Date(now - 60 * 24 * 60 * 60 * 1000), // 60 天前
            accessedAt: new Date(now - 60 * 24 * 60 * 60 * 1000),
          }),
          score: 0.8,
        },
      ];

      // 应用时间衰减
      const decayedResults = results.map(r => ({
        ...r,
        score: temporalScorer.calculateScore(r.entry, r.score),
      }));

      // 新记忆应该排在前面
      expect(decayedResults[0].score).toBeGreaterThan(decayedResults[1].score);
    });

    it('场景5: 完整检索流程', async () => {
      // 1. 准备数据（使用英文内容避免中文分词问题）
      const entries = [
        createTestEntry({ content: 'I like TypeScript programming', type: 'preference', id: 'test-0' }),
        createTestEntry({ content: 'I prefer clean code style', type: 'preference', id: 'test-1' }),
        createTestEntry({ content: 'My job is software engineer', type: 'fact', id: 'test-2' }),
      ];

      // 2. 索引
      ftsSearcher.indexBatch(entries);

      // 3. 检索
      const searchResults = ftsSearcher.search({
        query: 'TypeScript',
        limit: 10,
      });

      // 4. 排序
      const sorted = resultSorter.sort(searchResults, {
        field: 'score',
        order: 'desc',
      });

      // 5. 验证
      expect(sorted.length).toBeGreaterThan(0);
      expect(sorted[0].score).toBeGreaterThanOrEqual(sorted[sorted.length - 1].score);
    });
  });

  // ========== 验收标准测试 ==========

  describe('验收标准', () => {
    it('Recall@10 > 95%', async () => {
      // 索引所有测试数据
      const entries = TEST_MEMORIES.map((m, i) =>
        createTestEntry({ content: m.content, type: m.type, id: `test-${i}` })
      );
      ftsSearcher.indexBatch(entries);

      // 使用关键词查询测试召回率
      const queries = [
        { query: 'TypeScript', expectedCount: 1 },
        { query: '喜欢', expectedCount: 3 },
        { query: '工程师', expectedCount: 1 },
        { query: '决定', expectedCount: 1 },
      ];

      let totalRecall = 0;

      for (const { query, expectedCount } of queries) {
        const results = ftsSearcher.search({ query, limit: 10 });
        const relevantCount = results.filter(r =>
          r.entry.content.toLowerCase().includes(query.toLowerCase())
        ).length;

        const recall = expectedCount > 0 ? relevantCount / expectedCount : 1;
        totalRecall += recall;
      }

      const averageRecall = totalRecall / queries.length;
      expect(averageRecall).toBeGreaterThan(0.95);
    });

    it('P99 延迟 < 200ms', async () => {
      // 准备数据（使用英文关键词避免中文分词问题）
      const entries = Array.from({ length: 100 }, (_, i) =>
        createTestEntry({ content: `test content ${i} keyword` })
      );
      ftsSearcher.indexBatch(entries);

      // 执行多次检索并测量延迟
      const latencies: number[] = [];

      for (let i = 0; i < 100; i++) {
        const start = performance.now();
        ftsSearcher.search({ query: 'keyword', limit: 10 });
        const end = performance.now();
        latencies.push(end - start);
      }

      // 计算 P99
      latencies.sort((a, b) => a - b);
      const p99 = latencies[Math.floor(latencies.length * 0.99)];

      expect(p99).toBeLessThan(200);
    });

    it('分类准确率 > 80%', async () => {
      let correct = 0;

      for (const { content, type } of TEST_MEMORIES) {
        const result = await classifier.classify(content);
        if (result.type === type) {
          correct++;
        }
      }

      const accuracy = correct / TEST_MEMORIES.length;
      expect(accuracy).toBeGreaterThanOrEqual(0.8);
    });

    it('重要性评分范围正确', () => {
      for (const { content } of TEST_MEMORIES) {
        const entry = createTestEntry({ content, accessCount: Math.floor(Math.random() * 20) });
        const score = importanceScorer.calculate(entry);

        expect(score).toBeGreaterThanOrEqual(0.1);
        expect(score).toBeLessThanOrEqual(1.0);
      }
    });

    it('降级模式正确工作', async () => {
      const fallbackSearcher = new FallbackSearcher({
        fts: { dbPath: join(TEST_STORAGE_PATH, 'verify-fallback.db') },
      });

      // 无主检索器时，应直接使用降级模式
      expect(fallbackSearcher.getCurrentLevel()).toBe('tertiary');

      fallbackSearcher.close();
    });
  });
});
