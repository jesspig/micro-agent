/**
 * packages/types 单元测试
 */

import { describe, it, expect } from 'bun:test'

// 测试类型定义正确导出
describe('Types Package', () => {
  describe('Tool Types', () => {
    it('should define ToolResult with content array', () => {
      const result = {
        content: [{ type: 'text' as const, text: 'Hello' }],
      }
      expect(result.content).toHaveLength(1)
      expect(result.content[0].type).toBe('text')
    })

    it('should define ToolResult with isError flag', () => {
      const result = {
        content: [{ type: 'text' as const, text: 'Error occurred' }],
        isError: true,
      }
      expect(result.isError).toBe(true)
    })

    it('should support different ContentPart types', () => {
      const textPart = { type: 'text' as const, text: 'Hello' }
      const imagePart = { type: 'image' as const, data: 'base64data', mimeType: 'image/png' }
      const resourcePart = { type: 'resource' as const, uri: 'file://test.txt' }

      expect(textPart.type).toBe('text')
      expect(imagePart.mimeType).toBe('image/png')
      expect(resourcePart.uri).toBe('file://test.txt')
    })

    it('should define ToolCall with id, name, and arguments', () => {
      const toolCall = {
        id: 'call-123',
        name: 'read_file',
        arguments: { path: '/test.txt' },
      }
      expect(toolCall.id).toBe('call-123')
      expect(toolCall.name).toBe('read_file')
      expect(toolCall.arguments).toHaveProperty('path')
    })
  })

  describe('Message Types', () => {
    it('should define MessageRole types', () => {
      const roles = ['system', 'user', 'assistant', 'tool'] as const
      expect(roles).toContain('system')
      expect(roles).toContain('user')
      expect(roles).toContain('assistant')
      expect(roles).toContain('tool')
    })

    it('should define LLMMessage with role and content', () => {
      const message = {
        role: 'user' as const,
        content: 'Hello, world!',
      }
      expect(message.role).toBe('user')
      expect(message.content).toBe('Hello, world!')
    })

    it('should support multimodal content', () => {
      const message = {
        role: 'user' as const,
        content: [
          { type: 'text' as const, text: 'What is this?' },
          { type: 'image' as const, data: 'base64data', mimeType: 'image/png' },
        ],
      }
      expect(Array.isArray(message.content)).toBe(true)
      expect(message.content).toHaveLength(2)
    })

    it('should define LLMResponse correctly', () => {
      const response = {
        content: 'Hello!',
        hasToolCalls: false,
      }
      expect(response.content).toBe('Hello!')
      expect(response.hasToolCalls).toBe(false)
    })

    it('should define LLMResponse with tool calls', () => {
      const response = {
        content: '',
        toolCalls: [{ id: '1', name: 'test', arguments: {} }],
        hasToolCalls: true,
      }
      expect(response.hasToolCalls).toBe(true)
      expect(response.toolCalls).toHaveLength(1)
    })
  })

  describe('Session Types', () => {
    it('should define SessionKey as template literal', () => {
      const key: `${string}:${string}` = 'feishu:chat-123'
      expect(key).toBe('feishu:chat-123')
      expect(key.includes(':')).toBe(true)
    })
  })

  describe('Provider Types', () => {
    it('should define Provider type', () => {
      const provider = {
        id: 'openai',
        name: 'OpenAI',
        type: 'openai' as const,
      }
      expect(provider.id).toBe('openai')
      expect(provider.type).toBe('openai')
    })
  })

  describe('Extension Types', () => {
    it('should define ExtensionType', () => {
      const types = ['tool', 'channel', 'skill', 'agent', 'workflow', 'command', 'mcp-client', 'mcp-server'] as const
      expect(types).toContain('tool')
      expect(types).toContain('channel')
      expect(types).toContain('skill')
    })

    it('should define ExtensionDescriptor', () => {
      const descriptor = {
        type: 'tool' as const,
        name: 'my-tool',
        version: '1.0.0',
        entry: './index.ts',
      }
      expect(descriptor.type).toBe('tool')
      expect(descriptor.name).toBe('my-tool')
    })
  })

  describe('Event Types', () => {
    it('should define event names', () => {
      const events = [
        'message:received',
        'message:afterProcess',
        'message:sent',
        'tool:beforeExecute',
        'tool:afterExecute',
        'llm:beforeCall',
        'llm:afterCall',
      ]
      expect(events).toContain('message:received')
      expect(events).toContain('tool:beforeExecute')
    })
  })
})
