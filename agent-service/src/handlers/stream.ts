/**
 * 流式处理处理器
 *
 * 处理流式聊天、工具调用等流式通信逻辑
 */

import { getLogger, getTracer } from '../../runtime/infrastructure/logging/logger';
import { logSessionLifecycle } from '../logger';
import { handleToolCalls } from './tool-calls';
import type { AgentServiceConfig, ServiceComponents, SessionData } from '../types';
import type { InboundMessage } from '../../types/message';
import type { ChannelType } from '../../types/interfaces';
import type { StreamCallbacks } from '../../runtime/kernel/orchestrator';
import { USER_KNOWLEDGE_DIR } from '../../runtime/infrastructure/config';

const log = getLogger(['agent-service', 'handlers', 'stream']);
const tracer = getTracer();

/**
 * 处理流式聊天（IPC 模式）
 */
export async function handleChatStream(
  params: unknown,
  requestId: string,
  components: ServiceComponents,
  config: AgentServiceConfig,
  sessions: Map<string, SessionData>
): Promise<void> {
  const { sessionId, content } = params as {
    sessionId: string;
    content: { type: string; text: string };
  };

  logSessionLifecycle('create', sessionId);

  if (!sessions.has(sessionId)) {
    sessions.set(sessionId, { messages: [] });
  }
  const session = sessions.get(sessionId)!;
  session.messages.push({ role: 'user', content: content.text });

  // 如果 Orchestrator 已初始化，使用它进行流式处理
  if (components.orchestrator) {
    try {
      await streamWithOrchestrator(sessionId, content.text, requestId, components, config);
      return;
    } catch (error) {
      log.error('Orchestrator 处理失败', { error: (error as Error).message });
    }
  }

  // 回退：直接使用 LLM Provider
  if (components.llmProvider) {
    try {
      await streamFromLLM(session, content.text, requestId, components, config);
      return;
    } catch (error) {
      log.error('LLM 调用失败', { error: (error as Error).message });
    }
  }

  await streamMockResponse(content.text, requestId);
}

/**
 * 使用 Orchestrator 进行流式处理
 */
async function streamWithOrchestrator(
  sessionId: string,
  userMessage: string,
  requestId: string,
  components: ServiceComponents,
  config: AgentServiceConfig
): Promise<void> {
  if (!components.orchestrator || !components.llmProvider || !components.toolRegistry) return;

  const msg: InboundMessage = {
    channel: 'ipc' as ChannelType,
    senderId: requestId,
    chatId: sessionId,
    content: userMessage,
    timestamp: new Date(),
    media: [],
    metadata: {},
  };

  const callbacks: StreamCallbacks = {
    onChunk: async (chunk: string) => {
      process.send?.({
        jsonrpc: '2.0',
        id: requestId,
        method: 'stream',
        params: { delta: chunk, done: false },
      });
    },
    onComplete: async () => {
      process.send?.({
        jsonrpc: '2.0',
        id: requestId,
        method: 'stream',
        params: { done: true },
      });
    },
    onError: async (error: Error) => {
      log.error('流式处理错误', { error: error.message });
      process.send?.({
        jsonrpc: '2.0',
        id: requestId,
        error: { code: -32005, message: error.message },
      });
    },
  };

  const skillContext = buildSkillContext(userMessage, components);
  const updatedSystemPrompt = components.systemPrompt + skillContext;

  const knowledgeBasePath = components.knowledgeConfig?.basePath
    ?? config.knowledgeBase
    ?? USER_KNOWLEDGE_DIR;

  const orchestratorConfig = {
    llmProvider: components.llmProvider,
    defaultModel: components.defaultModel,
    maxIterations: config.maxIterations ?? 20,
    systemPrompt: updatedSystemPrompt,
    workspace: config.workspace ?? process.cwd(),
    knowledgeBase: knowledgeBasePath,
  };

  const { AgentOrchestrator } = await import('../../runtime/kernel/orchestrator');
  const updatedOrchestrator = new AgentOrchestrator(
    orchestratorConfig,
    components.toolRegistry,
    components.memoryManager ?? undefined,
    components.sessionStore ?? undefined,
    components.knowledgeRetriever ?? undefined
  );

  await updatedOrchestrator.processMessageStream(msg, callbacks, {
    currentDir: config.workspace,
  });

  log.info('Orchestrator 流式处理完成', { sessionId });
}

/**
 * 从 LLM 获取流式响应
 */
async function streamFromLLM(
  session: SessionData,
  userMessage: string,
  requestId: string,
  components: ServiceComponents,
  config: AgentServiceConfig
): Promise<void> {
  if (!components.llmProvider || !components.toolRegistry) return;

  const startTime = Date.now();
  const skillContext = buildSkillContext(userMessage, components);
  const systemPromptWithSkills = components.systemPrompt + skillContext;

  const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    { role: 'system', content: systemPromptWithSkills },
  ];

  const recentMessages = session.messages.slice(-10);
  for (const msg of recentMessages) {
    messages.push({
      role: msg.role as 'user' | 'assistant',
      content: msg.content,
    });
  }

  const tools = components.toolRegistry.getDefinitions() || [];
  const llmTools = tools.length > 0 ? tools.map(t => ({
    type: 'function' as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.inputSchema as Record<string, unknown>,
    },
  })) : undefined;

  try {
    const response = await components.llmProvider.chat(messages, llmTools, components.defaultModel);
    const elapsed = Date.now() - startTime;

    tracer.logLLMCall(
      components.defaultModel,
      components.llmProvider.name,
      messages.length,
      tools.length,
      elapsed,
      true,
      undefined,
      undefined,
      response.content?.slice(0, 100),
      response.hasToolCalls
    );

    if (response.hasToolCalls && response.toolCalls) {
      await handleToolCalls(
        response.toolCalls,
        messages,
        requestId,
        components,
        config.workspace,
        config.knowledgeBase
      );
      return;
    }

    const fullContent = response.content || '';

    for (let i = 0; i < fullContent.length; i += 20) {
      const chunk = fullContent.slice(i, i + 20);
      process.send?.({
        jsonrpc: '2.0',
        id: requestId,
        method: 'stream',
        params: { delta: chunk, done: false },
      });
      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    process.send?.({
      jsonrpc: '2.0',
      id: requestId,
      method: 'stream',
      params: { done: true },
    });

    session.messages.push({ role: 'assistant', content: fullContent });
  } catch (error) {
    const elapsed = Date.now() - startTime;
    tracer.logLLMCall(
      components.defaultModel,
      components.llmProvider.name,
      messages.length,
      tools.length,
      elapsed,
      false,
      undefined,
      error instanceof Error ? error.message : String(error)
    );
    throw error;
  }
}

/**
 * 模拟流式响应
 */
async function streamMockResponse(userMessage: string, requestId: string): Promise<void> {
  const response = `收到消息: "${userMessage}"。Agent Service 正在运行。`;

  for (let i = 0; i < response.length; i += 10) {
    const chunk = response.slice(i, i + 10);
    process.send?.({
      jsonrpc: '2.0',
      id: requestId,
      method: 'stream',
      params: { delta: chunk, done: false },
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
  }

  process.send?.({
    jsonrpc: '2.0',
    id: requestId,
    method: 'stream',
    params: { done: true },
  });
}

/**
 * 处理流式聊天（独立模式回调）
 */
export async function handleChatStreamToCallback(
  params: unknown,
  sendChunk: (chunk: { delta?: string; done: boolean }) => void,
  components: ServiceComponents,
  sessions: Map<string, SessionData>
): Promise<void> {
  const { sessionId, content } = params as {
    sessionId: string;
    content: { type: string; text: string };
  };

  logSessionLifecycle('create', sessionId);

  if (!sessions.has(sessionId)) {
    sessions.set(sessionId, { messages: [] });
  }
  const session = sessions.get(sessionId)!;
  session.messages.push({ role: 'user', content: content.text });

  if (components.llmProvider) {
    try {
      const skillContext = buildSkillContext(content.text, components);
      const systemPromptWithSkills = components.systemPrompt + skillContext;

      const messages = [
        { role: 'system' as const, content: systemPromptWithSkills },
        { role: 'user' as const, content: content.text },
      ];
      const response = await components.llmProvider.chat(messages, undefined, components.defaultModel);

      sendChunk({ delta: response.content || '', done: false });
      sendChunk({ done: true });
      session.messages.push({ role: 'assistant', content: response.content || '' });
      return;
    } catch (error) {
      log.error('LLM 调用失败', { error: (error as Error).message });
    }
  }

  const response = `收到消息: "${content.text}"。Agent Service 正在运行。`;
  sendChunk({ delta: response, done: false });
  sendChunk({ done: true });
  session.messages.push({ role: 'assistant', content: response });
}

/**
 * 构建技能上下文提示
 */
function buildSkillContext(userMessage: string, components: ServiceComponents): string {
  if (!components.skillRegistry || components.skillRegistry.size === 0) return '';

  const matches = components.skillRegistry.matchByScenario(userMessage);
  if (matches.length === 0) return '';

  const topMatches = matches.slice(0, 3);
  const skillContexts = topMatches.map(m => {
    const skill = m.skill;
    let context = `### 技能: ${skill.name}\n${skill.description}\n`;
    if (skill.promptTemplate) {
      context += `\n${skill.promptTemplate.slice(0, 500)}...\n`;
    }
    return context;
  });

  return `\n\n# 相关技能\n\n${skillContexts.join('\n---\n\n')}\n`;
}