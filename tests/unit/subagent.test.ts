import { describe, it, expect, beforeEach } from 'bun:test';
import { SubagentManager } from '@microbot/core/agent';
import type { LLMProvider, LLMResponse } from '@microbot/core/providers';
import type { MessageBus } from '@microbot/core/bus';
import type { InboundMessage } from '@microbot/core/bus';

class MockProvider implements LLMProvider {
  readonly name = 'mock';
  private response: LLMResponse = { content: 'Task done', hasToolCalls: false };

  setResponse(response: LLMResponse) {
    this.response = response;
  }

  async chat(): Promise<LLMResponse> {
    return this.response;
  }

  getDefaultModel(): string {
    return 'mock-model';
  }

  async isAvailable(): Promise<boolean> {
    return true;
  }
}

class MockBus implements MessageBus {
  publishedMessages: InboundMessage[] = [];

  async publishInbound(msg: InboundMessage): Promise<void> {
    this.publishedMessages.push(msg);
  }

  async publishOutbound(): Promise<void> {}
  async consumeInbound(): Promise<InboundMessage> {
    return {} as InboundMessage;
  }
  async consumeOutbound(): Promise<unknown> {
    return {};
  }
  get inboundLength(): number { return 0; }
  get outboundLength(): number { return 0; }
}

describe('SubagentManager', () => {
  let manager: SubagentManager;
  let bus: MockBus;
  let provider: MockProvider;

  beforeEach(() => {
    bus = new MockBus();
    provider = new MockProvider();
    manager = new SubagentManager(provider, './workspace', bus, 'test-model');
  });

  describe('spawn', () => {
    it('should spawn subagent and return message', async () => {
      const result = await manager.spawn(
        'Do something',
        'test-task',
        'feishu',
        'chat123'
      );

      expect(result).toContain('已启动子代理');
      expect(result).toContain('test-task');
      expect(manager.runningCount).toBe(1);
    });

    it('should use generated label if not provided', async () => {
      const result = await manager.spawn('Do something', undefined, 'feishu', 'chat123');

      expect(result).toContain('task-');
    });

    it('should send completion notification', async () => {
      provider.setResponse({ content: 'Task completed successfully', hasToolCalls: false });

      await manager.spawn('Do something', 'my-task', 'feishu', 'chat123');

      await new Promise(r => setTimeout(r, 100));

      expect(bus.publishedMessages.length).toBe(1);
      expect(bus.publishedMessages[0].content).toContain('my-task');
      expect(bus.publishedMessages[0].content).toContain('Task completed successfully');
    });
  });

  describe('runningCount', () => {
    it('should return 0 when no tasks running', () => {
      expect(manager.runningCount).toBe(0);
    });

    it('should track running tasks', async () => {
      provider.setResponse({ content: 'Working...', hasToolCalls: false });

      await manager.spawn('Task 1', 'task1', 'feishu', 'chat1');

      await new Promise(r => setTimeout(r, 50));
      expect(manager.runningCount).toBe(0);
    });
  });
});
