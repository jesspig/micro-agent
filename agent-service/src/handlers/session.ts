/**
 * 会话处理器
 *
 * 处理会话相关的 IPC 消息
 */

import { logSessionLifecycle } from '../logger';
import type { AgentServiceConfig, SessionData } from '../types';
import type { ServiceComponents } from '../types';

/**
 * 会话管理器
 */
export class SessionManager {
  private _sessions = new Map<string, SessionData>();

  /** 获取会话映射（只读） */
  get sessions(): Map<string, SessionData> {
    return this._sessions;
  }

  /** 获取或创建会话 */
  getOrCreate(sessionId: string): SessionData {
    if (!this._sessions.has(sessionId)) {
      this._sessions.set(sessionId, { messages: [] });
      logSessionLifecycle('create', sessionId);
    }
    return this._sessions.get(sessionId)!;
  }

  /** 获取会话 */
  get(sessionId: string): SessionData | undefined {
    return this._sessions.get(sessionId);
  }

  /** 添加消息到会话 */
  addMessage(sessionId: string, role: string, content: string): void {
    const session = this.getOrCreate(sessionId);
    session.messages.push({ role, content });
  }

  /** 获取会话数量 */
  get size(): number {
    return this._sessions.size;
  }

  /** 清除所有会话 */
  clear(): void {
    this._sessions.clear();
  }
}

/**
 * 处理状态查询
 */
export function handleStatus(
  components: ServiceComponents,
  sessionManager: SessionManager
): Record<string, unknown> {
  return {
    version: '1.0.0',
    uptime: Math.floor(process.uptime()),
    activeSessions: sessionManager.size,
    provider: components.llmProvider ? {
      name: components.llmProvider.name,
      model: components.defaultModel,
    } : null,
    tools: components.toolRegistry?.size ?? 0,
  };
}

/**
 * 处理任务执行
 */
export async function handleExecute(
  params: unknown,
  components: ServiceComponents,
  _config: AgentServiceConfig
): Promise<unknown> {
  const { sessionId, content } = params as {
    sessionId: string;
    content: { type: string; text: string };
  };

  if (components.llmProvider) {
    const messages = [
      { role: 'system' as const, content: components.systemPrompt },
      { role: 'user' as const, content: content.text },
    ];

    const response = await components.llmProvider.chat(
      messages,
      undefined,
      components.defaultModel
    );
    return {
      sessionId,
      content: response.content,
      done: true,
    };
  }

  return {
    sessionId,
    content: `执行结果: ${content.text}`,
    done: true,
  };
}
