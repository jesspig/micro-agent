/**
 * 空闲检查测试
 */

import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test'

describe('Idle Check (FR-4)', () => {
  /**
   * 模拟 ConversationSummarizer 的空闲检查逻辑
   */
  class MockIdleChecker {
    private lastActivityTime: number = Date.now()
    private idleCheckInterval: ReturnType<typeof setInterval> | null = null
    private onIdle: (() => Promise<void>) | null = null

    recordActivity(): void {
      this.lastActivityTime = Date.now()
    }

    startIdleCheck(
      sessionId: string,
      idleTimeout: number,
      onIdleCallback: () => Promise<void>
    ): void {
      this.stopIdleCheck()
      this.onIdle = onIdleCallback

      this.idleCheckInterval = setInterval(async () => {
        const idleTime = Date.now() - this.lastActivityTime
        if (idleTime >= idleTimeout) {
          await this.onIdle?.()
          this.stopIdleCheck()
        }
      }, 100) // 测试时使用较短间隔
    }

    stopIdleCheck(): void {
      if (this.idleCheckInterval) {
        clearInterval(this.idleCheckInterval)
        this.idleCheckInterval = null
      }
    }

    getLastActivityTime(): number {
      return this.lastActivityTime
    }
  }

  let checker: MockIdleChecker

  beforeEach(() => {
    checker = new MockIdleChecker()
  })

  afterEach(() => {
    checker.stopIdleCheck()
  })

  describe('recordActivity', () => {
    it('should update last activity time', () => {
      const before = checker.getLastActivityTime()
      
      // 等待一小段时间
      const start = Date.now()
      checker.recordActivity()
      
      expect(checker.getLastActivityTime()).toBeGreaterThanOrEqual(before)
    })

    it('should reset idle timer on each activity', async () => {
      let idleTriggered = false
      
      checker.startIdleCheck('test-session', 500, async () => {
        idleTriggered = true
      })

      // 在超时前记录活动
      await new Promise(r => setTimeout(r, 200))
      checker.recordActivity()
      
      // 再等待一段时间，但不超过新的超时
      await new Promise(r => setTimeout(r, 300))
      
      // 空闲不应被触发
      expect(idleTriggered).toBe(false)
      
      checker.stopIdleCheck()
    })
  })

  describe('startIdleCheck', () => {
    it('should trigger callback after idle timeout', async () => {
      let idleTriggered = false
      
      checker.startIdleCheck('test-session', 200, async () => {
        idleTriggered = true
      })

      // 等待超过超时时间
      await new Promise(r => setTimeout(r, 400))
      
      expect(idleTriggered).toBe(true)
    })

    it('should stop interval after triggering', async () => {
      let triggerCount = 0
      
      checker.startIdleCheck('test-session', 100, async () => {
        triggerCount++
      })

      // 等待足够长时间
      await new Promise(r => setTimeout(r, 500))
      
      // 应该只触发一次
      expect(triggerCount).toBe(1)
    })

    it('should not trigger if activity recorded', async () => {
      let idleTriggered = false
      
      checker.startIdleCheck('test-session', 300, async () => {
        idleTriggered = true
      })

      // 持续记录活动
      const interval = setInterval(() => checker.recordActivity(), 100)
      
      await new Promise(r => setTimeout(r, 500))
      
      expect(idleTriggered).toBe(false)
      
      clearInterval(interval)
      checker.stopIdleCheck()
    })
  })

  describe('stopIdleCheck', () => {
    it('should stop the idle check interval', async () => {
      let idleTriggered = false
      
      checker.startIdleCheck('test-session', 100, async () => {
        idleTriggered = true
      })

      // 立即停止
      checker.stopIdleCheck()
      
      await new Promise(r => setTimeout(r, 300))
      
      expect(idleTriggered).toBe(false)
    })

    it('should be safe to call multiple times', () => {
      expect(() => {
        checker.stopIdleCheck()
        checker.stopIdleCheck()
        checker.stopIdleCheck()
      }).not.toThrow()
    })
  })

  describe('integration scenario', () => {
    it('should simulate typical conversation flow', async () => {
      const summaries: string[] = []
      
      checker.startIdleCheck('conv-1', 150, async () => {
        summaries.push('summary-generated')
      })

      // 模拟用户活动
      checker.recordActivity()
      await new Promise(r => setTimeout(r, 50))
      
      checker.recordActivity()
      await new Promise(r => setTimeout(r, 50))
      
      // 用户停止活动
      await new Promise(r => setTimeout(r, 200))
      
      // 应该生成摘要
      expect(summaries).toContain('summary-generated')
    })
  })
})
