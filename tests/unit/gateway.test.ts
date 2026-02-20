import { describe, it, expect, beforeEach } from 'bun:test';
import { LLMGateway, type LLMProvider, type LLMMessage, type LLMResponse } from '@microbot/core/providers';
import type { ModelConfig } from '@microbot/core/config';

/** Mock Provider 用于测试 */
class MockProvider implements LLMProvider {
  constructor(
    readonly name: string,
    private available: boolean = true,
    private response: LLMResponse = { content: 'test response', hasToolCalls: false },
    private models: string[] = []
  ) {}

  async chat(): Promise<LLMResponse> {
    if (!this.available) {
      throw new Error('Provider not available');
    }
    return this.response;
  }

  getDefaultModel(): string {
    return `${this.name}-model`;
  }

  async isAvailable(): Promise<boolean> {
    return this.available;
  }

  getModelCapabilities(modelId: string): ModelConfig {
    return { id: modelId, vision: false, think: false, tool: true };
  }

  async listModels(): Promise<string[] | null> {
    if (!this.available) {
      return null;
    }
    return this.models.length > 0 ? this.models : [`${this.name}-model`];
  }
}

describe('LLMGateway', () => {
  let gateway: LLMGateway;

  beforeEach(() => {
    gateway = new LLMGateway({ defaultProvider: 'test1', fallbackEnabled: true });
  });

  describe('Provider 注册', () => {
    it('should register provider', () => {
      const provider = new MockProvider('test1');
      gateway.registerProvider('test1', provider, ['model1'], 1);
      
      expect(gateway.getProviderNames()).toContain('test1');
    });

    it('should register multiple providers', () => {
      gateway.registerProvider('test1', new MockProvider('test1'), ['model1'], 1);
      gateway.registerProvider('test2', new MockProvider('test2'), ['model2'], 2);
      
      expect(gateway.getProviderNames()).toHaveLength(2);
    });
  });

  describe('路由', () => {
    it('should route to provider by model', async () => {
      const provider1 = new MockProvider('test1');
      const provider2 = new MockProvider('test2');
      
      gateway.registerProvider('test1', provider1, ['qwen3'], 1);
      gateway.registerProvider('test2', provider2, ['gpt-4'], 10);
      
      // qwen3 应路由到 test1
      const result = await gateway.chat([{ role: 'user', content: 'hi' }], [], 'qwen3');
      expect(result.content).toBe('test response');
    });

    it('should use default provider when model not specified', async () => {
      gateway.registerProvider('test1', new MockProvider('test1'), ['model1'], 1);
      
      const result = await gateway.chat([{ role: 'user', content: 'hi' }]);
      expect(result.content).toBe('test response');
    });

    it('should match wildcard models', async () => {
      const provider1 = new MockProvider('test1');
      gateway.registerProvider('test1', provider1, ['*'], 1);
      
      const result = await gateway.chat([{ role: 'user', content: 'hi' }], [], 'any-model');
      expect(result.content).toBe('test response');
    });
  });

  describe('故障转移', () => {
    it('should fallback to next provider on failure', async () => {
      const failingProvider = new MockProvider('failing', false);
      const workingProvider = new MockProvider('working', true);
      
      gateway.registerProvider('failing', failingProvider, ['model1'], 1);
      gateway.registerProvider('working', workingProvider, ['model1'], 2);
      
      const result = await gateway.chat([{ role: 'user', content: 'hi' }], [], 'model1');
      expect(result.content).toBe('test response');
    });

    it('should throw when all providers fail', async () => {
      gateway.registerProvider('test1', new MockProvider('test1', false), ['model1'], 1);
      gateway.registerProvider('test2', new MockProvider('test2', false), ['model1'], 2);
      
      await expect(gateway.chat([{ role: 'user', content: 'hi' }])).rejects.toThrow('所有 Provider 尝试失败');
    });
  });

  describe('isAvailable', () => {
    it('should return true if any provider is available', async () => {
      gateway.registerProvider('test1', new MockProvider('test1', false), ['model1'], 1);
      gateway.registerProvider('test2', new MockProvider('test2', true), ['model2'], 2);
      
      expect(await gateway.isAvailable()).toBe(true);
    });

    it('should return false if no provider is available', async () => {
      gateway.registerProvider('test1', new MockProvider('test1', false), ['model1'], 1);
      
      expect(await gateway.isAvailable()).toBe(false);
    });
  });
});
