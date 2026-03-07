/**
 * 调用链追踪器
 * 
 * 提供方法调用的追踪、入参/输出记录和耗时统计。
 */

// ============================================================
// 常量定义
// ============================================================

/** 脱敏处理最大递归深度 */
const SANITIZE_MAX_DEPTH = 5;
/** 数组截断长度 */
const ARRAY_TRUNCATE_LENGTH = 100;
/** ID 随机部分长度 */
const ID_RANDOM_LENGTH = 7;
/** Span ID 填充位数 */
const SPAN_ID_PADDING = 4;

import { getLogger, withContext, type Logger } from '@logtape/logtape';
import type {
  TraceContext,
  TracerOptions,
  MethodCallLog,
  ToolCallLog,
  LLMCallLog,
} from './types';

/** 默认追踪器选项 */
const DEFAULT_OPTIONS: TracerOptions = {
  enabled: true,
  sensitiveFields: ['password', 'token', 'secret', 'apiKey', 'api_key', 'authorization'],
  maxDepth: 10,
};

/**
 * 调用链追踪器
 * 
 * 用于记录方法调用的详细信息，包括调用链、入参、输出和耗时。
 */
export class Tracer {
  private logger: Logger;
  private options: TracerOptions;
  private currentTraceId: string | null = null;
  private spanCounter = 0;
  private depthStack: number[] = [];

  constructor(options: Partial<TracerOptions> = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.logger = getLogger(['tracer']);
  }

  /**
   * 生成唯一 ID
   */
  private generateId(): string {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 2 + ID_RANDOM_LENGTH)}`;
  }

  /**
   * 生成 Span ID
   */
  private generateSpanId(): string {
    this.spanCounter++;
    return `span-${this.spanCounter.toString(36).padStart(SPAN_ID_PADDING, '0')}`;
  }

  /**
   * 脱敏处理
   */
  private sanitize(data: unknown, depth = 0): unknown {
    if (depth > SANITIZE_MAX_DEPTH) return '[深度超限]';
    if (data === null || data === undefined) return data;
    if (typeof data !== 'object') return data;
    if (data instanceof Error) {
      return {
        name: data.name,
        message: data.message,
        stack: data.stack,
      };
    }
    if (Buffer.isBuffer(data)) return '[Buffer]';
    if (Array.isArray(data)) {
      return data.slice(0, ARRAY_TRUNCATE_LENGTH).map(item => this.sanitize(item, depth + 1));
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
  createContext(file: string, method: string, className?: string): TraceContext {
    const depth = this.depthStack.length > 0 ? (this.depthStack[this.depthStack.length - 1] ?? 0) + 1 : 0;
    
    return {
      traceId: this.currentTraceId ?? this.generateId(),
      parentSpanId: this.depthStack.length > 0 ? this.generateSpanId() : undefined,
      spanId: this.generateSpanId(),
      file,
      method,
      className,
      depth,
      startTime: Date.now(),
    };
  }

  /**
   * 开始新的追踪会话
   */
  startTrace(traceId?: string): string {
    this.currentTraceId = traceId ?? this.generateId();
    this.spanCounter = 0;
    this.depthStack = [];
    return this.currentTraceId;
  }

  /**
   * 结束追踪会话
   */
  endTrace(): void {
    this.currentTraceId = null;
    this.spanCounter = 0;
    this.depthStack = [];
  }

  /**
   * 追踪异步方法调用
   */
  async traceAsync<T>(
    file: string,
    method: string,
    input: Record<string, unknown>,
    fn: () => Promise<T>,
    className?: string
  ): Promise<T> {
    if (!this.options.enabled) {
      return fn();
    }

    const ctx = this.createContext(file, method, className);
    this.depthStack.push(ctx.depth ?? 0);

    const logEntry: Partial<MethodCallLog> = {
      _type: 'method_call',
      trace: ctx,
      timestamp: new Date().toISOString(),
      input: this.sanitize(input) as Record<string, unknown>,
      success: true,
    };

    return withContext({ traceId: ctx.traceId, spanId: ctx.spanId }, async () => {
      try {
        this.logger.debug('→ 进入方法', { 
          file, 
          method, 
          className,
          traceId: ctx.traceId,
          spanId: ctx.spanId,
          depth: ctx.depth,
          input: logEntry.input,
        });

        const startTime = Date.now();
        const result = await fn();
        const duration = Date.now() - startTime;

        logEntry.output = this.sanitize(result);
        logEntry.duration = duration;

        this.logger.info('← 方法返回', {
          file,
          method,
          className,
          traceId: ctx.traceId,
          spanId: ctx.spanId,
          duration: `${duration}ms`,
          output: logEntry.output,
        });

        return result;
      } catch (error) {
        logEntry.success = false;
        logEntry.error = error instanceof Error ? error.message : String(error);
        logEntry.stack = error instanceof Error ? error.stack : undefined;

        this.logger.error('✗ 方法异常', {
          file,
          method,
          className,
          traceId: ctx.traceId,
          spanId: ctx.spanId,
          error: logEntry.error,
          stack: logEntry.stack,
        });

        throw error;
      } finally {
        this.depthStack.pop();
      }
    });
  }

  /**
   * 追踪同步方法调用
   */
  traceSync<T>(
    file: string,
    method: string,
    input: Record<string, unknown>,
    fn: () => T,
    className?: string
  ): T {
    if (!this.options.enabled) {
      return fn();
    }

    const ctx = this.createContext(file, method, className);
    this.depthStack.push(ctx.depth ?? 0);

    const logEntry: Partial<MethodCallLog> = {
      _type: 'method_call',
      trace: ctx,
      timestamp: new Date().toISOString(),
      input: this.sanitize(input) as Record<string, unknown>,
      success: true,
    };

    try {
      this.logger.debug('→ 进入方法', {
        file,
        method,
        className,
        traceId: ctx.traceId,
        spanId: ctx.spanId,
        input: logEntry.input,
      });

      const startTime = Date.now();
      const result = fn();
      const duration = Date.now() - startTime;

      logEntry.output = this.sanitize(result);
      logEntry.duration = duration;

      this.logger.info('← 方法返回', {
        file,
        method,
        className,
        traceId: ctx.traceId,
        spanId: ctx.spanId,
        duration: `${duration}ms`,
        output: logEntry.output,
      });

      return result;
    } catch (error) {
      logEntry.success = false;
      logEntry.error = error instanceof Error ? error.message : String(error);
      logEntry.stack = error instanceof Error ? error.stack : undefined;

      this.logger.error('✗ 方法异常', {
        file,
        method,
        className,
        traceId: ctx.traceId,
        spanId: ctx.spanId,
        error: logEntry.error,
        stack: logEntry.stack,
      });

      throw error;
    } finally {
      this.depthStack.pop();
    }
  }

  /**
   * 记录工具调用
   */
  logToolCall(
    tool: string,
    input: unknown,
    output: string,
    duration: number,
    success: boolean,
    error?: string
  ): void {
    const ctx = this.createContext('tool', 'execute', tool);
    
    const logEntry: ToolCallLog = {
      _type: 'tool_call',
      trace: ctx,
      timestamp: new Date().toISOString(),
      tool,
      input: this.sanitize(input),
      output: output.length > 1000 ? output.slice(0, 1000) + '...' : output,
      duration,
      success,
      error,
    };

    this.logger.info('🔧 工具调用', logEntry as unknown as Record<string, unknown>);
  }

  /**
   * 记录 LLM 调用
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
    content?: string | undefined,
    hasToolCalls?: boolean
  ): void {
    const ctx = this.createContext('llm', 'chat', provider);
    
    const logEntry: LLMCallLog = {
      _type: 'llm_call',
      trace: ctx,
      timestamp: new Date().toISOString(),
      model,
      provider,
      messageCount,
      toolCount,
      duration,
      success,
      promptTokens: tokens?.prompt,
      completionTokens: tokens?.completion,
      error,
      content,
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

/**
 * 创建方法追踪装饰器
 */
export function traceMethod(file: string, className?: string) {
  return function (
    _target: unknown,
    propertyKey: string,
    descriptor: TypedPropertyDescriptor<(...args: unknown[]) => Promise<unknown>>
  ) {
    const originalMethod = descriptor.value;
    if (!originalMethod) return descriptor;

    descriptor.value = async function (this: unknown, ...args: unknown[]) {
      const tracer = getTracer();
      const input: Record<string, unknown> = {};
      const paramNames = ['arg0', 'arg1', 'arg2', 'arg3', 'arg4'];
      
      args.forEach((arg, i) => {
        const key = paramNames[i] ?? `arg${i}`;
        input[key] = arg;
      });

      return tracer.traceAsync(
        file,
        propertyKey,
        input,
        () => originalMethod.apply(this, args),
        className
      );
    };

    return descriptor;
  };
}

/**
 * 创建函数追踪包装器
 */
export function traced<TArgs extends unknown[], TResult>(
  file: string,
  method: string,
  fn: (...args: TArgs) => Promise<TResult>,
  className?: string
): (...args: TArgs) => Promise<TResult> {
  return async function (this: unknown, ...args: TArgs) {
    const tracer = getTracer();
    const input: Record<string, unknown> = {};
    const paramNames = ['arg0', 'arg1', 'arg2', 'arg3', 'arg4'];
    
    args.forEach((arg, i) => {
      const key = paramNames[i] ?? `arg${i}`;
      input[key] = arg;
    });

    return tracer.traceAsync(file, method, input, () => fn.apply(this, args), className);
  };
}
