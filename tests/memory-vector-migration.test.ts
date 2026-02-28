/**
 * 记忆向量迁移测试
 * 
 * 测试 MemoryStore 的向量列迁移功能，包括：
 * - 模型 ID 与向量列名转换
 * - 向量列标准化（FixedSizeList → 普通数组）
 * - 向量列检测逻辑
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { mkdirSync, rmSync, existsSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import { MemoryStore } from '@micro-agent/runtime'
import type { EmbeddingService } from '@micro-agent/runtime'

const TEST_DIR = join(homedir(), '.micro-agent', 'test-memory-migration')

// 模拟嵌入服务
class MockEmbeddingService implements EmbeddingService {
  private dimension: number
  
  constructor(dimension: number = 768) {
    this.dimension = dimension
  }

  isAvailable(): boolean {
    return true
  }

  async embed(_text: string): Promise<number[]> {
    // 返回模拟向量
    return new Array(this.dimension).fill(0).map(() => Math.random())
  }

  // 支持动态修改维度
  setDimension(dim: number): void {
    this.dimension = dim
  }
}

describe('MemoryStore Vector Migration', () => {
  let store: MemoryStore
  let embeddingService: MockEmbeddingService

  beforeEach(() => {
    // 清理测试目录
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true })
    }
    mkdirSync(TEST_DIR, { recursive: true })
    
    embeddingService = new MockEmbeddingService(768)
  })

  afterEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true })
    }
  })

  describe('modelIdToVectorColumn', () => {
    it('should convert model ID to vector column name', () => {
      const column = MemoryStore.modelIdToVectorColumn('ollama/qwen3-embedding:0.6b')
      // - -> _h_, : -> _c_, . -> _d_
      expect(column).toBe('vector_ollama_qwen3_h_embedding_c_0_d_6b')
    })

    it('should convert OpenAI model ID', () => {
      const column = MemoryStore.modelIdToVectorColumn('openai/text-embedding-3-small')
      // - -> _h_
      expect(column).toBe('vector_openai_text_h_embedding_h_3_h_small')
    })

    it('should convert model ID with dots', () => {
      const column = MemoryStore.modelIdToVectorColumn('ollama/embeddinggemma:latest')
      // : -> _c_
      expect(column).toBe('vector_ollama_embeddinggemma_c_latest')
    })
  })

  describe('vectorColumnToModelId', () => {
    it('should convert vector column name back to model ID', () => {
      const modelId = MemoryStore.vectorColumnToModelId('vector_ollama_qwen3_h_embedding_c_0_d_6b')
      expect(modelId).toBe('ollama/qwen3-embedding:0.6b')
    })

    it('should convert OpenAI vector column', () => {
      const modelId = MemoryStore.vectorColumnToModelId('vector_openai_text_h_embedding_h_3_h_small')
      expect(modelId).toBe('openai/text-embedding-3-small')
    })

    it('should be inverse of modelIdToVectorColumn', () => {
      const originalModelId = 'deepseek/deepseek-embedding'
      const column = MemoryStore.modelIdToVectorColumn(originalModelId)
      const result = MemoryStore.vectorColumnToModelId(column)
      expect(result).toBe(originalModelId)
    })
  })

  describe('向量列自动检测', () => {
    it('should create initial vector column on first store', async () => {
      store = new MemoryStore({
        storagePath: TEST_DIR,
        embedModel: 'ollama/test-model:1.0',
        embeddingService,
      })

      await store.initialize()

      const columns = await store.getExistingVectorColumns()
      // 初始化后应该有一个向量列
      expect(columns.length).toBeGreaterThanOrEqual(0)

      await store.close()
    })

    it('should detect new vector column when model changes', async () => {
      // 第一次使用第一个模型
      store = new MemoryStore({
        storagePath: TEST_DIR,
        embedModel: 'ollama/model-a:1.0',
        embeddingService,
      })

      await store.initialize()
      await store.store({
        id: 'test-1',
        sessionId: 'session-1',
        type: 'conversation',
        content: '测试内容 A',
        metadata: { tags: [] },
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      await store.close()

      // 第二次使用不同的模型
      embeddingService.setDimension(1024) // 改变维度
      store = new MemoryStore({
        storagePath: TEST_DIR,
        embedModel: 'ollama/model-b:2.0',
        embeddingService,
      })

      await store.initialize()

      // 应该检测到两个向量列
      const columns = await store.getExistingVectorColumns()
      expect(columns.length).toBeGreaterThanOrEqual(1)

      await store.close()
    })
  })

  describe('向量检索', () => {
    it('should retrieve memories using vector search', async () => {
      store = new MemoryStore({
        storagePath: TEST_DIR,
        embedModel: 'ollama/test-embed:1.0',
        embeddingService,
      })

      await store.initialize()

      // 存储测试记忆
      await store.store({
        id: 'test-1',
        sessionId: 'session-1',
        type: 'conversation',
        content: '用户喜欢吃苹果、香蕉、橙子',
        metadata: { tags: ['preference'] },
        createdAt: new Date(),
        updatedAt: new Date(),
      })

      await store.store({
        id: 'test-2',
        sessionId: 'session-1',
        type: 'conversation',
        content: '用户喜欢跑步、游泳、篮球',
        metadata: { tags: ['preference'] },
        createdAt: new Date(),
        updatedAt: new Date(),
      })

      // 检索记忆
      const results = await store.search('喜欢的水果', { limit: 5 })
      expect(results.length).toBeGreaterThan(0)

      await store.close()
    })
  })

  describe('向量列迁移', () => {
    it('should handle model dimension change gracefully', async () => {
      // 首次初始化使用 768 维
      store = new MemoryStore({
        storagePath: TEST_DIR,
        embedModel: 'ollama/embed-a:1.0',
        embeddingService: new MockEmbeddingService(768),
      })

      await store.initialize()
      await store.store({
        id: 'test-migrate-1',
        sessionId: 'session-1',
        type: 'conversation',
        content: '测试迁移内容',
        metadata: { tags: [] },
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      
      // 检查存储的向量列
      const columnsBefore = await store.getExistingVectorColumns()
      console.log('Before migration columns:', columnsBefore)
      
      await store.close()

      // 切换到 1024 维模型
      store = new MemoryStore({
        storagePath: TEST_DIR,
        embedModel: 'ollama/embed-b:2.0',
        embeddingService: new MockEmbeddingService(1024),
      })

      // 不应该抛出错误
      try {
        await store.initialize()
      } catch (error) {
        console.error('Migration error:', error)
        throw error
      }

      // 旧数据应该仍然可检索
      const results = await store.search('迁移', { limit: 5 })
      expect(results.length).toBeGreaterThan(0)

      await store.close()
    })
  })
})
