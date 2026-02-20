import { describe, it, expect } from 'bun:test';
import type { LLMMessage, LLMResponse, ToolCall, LLMToolDefinition, LLMProvider } from '@microbot/core/providers';
import { parseOpenAIResponse } from '@microbot/core/providers';

describe('Provider Base Types', () => {
  describe('parseOpenAIResponse', () => {
    it('should parse simple text response', () => {
      const data = {
        choices: [{
          message: {
            content: 'Hello, World!',
          },
        }],
      };

      const result = parseOpenAIResponse(data);
      expect(result.content).toBe('Hello, World!');
      expect(result.hasToolCalls).toBe(false);
      expect(result.toolCalls).toBeUndefined();
    });

    it('should parse tool calls response', () => {
      const data = {
        choices: [{
          message: {
            content: '',
            tool_calls: [{
              id: 'call_123',
              function: {
                name: 'get_weather',
                arguments: '{"city": "北京"}',
              },
            }],
          },
        }],
      };

      const result = parseOpenAIResponse(data);
      expect(result.hasToolCalls).toBe(true);
      expect(result.toolCalls).toHaveLength(1);
      expect(result.toolCalls![0].name).toBe('get_weather');
      expect(result.toolCalls![0].arguments).toEqual({ city: '北京' });
    });

    it('should handle empty choices', () => {
      const data = { choices: [] };
      const result = parseOpenAIResponse(data);
      expect(result.content).toBe('');
      expect(result.hasToolCalls).toBe(false);
    });
  });

  describe('Type Definitions', () => {
    it('should have correct LLMMessage structure', () => {
      const message: LLMMessage = {
        role: 'user',
        content: 'Hello',
      };
      expect(message.role).toBe('user');
      expect(message.content).toBe('Hello');
    });

    it('should have correct ToolCall structure', () => {
      const toolCall: ToolCall = {
        id: 'call_1',
        name: 'test_tool',
        arguments: { param: 'value' },
      };
      expect(toolCall.id).toBe('call_1');
      expect(toolCall.name).toBe('test_tool');
    });

    it('should have correct LLMToolDefinition structure', () => {
      const tool: LLMToolDefinition = {
        type: 'function',
        function: {
          name: 'test',
          description: 'A test tool',
          parameters: { type: 'object' },
        },
      };
      expect(tool.type).toBe('function');
      expect(tool.function.name).toBe('test');
    });
  });
});
