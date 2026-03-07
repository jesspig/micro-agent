/**
 * 调用链追踪器
 * 
 * 提供方法调用的追踪、入参/输出记录和耗时统计。
 * 与结构化日志系统集成，自动记录工具调用和 LLM 调用。
 */

import { getLogger, withContext, type Logger } from '@logtape/logtape';
import type {
  TraceContext,
  ToolCallLog,
  LLMCallLog,
} from './types';

/** 追踪器选项 */
export interface TracerOptions {
  /** 是否启用追踪 */
  enabled: boolean;
  /** 敏感字段列表 */
  sensitiveFields: string[];
  /** 最大深度 */
  maxDepth: number;
}

/** 默认追踪器选项 */
const DEFAULT_OPTIONS: TracerOptions = {
  enabled: true,
  sensitiveFields: ['password', 'token', 'secret', 'apiKey', 'api_key', 'authorization'],
  maxDepth: 10,
};

/**
 * 调用链追踪器
 */
export class Tracer {
  private logger: Logger;
  private options: TracerOptions;
  private currentTraceId: string | null = null;
  private spanCounter = 0;

  constructor(options: Partial<TracerOptions> = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.logger = getLogger(['tracer']);
  }

  /**
   * 生成唯一 ID
   */
  private generateId(): string {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
  }

  /**
   * 生成 Span ID
   */
  private generateSpanId(): string {
    this.spanCounter++;
    return `span-${this.spanCounter.toString(36).padStart(4, '0')}`;
  }

  /**
   * 脱敏处理
   */
  private sanitize(data: unknown, depth = 0): unknown {
    if (depth > 5) return '[深度超限]';
    if (data === null || data === undefined) return data;
    if (typeof data !== 'object') return data;
    if (data instanceof Error) {
      return { name: data.name, message: data.message, stack: data.stack };
    }
    if (Buffer.isBuffer(data)) return '[Buffer]';
    if (Array.isArray(data)) {
      return data.slice(0, 100).map(item => this.sanitize(item, depth + 1));
    }

    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
      const lowerKey = key.toLowerCase();
      if (this.options.sensitiveFields.some(f => lowerKey.includes(f.toLowerCase()))) {
        result[key] = '***REDACTED***';
      } else {
        result[key] = this.sanitize(value, depth + 1);
      }
    }
    return result;
  }

  /**
   * 创建追踪上下文
   */
  createContext(category: string, method: string): TraceContext {
    return {
      traceId: this.currentTraceId ?? this.generateId(),
      spanId: this.generateSpanId(),
    };
  }

  /**
   * 开始新的追踪会话
   */
  startTrace(traceId?: string): string {
    this.currentTraceId = traceId ?? this.generateId();
    this.spanCounter = 0;
    return this.currentTraceId;
  }

  /**
   * 结束追踪会话
   */
  endTrace(): void {
    this.currentTraceId = null;
    this.spanCounter = 0;
  }

  /**
   * 追踪异步方法调用
   */
  async traceAsync<T>(
    category: string,
    method: string,
    input: Record<string, unknown>,
    fn: () => Promise<T>
  ): Promise<T> {
    if (!this.options.enabled) {
      return fn();
    }

    const ctx = this.createContext(category, method);
    const startTime = Date.now();

    return withContext(ctx, async () => {
      try {
        this.logger.debug('→ 进入方法', {
          category,
          method,
          traceId: ctx.traceId,
          spanId: ctx.spanId,
          input: this.sanitize(input),
        });

        const result = await fn();
        const duration = Date.now() - startTime;

        this.logger.debug('← 方法返回', {
          category,
          method,
          traceId: ctx.traceId,
          spanId: ctx.spanId,
          duration: `${duration}ms`,
          output: this.sanitize(result),
        });

        return result;
      } catch (error) {
        this.logger.error('✗ 方法异常', {
          category,
          method,
          traceId: ctx.traceId,
          spanId: ctx.spanId,
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        });
        throw error;
      }
    });
  }

  /**
   * 记录工具调用（结构化日志）
   */
  logToolCall(
    tool: string,
    input: unknown,
    output: string,
    duration: number,
    success: boolean,
    error?: string
  ): void {
    const ctx = this.createContext('tool', tool);
    
    const logEntry: Partial<ToolCallLog> = {
      _type: 'tool_call',
      timestamp: new Date().toISOString(),
      level: success ? 'info' : 'error',
      category: 'tool',
      message: success ? `工具调用成功: ${tool}` : `工具调用失败: ${tool}`,
      trace: ctx,
      tool,
      input: this.sanitize(input) as Record<string, unknown>,
      outputPreview: output.length > 200 ? output.slice(0, 200) + '...' : output,
      duration,
      success,
      error,
    };

    this.logger.info('🔧 工具调用', logEntry as unknown as Record<string, unknown>);
  }

  /**
   * 记录 LLM 调用（结构化日志）
   */
  logLLMCall(
    model: string,
    provider: string,
    messageCount: number,
    toolCount: number,
    duration: number,
    success: boolean,
    tokens?: { prompt: number; completion: number },
    error?: string,
    content?: string,
    hasToolCalls?: boolean
  ): void {
    const ctx = this.createContext('llm', provider);
    
    const logEntry: Partial<LLMCallLog> = {
      _type: 'llm_call',
      timestamp: new Date().toISOString(),
      level: success ? 'info' : 'error',
      category: 'llm',
      message: success 
        ? `LLM 调用成功: ${provider}/${model}` 
        : `LLM 调用失败: ${provider}/${model}`,
      trace: ctx,
      model,
      provider,
      messageCount,
      toolCount,
      duration,
      success,
      tokens: tokens ? {
        prompt: tokens.prompt,
        completion: tokens.completion,
        total: tokens.prompt + tokens.completion,
      } : undefined,
      error,
      contentPreview: content ? (content.length > 100 ? content.slice(0, 100) + '...' : content) : undefined,
      hasToolCalls,
    };

    this.logger.info('🤖 LLM 调用', logEntry as unknown as Record<string, unknown>);
  }

  /**
   * 获取当前追踪 ID
   */
  getCurrentTraceId(): string | null {
    return this.currentTraceId;
  }

  /**
   * 设置追踪选项
   */
  setOptions(options: Partial<TracerOptions>): void {
    this.options = { ...this.options, ...options };
  }
}

/** 全局追踪器实例 */
let globalTracer: Tracer | null = null;

/**
 * 获取全局追踪器实例
 */
export function getTracer(): Tracer {
  if (!globalTracer) {
    globalTracer = new Tracer();
  }
  return globalTracer;
}

/**
 * 设置全局追踪器实例
 */
export function setTracer(tracer: Tracer): void {
  globalTracer = tracer;
}