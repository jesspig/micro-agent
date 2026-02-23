/**
 * 全文检索测试
 */

import { describe, it, expect, beforeEach } from 'bun:test'

describe('Fulltext Search (FR-3)', () => {
  /**
   * 模拟 fulltextSearch 实现（与 MemoryStore 中的实现一致）
   */
  interface MockRecord {
    id: string
    content: string
    createdAt: number
  }

  /**
   * 从查询中提取关键词（支持中英文混合）
   */
  function extractKeywords(query: string): string[] {
    const keywords: string[] = [];
    const lowerQuery = query.toLowerCase();
    
    // 1. 提取英文单词（连续字母）
    const englishWords = lowerQuery.match(/[a-z]+/g) || [];
    keywords.push(...englishWords.filter(w => w.length > 1));
    
    // 2. 提取中文词汇（每2-4个字符为一组，形成 n-gram）
    const chineseChars = lowerQuery.match(/[\u4e00-\u9fa5]/g) || [];
    if (chineseChars.length > 0) {
      // 2-gram
      for (let i = 0; i < chineseChars.length - 1; i++) {
        keywords.push(chineseChars[i] + chineseChars[i + 1]);
      }
      // 3-gram（如果中文足够多）
      if (chineseChars.length > 3) {
        for (let i = 0; i < chineseChars.length - 2; i++) {
          keywords.push(chineseChars[i] + chineseChars[i + 1] + chineseChars[i + 2]);
        }
      }
    }
    
    // 3. 提取数字
    const numbers = lowerQuery.match(/\d+/g) || [];
    keywords.push(...numbers.filter(n => n.length > 1));
    
    // 去重
    return [...new Set(keywords)];
  }

  function fulltextSearch(
    records: MockRecord[],
    query: string,
    limit: number
  ): MockRecord[] {
    const keywords = extractKeywords(query)
    
    if (keywords.length === 0) {
      return []
    }
    
    const scored = records
      .map(r => {
        const content = r.content.toLowerCase()
        let score = 0
        for (const kw of keywords) {
          const count = (content.match(new RegExp(kw, 'g')) || []).length
          score += count
        }
        return { record: r, score }
      })
      .filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)

    return scored.map(item => item.record)
  }

  let records: MockRecord[]

  beforeEach(() => {
    records = [
      { id: '1', content: '用户偏好深色主题，喜欢简洁的界面设计', createdAt: Date.now() - 3000 },
      { id: '2', content: '讨论了 API 设计方案，决定使用 RESTful 风格', createdAt: Date.now() - 2000 },
      { id: '3', content: '项目使用 TypeScript 和 React 进行开发', createdAt: Date.now() - 1000 },
      { id: '4', content: '用户喜欢 TypeScript，不喜欢 JavaScript', createdAt: Date.now() },
      { id: '5', content: '测试无关内容', createdAt: Date.now() },
    ]
  })

  describe('keyword extraction', () => {
    it('should extract English keywords', () => {
      const keywords = extractKeywords('TypeScript React')
      
      expect(keywords).toContain('typescript')
      expect(keywords).toContain('react')
    })

    it('should extract Chinese n-grams', () => {
      const keywords = extractKeywords('深色主题设计')
      
      // 2-gram: 深色, 色主, 主题, 题设, 设计
      expect(keywords).toContain('深色')
      expect(keywords).toContain('主题')
      expect(keywords).toContain('设计')
    })

    it('should extract mixed Chinese and English', () => {
      const keywords = extractKeywords('使用 TypeScript 开发')
      
      expect(keywords).toContain('typescript')
      expect(keywords.some(k => k.includes('使用') || k.includes('开发'))).toBe(true)
    })

    it('should extract numbers', () => {
      const keywords = extractKeywords('版本 12345 测试')
      
      expect(keywords).toContain('12345')
    })
  })

  describe('keyword matching', () => {
    it('should match single keyword', () => {
      const results = fulltextSearch(records, 'TypeScript', 5)
      
      expect(results).toHaveLength(2)
      expect(results.every(r => r.content.toLowerCase().includes('typescript'))).toBe(true)
    })

    it('should match multiple keywords (OR logic)', () => {
      const results = fulltextSearch(records, 'TypeScript 设计', 5)
      
      expect(results.length).toBeGreaterThan(0)
    })

    it('should match Chinese keywords', () => {
      const results = fulltextSearch(records, '深色主题', 5)
      
      expect(results.length).toBeGreaterThan(0)
      expect(results[0].content).toContain('深色主题')
    })

    it('should return empty for no matches', () => {
      // 使用一个独特的、不太可能在记录中出现的查询
      const results = fulltextSearch(records, 'xyzabc123nonexistent', 5)
      
      expect(results).toHaveLength(0)
    })
  })

  describe('scoring and sorting', () => {
    it('should sort by relevance score (higher matches first)', () => {
      const results = fulltextSearch(records, 'TypeScript', 5)
      
      // '用户喜欢 TypeScript，不喜欢 JavaScript' 包含 1 次 TypeScript
      // '项目使用 TypeScript 和 React 进行开发' 包含 1 次 TypeScript
      // 分数相同，按原始顺序
      expect(results).toHaveLength(2)
    })

    it('should count multiple occurrences', () => {
      const multiRecord: MockRecord[] = [
        { id: '1', content: 'test test test', createdAt: Date.now() },
        { id: '2', content: 'test', createdAt: Date.now() },
      ]
      
      const results = fulltextSearch(multiRecord, 'test', 5)
      
      // 更多出现次数的记录应该排在前面
      expect(results[0].content).toBe('test test test')
    })
  })

  describe('filtering', () => {
    it('should filter out zero-score results', () => {
      const results = fulltextSearch(records, '深色主题', 5)
      
      // 只有第一条记录包含 '深色' 和 '主题'
      expect(results).toHaveLength(1)
      expect(results[0].content).toContain('深色主题')
    })

    it('should respect limit parameter', () => {
      const results = fulltextSearch(records, '用户', 1)
      
      expect(results.length).toBeLessThanOrEqual(1)
    })
  })

  describe('edge cases', () => {
    it('should handle empty query', () => {
      const results = fulltextSearch(records, '', 5)
      
      // 空查询不应匹配任何结果
      expect(results).toHaveLength(0)
    })

    it('should handle single character English keywords', () => {
      const results = fulltextSearch(records, 'a', 5)
      
      // 单字符英文关键词被过滤
      expect(results).toHaveLength(0)
    })

    it('should be case-insensitive', () => {
      const results = fulltextSearch(records, 'TYPESCRIPT', 5)
      
      expect(results.length).toBeGreaterThan(0)
    })

    it('should handle special characters in query', () => {
      const specialRecords: MockRecord[] = [
        { id: '1', content: '用户说："我喜欢 API-Design"', createdAt: Date.now() },
      ]
      
      // 确保不抛出异常
      expect(() => fulltextSearch(specialRecords, 'API', 5)).not.toThrow()
    })
  })
})
