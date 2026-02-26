/**
 * 记忆注入测试
 */

import { describe, it, expect } from 'bun:test'
import type { MemoryEntry } from '@micro-agent/runtime'

describe('Memory Injection (FR-2)', () => {
  /**
   * 模拟 formatMemoryContext 方法
   */
  function formatMemoryContext(memories: MemoryEntry[]): string {
    const lines = ['<relevant-memories>', '以下是相关的历史记忆，仅供参考：']
    
    for (const m of memories) {
      const timeLabel = m.type === 'summary' ? '[摘要]' : '[对话]'
      const preview = m.content.length > 200 ? m.content.slice(0, 200) + '...' : m.content
      lines.push(`- ${timeLabel} ${preview}`)
    }
    
    lines.push('</relevant-memories>')
    return lines.join('\n')
  }

  /**
   * 模拟 buildSystemPrompt 方法
   */
  function buildSystemPrompt(basePrompt: string, memories?: MemoryEntry[]): string {
    let prompt = basePrompt

    if (memories && memories.length > 0) {
      const memoryContext = formatMemoryContext(memories)
      prompt = prompt ? `${prompt}\n\n${memoryContext}` : memoryContext
    }

    return prompt
  }

  function createMemory(content: string, type: MemoryEntry['type'] = 'conversation'): MemoryEntry {
    return {
      id: crypto.randomUUID(),
      sessionId: 'test-session',
      type,
      content,
      metadata: { tags: [type] },
      createdAt: new Date(),
      updatedAt: new Date(),
    }
  }

  describe('formatMemoryContext', () => {
    it('should format memories with XML tags', () => {
      const memories = [
        createMemory('用户偏好深色主题', 'conversation'),
        createMemory('讨论了 API 设计', 'summary'),
      ]

      const context = formatMemoryContext(memories)
      
      expect(context).toContain('<relevant-memories>')
      expect(context).toContain('</relevant-memories>')
      expect(context).toContain('[对话]')
      expect(context).toContain('[摘要]')
    })

    it('should truncate long content', () => {
      const longContent = 'A'.repeat(300)
      const memories = [createMemory(longContent)]

      const context = formatMemoryContext(memories)
      
      expect(context).toContain('...')
      expect(context.length).toBeLessThan(longContent.length + 200)
    })

    it('should label summary type correctly', () => {
      const memories = [createMemory('摘要内容', 'summary')]

      const context = formatMemoryContext(memories)
      
      expect(context).toContain('[摘要]')
      expect(context).not.toContain('[对话]')
    })
  })

  describe('buildSystemPrompt', () => {
    it('should inject memories after base prompt', () => {
      const basePrompt = 'You are a helpful assistant.'
      const memories = [createMemory('用户喜欢简洁的回答')]

      const prompt = buildSystemPrompt(basePrompt, memories)
      
      expect(prompt).toContain('You are a helpful assistant.')
      expect(prompt).toContain('<relevant-memories>')
    })

    it('should return only memory context if no base prompt', () => {
      const memories = [createMemory('测试记忆')]

      const prompt = buildSystemPrompt('', memories)
      
      expect(prompt).toContain('<relevant-memories>')
      expect(prompt).not.toMatch(/^undefined|^null/)
    })

    it('should return base prompt if no memories', () => {
      const basePrompt = 'You are a helpful assistant.'

      const prompt = buildSystemPrompt(basePrompt, [])
      
      expect(prompt).toBe(basePrompt)
    })

    it('should return empty string if no prompt and no memories', () => {
      const prompt = buildSystemPrompt('', undefined)
      
      expect(prompt).toBe('')
    })
  })

  describe('memory context structure', () => {
    it('should mark memories as reference only', () => {
      const memories = [createMemory('测试内容')]

      const context = formatMemoryContext(memories)
      
      expect(context).toContain('仅供参考')
    })

    it('should preserve content integrity', () => {
      const specialContent = '用户说："我喜欢 TypeScript & React"'
      const memories = [createMemory(specialContent)]

      const context = formatMemoryContext(memories)
      
      expect(context).toContain('TypeScript')
      expect(context).toContain('React')
    })
  })
})
