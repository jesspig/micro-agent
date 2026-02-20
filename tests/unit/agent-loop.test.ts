import { describe, it, expect, beforeEach } from 'bun:test';
import { AgentLoop, type AgentConfig } from '@microbot/core';
import type { LLMProvider, LLMResponse } from '@microbot/core';
import type { ModelConfig, MessageBus, SessionStore, ToolRegistry, InboundMessage } from '@microbot/core';

// Mock implementations
class MockProvider implements LLMProvider {
  readonly name = 'mock';
  private responses: LLMResponse[] = [];
  private callCount = 0;

  setResponses(responses: LLMResponse[]) {
    this.responses = responses;
    this.callCount = 0;
  }

  async chat(): Promise<LLMResponse> {
    return this.responses[this.callCount++] || { content: 'default', hasToolCalls: false };
  }

  getDefaultModel(): string {
    return 'mock-model';
  }

  async isAvailable(): Promise<boolean> {
    return true;
  }

  getModelCapabilities(modelId: string): ModelConfig {
    return { id: modelId, vision: false, think: false, tool: true };
  }
}

class MockBus implements MessageBus {
  private inboundQueue: InboundMessage[] = [];
  private outboundQueue: unknown[] = [];

  async publishInbound(msg: InboundMessage): Promise<void> {
    this.inboundQueue.push(msg);
  }

  async publishOutbound(msg: unknown): Promise<void> {
    this.outboundQueue.push(msg);
  }

  async consumeInbound(): Promise<InboundMessage> {
    while (this.inboundQueue.length === 0) {
      await new Promise(r => setTimeout(r, 10));
    }
    return this.inboundQueue.shift()!;
  }

  async consumeOutbound(): Promise<unknown> {
    while (this.outboundQueue.length === 0) {
      await new Promise(r => setTimeout(r, 10));
    }
    return this.outboundQueue.shift()!;
  }

  getInboundLength(): number {
    return this.inboundQueue.length;
  }

  getOutboundLength(): number {
    return this.outboundQueue.length;
  }
}

class MockSessionStore implements SessionStore {
  private sessions = new Map<string, { messages: Array<{ role: string; content: string }> }>();

  get(key: string) {
    return this.sessions.get(key) || null;
  }

  set() {}

  addMessage(key: string, role: string, content: string) {
    if (!this.sessions.has(key)) {
      this.sessions.set(key, { messages: [] });
    }
    this.sessions.get(key)!.messages.push({ role, content });
  }

  delete() {}
  cleanup() { return 0; }
}

const mockToolRegistry: ToolRegistry = {
  register: () => {},
  get: () => undefined,
  execute: async () => 'tool result',
  getDefinitions: () => [],
} as ToolRegistry;

const mockSkillsLoader = {
  getSummaries: () => [],
  getAlwaysSkills: () => [],
  count: 0,
};

describe('AgentLoop', () => {
  let agent: AgentLoop;
  let bus: MockBus;
  let provider: MockProvider;
  let sessionStore: MockSessionStore;

  const config: AgentConfig = {
    workspace: './test-workspace',
    models: { chat: 'test-model' },
    maxIterations: 5,
  };

  beforeEach(() => {
    bus = new MockBus();
    provider = new MockProvider();
    sessionStore = new MockSessionStore();

    agent = new AgentLoop(
      bus,
      provider,
      sessionStore,
      mockToolRegistry,
      mockSkillsLoader as any,
      config
    );
  });

  describe('processMessage', () => {
    it('should process simple message', async () => {
      provider.setResponses([{ content: 'Hello!', hasToolCalls: false }]);

      const msg: InboundMessage = {
        channel: 'test',
        senderId: 'user1',
        chatId: 'chat1',
        content: 'Hi',
        timestamp: new Date(),
        media: [],
        metadata: {},
      };

      const response = await agent.processMessage(msg);

      expect(response).toBeDefined();
      expect(response!.content).toBe('Hello!');
    });

    it('should save session after processing', async () => {
      provider.setResponses([{ content: 'Response', hasToolCalls: false }]);

      const msg: InboundMessage = {
        channel: 'test',
        senderId: 'user1',
        chatId: 'chat1',
        content: 'Question',
        timestamp: new Date(),
        media: [],
        metadata: {},
      };

      await agent.processMessage(msg);

      const session = sessionStore.get('test:chat1');
      expect(session).toBeDefined();
      expect(session!.messages).toHaveLength(2);
      expect(session!.messages[0].role).toBe('user');
      expect(session!.messages[1].role).toBe('assistant');
    });

    it('should execute tools in ReAct loop', async () => {
      let executeCalled = false;
      const toolRegistry: ToolRegistry = {
        register: () => {},
        get: () => undefined,
        execute: async () => {
          executeCalled = true;
          return 'tool result';
        },
        getDefinitions: () => [{ name: 'test_tool', description: 'A test tool', inputSchema: {} }],
      };

      agent = new AgentLoop(
        bus,
        provider,
        sessionStore,
        toolRegistry,
        mockSkillsLoader as any,
        config
      );

      provider.setResponses([
        {
          content: '',
          hasToolCalls: true,
          toolCalls: [{ id: '1', name: 'test_tool', arguments: {} }],
        },
        { content: 'Done!', hasToolCalls: false },
      ]);

      const msg: InboundMessage = {
        channel: 'test',
        senderId: 'user1',
        chatId: 'chat1',
        content: 'Use tool',
        timestamp: new Date(),
        media: [],
        metadata: {},
      };

      const response = await agent.processMessage(msg);

      expect(executeCalled).toBe(true);
      expect(response!.content).toBe('Done!');
    });
  });
});