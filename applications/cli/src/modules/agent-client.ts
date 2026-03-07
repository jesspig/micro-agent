/**
 * Agent 客户端
 * 
 * 通过 IPC 与 Agent Service 通信。
 */

import { MicroAgentClient } from '@micro-agent/sdk';
import type { StreamChunk, ToolConfig, SkillConfig, MemoryConfig, KnowledgeConfig } from '@micro-agent/sdk';
import { getLogger } from '@logtape/logtape';
import type { AgentClient, MessageContent } from './message-router';

const log = getLogger(['cli', 'agent-client']);

/**
 * Agent 客户端配置
 */
export interface AgentClientConfig {
  /** IPC 路径 */
  ipcPath?: string;
  /** 超时时间 */
  timeout?: number;
}

/**
 * Agent 客户端实现
 */
export class AgentClientImpl implements AgentClient {
  private client: MicroAgentClient;
  private _connected = false;

  constructor(config?: AgentClientConfig) {
    this.client = new MicroAgentClient({
      transport: 'ipc',
      ipc: {
        path: config?.ipcPath,
        timeout: config?.timeout ?? 60000,
        logHandler: this.handleServiceLog.bind(this),
      },
    });
  }

  get connected(): boolean {
    return this._connected;
  }

  /**
   * 处理 Agent Service 的日志输出
   * 
   * 解析 JSON 格式日志：
   * - 所有日志写入文件
   * - warn/error: 前台显示（通过 logtape consoleLevel 控制）
   * - 用户对话/LLM输出/工具调用: 默认前台显示
   * - 其他 info/debug: 仅 verbose 模式下前台显示
   */
  private handleServiceLog(text: string, type: 'stdout' | 'stderr'): void {
    const trimmed = text.trim();
    if (!trimmed) return;

    // 尝试解析 JSON 日志
    try {
      const entry = JSON.parse(trimmed);
      const level = entry.level || 'info';
      const category = entry.category || '';
      const message = Array.isArray(entry.message) ? entry.message.join('') : entry.message;
      const props = entry.properties || {};

      // 判断是否为用户关心的核心日志
      const isUserMessage = message.includes('收到用户消息');
      const isLLMResponse = message.includes('LLM 响应');
      const isLLMThinking = message.includes('LLM 思考');
      const isToolCall = message.includes('执行工具调用') || message.includes('工具执行完成');

      // 前台显示逻辑（console.log 直接到控制台，不经过 logtape）
      // warn/error: 由 logtape 处理（consoleLevel=warn）
      if (level === 'error' || level === 'fatal') {
        log.error(message, props);
      } else if (level === 'warn' || level === 'warning') {
        log.warn(message, props);
      }
      // 用户消息: 前台显示
      else if (isUserMessage && props.content) {
        console.log(`\x1b[36m[用户]\x1b[0m ${String(props.content)}`);
        log.info(message, props);
      }
      // LLM 思考过程: 前台显示（简化版）
      else if (isLLMThinking) {
        const iteration = props.iteration as number;
        const toolCalls = props.toolCalls as string[] | undefined;
        const content = props.content as string | undefined;
        
        if (toolCalls && toolCalls.length > 0) {
          console.log(`\x1b[33m[思考 #${iteration}]\x1b[0m 准备调用: ${toolCalls.join(', ')}`);
        } else if (content) {
          console.log(`\x1b[33m[思考 #${iteration}]\x1b[0m ${content.slice(0, 100)}...`);
        }
        log.info(message, props);
      }
      // LLM 响应: 前台显示
      else if (isLLMResponse && props.content) {
        const content = String(props.content);
        if (content.length > 300) {
          console.log(`\x1b[35m[LLM]\x1b[0m ${content.slice(0, 300)}...`);
        } else {
          console.log(`\x1b[35m[LLM]\x1b[0m ${content}`);
        }
        log.info(message, props);
      }
      // 工具调用: 前台显示
      else if (isToolCall) {
        const toolName = props.name as string;
        if (message.includes('执行工具调用')) {
          const args = props.arguments as Record<string, unknown> | undefined;
          const argsStr = args ? ` (${JSON.stringify(args).slice(0, 60)}...)` : '';
          console.log(`\x1b[34m[工具]\x1b[0m 调用 \x1b[1m${toolName}\x1b[0m${argsStr}`);
        } else {
          const resultLength = props.resultLength as number | undefined;
          const error = props.error as string | undefined;
          if (error) {
            console.log(`\x1b[31m[工具]\x1b[0m ${toolName} \x1b[31m失败\x1b[0m: ${error.slice(0, 100)}`);
          } else {
            console.log(`\x1b[32m[工具]\x1b[0m ${toolName} \x1b[32m完成\x1b[0m (${resultLength ?? '?'} bytes)`);
          }
        }
        log.info(message, props);
      }
      // 其他日志: verbose 模式下前台显示
      else {
        log.info(message, props);
        if (process.env.MICRO_AGENT_VERBOSE === 'true') {
          console.log(`\x1b[90m[${category}]\x1b[0m ${message}`);
        }
      }
    } catch {
      // 非 JSON 格式，verbose 模式下显示
      log.debug(trimmed);
      if (process.env.MICRO_AGENT_VERBOSE === 'true') {
        console.log(`\x1b[90m[raw]\x1b[0m ${trimmed.slice(0, 200)}`);
      }
    }
  }

  /**
   * 连接到 Agent Service
   */
  async connect(): Promise<void> {
    await this.client.connect();
    this._connected = true;
    log.info('已连接到 Agent Service');
  }

  /**
   * 断开连接
   */
  async disconnect(): Promise<void> {
    await this.client.disconnect();
    this._connected = false;
    log.info('已断开连接');
  }

  /**
   * 发送消息（流式）
   */
  async *chat(
    sessionId: string,
    content: MessageContent,
    metadata?: Record<string, unknown>
  ): AsyncIterable<StreamChunk> {
    if (!this._connected) {
      throw new Error('未连接到 Agent Service');
    }

    const text = content.type === 'text' ? content.text : JSON.stringify(content);

    // 使用 SDK 的流式接口
    for await (const chunk of this.client.chatStream({
      sessionId,
      content: { type: 'text', text },
      metadata,
    })) {
      yield chunk;
    }
  }

  /**
   * 执行任务（非流式）
   */
  async execute(
    sessionId: string,
    content: MessageContent,
    metadata?: Record<string, unknown>
  ): Promise<string> {
    if (!this._connected) {
      throw new Error('未连接到 Agent Service');
    }

    const text = content.type === 'text' ? content.text : JSON.stringify(content);

    const response = await this.client.chat.send(sessionId, text);

    return response ?? '';
  }

  /**
   * 获取服务状态
   */
  async getStatus(): Promise<{
    version: string;
    uptime: number;
    activeSessions: number;
  }> {
    const result = await this.client.sendRequest('status', {});
    return result as {
      version: string;
      uptime: number;
      activeSessions: number;
    };
  }

  /**
   * 设置系统提示词
   */
  async setSystemPrompt(prompt: string): Promise<void> {
    if (!this._connected) {
      throw new Error('未连接到 Agent Service');
    }
    await this.client.config.setSystemPrompt(prompt);
    log.info('系统提示词已设置');
  }

  /**
   * 注册工具
   */
  async registerTools(tools: ToolConfig[]): Promise<{ count: number; tools: string[] }> {
    if (!this._connected) {
      throw new Error('未连接到 Agent Service');
    }
    await this.client.config.registerTools(tools);
    log.info('工具已注册', { count: tools.length });
    return { count: tools.length, tools: tools.map(t => t.name) };
  }

  /**
   * 加载技能
   */
  async loadSkills(skills: SkillConfig[]): Promise<{ count: number; skills: string[] }> {
    if (!this._connected) {
      throw new Error('未连接到 Agent Service');
    }
    await this.client.config.loadSkills(skills);
    log.info('技能已加载', { count: skills.length });
    return { count: skills.length, skills: skills.map(s => s.name) };
  }

  /**
   * 配置记忆系统
   */
  async configureMemory(config: MemoryConfig): Promise<void> {
    if (!this._connected) {
      throw new Error('未连接到 Agent Service');
    }
    await this.client.config.configureMemory(config);
    log.info('记忆系统已配置', { enabled: config.enabled, mode: config.mode });
  }

  /**
   * 配置知识库
   */
  async configureKnowledge(config: KnowledgeConfig): Promise<void> {
    if (!this._connected) {
      throw new Error('未连接到 Agent Service');
    }
    await this.client.config.configureKnowledge(config);
    log.info('知识库已配置', { enabled: config.enabled });
  }

  /**
   * 重新加载配置
   * 
   * 通知 Agent Service 重新加载配置文件并重新初始化 LLM Provider
   */
  async reloadConfig(): Promise<{ success: boolean; hasProvider: boolean; defaultModel: string }> {
    if (!this._connected) {
      throw new Error('未连接到 Agent Service');
    }

    const result = await this.client.config.reloadConfig();
    log.info('配置已重新加载', { 
      hasProvider: result.hasProvider, 
      defaultModel: result.defaultModel 
    });
    return result;
  }
}