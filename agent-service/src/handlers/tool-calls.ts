/**
 * 工具调用处理器
 *
 * 处理 LLM 工具调用的执行和结果处理
 */

import { getTracer } from '../../runtime/infrastructure/logging/logger';
import type { ServiceComponents } from '../types';
import type { ToolContext } from '../../runtime/capability/tool-system/registry';
import { USER_KNOWLEDGE_DIR } from '../../runtime/infrastructure/config';

const tracer = getTracer();

/**
 * 处理工具调用
 */
export async function handleToolCalls(
  toolCalls: Array<{ id: string; name: string; arguments: Record<string, unknown> }>,
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  requestId: string,
  components: ServiceComponents,
  workspace?: string,
  knowledgeBase?: string
): Promise<void> {
  if (!components.toolRegistry || !components.llmProvider) return;

  messages.push({
    role: 'assistant',
    content: '',
  });

  for (const tc of toolCalls) {
    const startTime = Date.now();

    try {
      const toolContext: ToolContext = {
        channel: 'ipc',
        chatId: requestId,
        workspace: workspace ?? process.cwd(),
        currentDir: workspace ?? process.cwd(),
        knowledgeBase: knowledgeBase ?? USER_KNOWLEDGE_DIR,
        sendToBus: async () => {},
      };

      const result = await components.toolRegistry.execute(tc.name, tc.arguments, toolContext);
      const resultContent = typeof result.content === 'string'
        ? result.content
        : JSON.stringify(result.content);
      const elapsed = Date.now() - startTime;

      tracer.logToolCall(tc.name, tc.arguments, resultContent, elapsed, true);

      messages.push({
        role: 'user' as const,
        content: `工具 ${tc.name} 结果: ${resultContent}`,
      });
    } catch (error) {
      const elapsed = Date.now() - startTime;
      tracer.logToolCall(
        tc.name,
        tc.arguments,
        '',
        elapsed,
        false,
        error instanceof Error ? error.message : String(error)
      );
      throw error;
    }
  }

  const finalResponse = await components.llmProvider.chat(messages, undefined, components.defaultModel);
  const fullContent = finalResponse.content || '';

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
}
