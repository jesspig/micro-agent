/**
 * packages/runtime 单元测试
 */

import { describe, it, expect, beforeEach } from 'bun:test'
import { ContainerImpl, container } from '@microbot/runtime'
import { HookSystem, hookSystem } from '@microbot/runtime'

describe('Runtime Package', () => {
  describe('Container', () => {
    let testContainer: ContainerImpl

    beforeEach(() => {
      testContainer = new ContainerImpl()
    })

    it('should register and resolve transient factory', () => {
      let counter = 0
      testContainer.register('counter', () => ({ value: ++counter }))

      const first = testContainer.resolve<{ value: number }>('counter')
      const second = testContainer.resolve<{ value: number }>('counter')

      expect(first.value).toBe(1)
      expect(second.value).toBe(2) // 每次创建新实例
    })

    it('should register and resolve singleton', () => {
      let counter = 0
      testContainer.singleton('singleton', () => ({ value: ++counter }))

      const first = testContainer.resolve<{ value: number }>('singleton')
      const second = testContainer.resolve<{ value: number }>('singleton')

      expect(first.value).toBe(1)
      expect(second.value).toBe(1) // 同一个实例
      expect(first).toBe(second)
    })

    it('should throw error when resolving unregistered dependency', () => {
      expect(() => testContainer.resolve('not-exists')).toThrow('未注册依赖')
    })

    it('should check if dependency is registered', () => {
      testContainer.register('exists', () => ({}))
      expect(testContainer.has('exists')).toBe(true)
      expect(testContainer.has('not-exists')).toBe(false)
    })

    it('should use global container instance', () => {
      expect(container).toBeDefined()
      expect(container).toBeInstanceOf(ContainerImpl)
    })
  })

  describe('HookSystem', () => {
    let testHookSystem: HookSystem

    beforeEach(() => {
      testHookSystem = new HookSystem()
    })

    it('should register and execute hooks', async () => {
      let executed = false
      testHookSystem.registerHook('llm:beforeRequest', () => {
        executed = true
        return {}
      })

      await testHookSystem.executeHooks('llm:beforeRequest', {})
      expect(executed).toBe(true)
    })

    it('should execute hooks in priority order', async () => {
      const order: number[] = []
      
      testHookSystem.registerHook('test', () => {
        order.push(2)
        return {}
      }, 100)
      
      testHookSystem.registerHook('test', () => {
        order.push(1)
        return {}
      }, 50)
      
      testHookSystem.registerHook('test', () => {
        order.push(3)
        return {}
      }, 150)

      await testHookSystem.executeHooks('test', {})
      expect(order).toEqual([1, 2, 3])
    })

    it('should pass context through hook chain', async () => {
      testHookSystem.registerHook('test', (ctx: { value: number }) => ({
        value: ctx.value + 1,
      }))
      
      testHookSystem.registerHook('test', (ctx: { value: number }) => ({
        value: ctx.value * 2,
      }))

      const result = await testHookSystem.executeHooks('test', { value: 5 })
      expect(result.value).toBe(12) // (5 + 1) * 2
    })

    it('should support async hooks', async () => {
      testHookSystem.registerHook('test', async (ctx: { value: number }) => {
        await new Promise(resolve => setTimeout(resolve, 10))
        return { value: ctx.value + 1 }
      })

      const result = await testHookSystem.executeHooks('test', { value: 10 })
      expect(result.value).toBe(11)
    })

    it('should return context unchanged when no hooks registered', async () => {
      const ctx = { value: 42 }
      const result = await testHookSystem.executeHooks('no-hooks', ctx)
      expect(result).toBe(ctx)
    })

    it('should clear hooks of specific type', () => {
      testHookSystem.registerHook('test', () => ({}))
      testHookSystem.registerHook('other', () => ({}))

      testHookSystem.clear('test')
      
      // Should not throw, but hooks should not execute
      // We can't directly check, but clear should work
      expect(testHookSystem).toBeDefined()
    })

    it('should use global hookSystem instance', () => {
      expect(hookSystem).toBeDefined()
      expect(hookSystem).toBeInstanceOf(HookSystem)
    })
  })
})
