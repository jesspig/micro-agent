/**
 * Agent 执行器
 *
 * 实现 ReAct 循环处理消息并协调工具调用。
 */

import type { InboundMessage, OutboundMessage, ToolContext, ToolCall, ToolResult } from '@microbot/types';
import type { LLMGateway, LLMMessage, LLMToolDefinition } from '@microbot/providers';
import type { MessageBus } from '../bus/queue';
import { getLogger } from '@logtape/logtape';

const log = getLogger(['executor']);

/**
 * 工具注册表接口（避免循环依赖）
 */
export interface ToolRegistryLike {
  getDefinitions(): Array<{ name: string; description: string; inputSchema: unknown }>;
  execute(name: string, input: unknown, ctx: ToolContext): Promise<string>;
}

/**
 * 将工具定义转换为 LLM 格式
 */
function toLLMToolDefinitions(tools: Array<{ name: string; description: string; inputSchema: unknown }>): LLMToolDefinition[] {
  return tools.map(tool => ({
    type: 'function' as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.inputSchema as Record<string, unknown>,
    },
  }));
}

/**
 * Agent 配置
 */
export interface AgentExecutorConfig {
  /** 工作目录 */
  workspace: string;
  /** 最大迭代次数 */
  maxIterations: number;
  /** 最大 tokens */
  maxTokens: number;
  /** 温度 */
  temperature: number;
  /** 系统提示词 */
  systemPrompt?: string;
}

const DEFAULT_CONFIG: AgentExecutorConfig = {
  workspace: './workspace',
  maxIterations: 20,
  maxTokens: 8192,
  temperature: 0.7,
};

/**
 * Agent 执行器
 *
 * 处理消息并协调工具调用。
 */
export class AgentExecutor {
  private running = false;
  private conversationHistory = new Map<string, LLMMessage[]>();

  constructor(
    private bus: MessageBus,
    private gateway: LLMGateway,
    private tools: ToolRegistryLike,
    private config: AgentExecutorConfig = DEFAULT_CONFIG
  ) {}

  /**
   * 启动执行器
   */
  async run(): Promise<void> {
    this.running = true;
    log.info('Agent 执行器已启动');
    log.info('配置: maxIterations={maxIterations}, maxTokens={maxTokens}, temperature={temperature}', {
      maxIterations: this.config.maxIterations,
      maxTokens: this.config.maxTokens,
      temperature: this.config.temperature,
    });
    
    // 显示可用工具
    const tools = this.tools.getDefinitions();
    log.info('可用工具 ({count}个): {tools}', { 
      count: tools.length, 
      tools: tools.map(t => t.name).join(', ') 
    });
    
    // 显示系统提示词长度
    if (this.config.systemPrompt) {
      log.info('系统提示词: {length} 字符', { length: this.config.systemPrompt.length });
      log.info('系统提示词预览:\n{preview}', { 
        preview: this.config.systemPrompt.length > 500 
          ? this.config.systemPrompt.slice(0, 500) + '...\n[已截断]' 
          : this.config.systemPrompt 
      });
    }

    while (this.running) {
      try {
        const msg = await this.bus.consumeInbound();
        log.info('════════════════════════════════════════════════════════════');
        log.info('📥 收到消息');
        log.info('  通道: {channel}, 聊天ID: {chatId}', { channel: msg.channel, chatId: msg.chatId });
        log.info('  发送者: {senderId}', { senderId: msg.senderId });
        log.info('  内容: {content}', { content: msg.content });
        
        const startTime = Date.now();
        const response = await this.processMessage(msg);
        const elapsed = Date.now() - startTime;
        
        if (response) {
          await this.bus.publishOutbound(response);
          log.info('📤 回复已发送 (耗时 {elapsed}ms)', { elapsed });
          log.info('  内容预览: {preview}', { preview: this.preview(response.content, 100) });
        }
        log.info('════════════════════════════════════════════════════════════');
      } catch (error) {
        log.error('❌ 处理消息失败: {error}', { error: this.errorMsg(error) });
      }
    }
  }

  /**
   * 停止执行器
   */
  stop(): void {
    this.running = false;
    log.info('Agent 执行器已停止');
  }

  /**
   * 处理单条消息（供外部调用）
   */
  async processMessage(msg: InboundMessage): Promise<OutboundMessage | null> {
    const sessionKey = `${msg.channel}:${msg.chatId}`;
    
    // 获取会话历史（不包含系统消息）
    const sessionHistory = this.conversationHistory.get(sessionKey) ?? [];
    log.debug('会话历史长度: {length}', { length: sessionHistory.length });
    
    // 构建发送给 LLM 的消息列表（包含系统提示词）
    const messages: LLMMessage[] = [];
    
    // 1. 添加系统消息（每次都重新添加）
    if (this.config.systemPrompt) {
      messages.push({ role: 'system', content: this.config.systemPrompt });
    }
    
    // 2. 添加历史消息
    messages.push(...sessionHistory);
    
    // 3. 添加当前用户消息
    messages.push({ role: 'user', content: msg.content });

    try {
      // ReAct 循环
      let iteration = 0;
      let lastContent = '';
      
      // 获取工具定义
      const availableTools = this.tools.getDefinitions();
      log.debug('可用工具: {tools}', { tools: availableTools.map(t => t.name).join(', ') });
      
      while (iteration < this.config.maxIterations) {
        iteration++;
        log.info('🔄 ReAct 迭代 #{iteration}', { iteration });
        
        // 获取工具定义并转换为 LLM 格式
        const toolDefinitions = toLLMToolDefinitions(availableTools);
        
        // 调用 LLM（使用包含系统消息的 messages）
        const llmStartTime = Date.now();
        log.info('  🤖 调用 LLM...');
        
        const response = await this.gateway.chat(messages, toolDefinitions, undefined, {
          maxTokens: this.config.maxTokens,
          temperature: this.config.temperature,
        });
        const llmElapsed = Date.now() - llmStartTime;

        // 记录 LLM 响应详情
        log.info('  ✅ LLM 响应 (耗时 {elapsed}ms)', { elapsed: llmElapsed });
        log.info('    模型: {provider}/{model}', { 
          provider: response.usedProvider ?? 'unknown', 
          model: response.usedModel ?? 'unknown' 
        });
        if (response.usage) {
          log.info('    Token: 输入={input}, 输出={output}, 总计={total}', {
            input: response.usage.inputTokens,
            output: response.usage.outputTokens,
            total: response.usage.totalTokens,
          });
        }
        log.debug('    内容: {content}', { content: this.preview(response.content, 200) });

        // 添加助手回复到消息列表
        const assistantMessage: LLMMessage = {
          role: 'assistant',
          content: response.content,
        };
        if (response.toolCalls && response.toolCalls.length > 0) {
          assistantMessage.toolCalls = response.toolCalls;
        }
        messages.push(assistantMessage);

        // 如果没有工具调用，返回最终回复
        if (!response.hasToolCalls || !response.toolCalls || response.toolCalls.length === 0) {
          log.info('  📝 无工具调用，返回最终回复');
          lastContent = response.content;
          break;
        }

        // 执行工具调用
        log.info('  🔧 执行 {count} 个工具调用...', { count: response.toolCalls.length });
        for (const toolCall of response.toolCalls) {
          log.info('    ▶ 工具: {name}', { name: toolCall.name });
          log.info('      参数: {args}', { args: JSON.stringify(toolCall.arguments, null, 2) });
          
          const toolStartTime = Date.now();
          const toolResult = await this.executeToolCall(toolCall, msg);
          const toolElapsed = Date.now() - toolStartTime;
          
          log.info('      ✅ 完成 (耗时 {elapsed}ms)', { elapsed: toolElapsed });
          log.info('      结果: {result}', { result: this.preview(toolResult, 500) });
          
          // 添加工具结果到消息列表
          messages.push({
            role: 'tool',
            content: toolResult,
            toolCallId: toolCall.id,
          });
        }
      }

      if (iteration >= this.config.maxIterations) {
        log.warn('  ⚠️ 达到最大迭代次数 {maxIterations}', { maxIterations: this.config.maxIterations });
      }

      // 更新会话历史
      // 存储完整的消息历史（不包含系统消息，系统消息每次都会重新添加）
      // messages[0] 是系统消息，从 messages[1] 开始是用户消息历史 + 当前对话
      const newHistory = messages.slice(1); // 跳过系统消息
      this.conversationHistory.set(sessionKey, newHistory);

      // 返回出站消息
      return {
        channel: msg.channel,
        chatId: msg.chatId,
        content: lastContent || '处理完成',
        media: [],
        metadata: msg.metadata,
      };
    } catch (error) {
      log.error('❌ 处理消息异常: {error}', { error: this.errorMsg(error) });
      log.error('堆栈: {stack}', { stack: error instanceof Error ? error.stack : '' });
      
      return {
        channel: msg.channel,
        chatId: msg.chatId,
        content: `处理消息时出错: ${this.errorMsg(error)}`,
        media: [],
        metadata: msg.metadata,
      };
    }
  }

  /**
   * 执行工具调用
   */
  private async executeToolCall(toolCall: ToolCall, msg: InboundMessage): Promise<string> {
    const ctx = this.createContext(msg);
    
    try {
      const result = await this.tools.execute(toolCall.name, toolCall.arguments, ctx);
      return result;
    } catch (error) {
      const errorMsg = this.errorMsg(error);
      log.error('      ❌ 工具执行失败: {error}', { error: errorMsg });
      return JSON.stringify({
        error: errorMsg,
        tool: toolCall.name,
      });
    }
  }

  /**
   * 创建工具上下文
   */
  createContext(msg: InboundMessage): ToolContext {
    return {
      channel: msg.channel,
      chatId: msg.chatId,
      workspace: this.config.workspace,
      currentDir: msg.currentDir || this.config.workspace,
      sendToBus: async (m) => this.bus.publishOutbound(m as OutboundMessage),
    };
  }

  /**
   * 清除会话历史
   */
  clearSession(channel: string, chatId: string): void {
    const sessionKey = `${channel}:${chatId}`;
    this.conversationHistory.delete(sessionKey);
    log.info('会话已清除: {sessionKey}', { sessionKey });
  }

  private preview(text: string, maxLen = 50): string {
    if (!text) return '';
    return text.length > maxLen ? text.slice(0, maxLen) + '...' : text;
  }

  private errorMsg(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
