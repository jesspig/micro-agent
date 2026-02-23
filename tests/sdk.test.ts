/**
 * packages/sdk 单元测试
 */

import { describe, it, expect, beforeEach } from 'bun:test'
import { defineTool } from '@microbot/sdk'
import { ToolBuilder, createToolBuilder } from '@microbot/sdk'

// Mock ToolContext
const mockContext = {
  channel: 'test',
  chatId: 'chat-123',
  workspace: '/workspace',
  currentDir: '/workspace',
  sendToBus: async () => {},
}

describe('SDK Package', () => {
  describe('defineTool', () => {
    it('should create a tool with name and description', () => {
      const tool = defineTool({
        name: 'test_tool',
        description: 'A test tool',
        inputSchema: { type: 'object' },
        execute: async () => 'result',
      })

      expect(tool.name).toBe('test_tool')
      expect(tool.description).toBe('A test tool')
    })

    it('should return string result as ToolResult', async () => {
      const tool = defineTool({
        name: 'echo',
        description: 'Echo tool',
        inputSchema: { type: 'object' },
        execute: async (input: { message: string }) => `Echo: ${input.message}`,
      })

      const result = await tool.execute({ message: 'Hello' }, mockContext)
      expect(result.content).toHaveLength(1)
      expect(result.content[0].type).toBe('text')
      expect(result.content[0].text).toBe('Echo: Hello')
    })

    it('should return ToolResult directly', async () => {
      const tool = defineTool({
        name: 'custom_result',
        description: 'Custom result tool',
        inputSchema: { type: 'object' },
        execute: async () => ({
          content: [
            { type: 'text' as const, text: 'Part 1' },
            { type: 'text' as const, text: 'Part 2' },
          ],
          isError: true,
        }),
      })

      const result = await tool.execute({}, mockContext)
      expect(result.content).toHaveLength(2)
      expect(result.isError).toBe(true)
    })

    it('should have inputSchema', () => {
      const tool = defineTool({
        name: 'schema_tool',
        description: 'Tool with schema',
        inputSchema: {
          type: 'object',
          properties: {
            name: { type: 'string' },
          },
          required: ['name'],
        },
        execute: async () => 'ok',
      })

      expect(tool.inputSchema.type).toBe('object')
      expect(tool.inputSchema.required).toContain('name')
    })
  })

  describe('ToolBuilder', () => {
    let builder: ToolBuilder

    beforeEach(() => {
      builder = createToolBuilder()
    })

    it('should build tool with fluent API', () => {
      const tool = builder
        .name('builder_tool')
        .description('Built with builder')
        .inputSchema({ type: 'object' })
        .execute(async () => 'built result')
        .build()

      expect(tool.name).toBe('builder_tool')
      expect(tool.description).toBe('Built with builder')
    })

    it('should throw when name is missing', () => {
      expect(() => {
        builder
          .description('test')
          .inputSchema({ type: 'object' })
          .execute(async () => 'ok')
          .build()
      }).toThrow('工具名称未设置')
    })

    it('should throw when description is missing', () => {
      expect(() => {
        builder
          .name('test')
          .inputSchema({ type: 'object' })
          .execute(async () => 'ok')
          .build()
      }).toThrow('工具描述未设置')
    })

    it('should throw when inputSchema is missing', () => {
      expect(() => {
        builder
          .name('test')
          .description('test')
          .execute(async () => 'ok')
          .build()
      }).toThrow('输入参数 Schema 未设置')
    })

    it('should throw when execute is missing', () => {
      expect(() => {
        builder
          .name('test')
          .description('test')
          .inputSchema({ type: 'object' })
          .build()
      }).toThrow('执行函数未设置')
    })

    it('should convert string result to ToolResult', async () => {
      const tool = builder
        .name('string_result')
        .description('Returns string')
        .inputSchema({ type: 'object' })
        .execute(async () => 'string result')
        .build()

      const result = await tool.execute({}, mockContext)
      expect(result.content[0].type).toBe('text')
      expect(result.content[0].text).toBe('string result')
    })

    it('should support typed input', () => {
      interface MyInput {
        value: number
      }

      const typedBuilder = createToolBuilder<MyInput>()
      const tool = typedBuilder
        .name('typed_tool')
        .description('Typed input tool')
        .inputSchema({
          type: 'object',
          properties: {
            value: { type: 'number' },
          },
        })
        .execute(async (input: MyInput) => `Value: ${input.value}`)
        .build()

      expect(tool.name).toBe('typed_tool')
    })
  })
})
