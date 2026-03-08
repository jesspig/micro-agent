/**
 * 工具注册表
 *
 * 管理已注册工具的生命周期，提供参数验证和执行能力
 */

import { getLogger } from '@logtape/logtape';
import type { Tool, ToolDefinition, ToolContext, ToolResult, StructuredToolError } from '../../../types';
import { validateAgainstSchema, type ValidationResult } from './schema-validator';

// 重新导出类型供外部使用
export type { ToolContext } from '../../../types';

const log = getLogger(['tool', 'registry']);

/** 工具注册表配置 */
export interface ToolRegistryConfig {
  /** 工作目录 */
  workspace?: string;
}

/** 已注册工具 */
interface RegisteredTool {
  tool: Tool;
  registeredAt: Date;
  source?: string;
}

/**
 * 工具注册表
 *
 * 负责工具的注册、查找和执行
 */
export class ToolRegistry {
  private tools = new Map<string, RegisteredTool>();
  private config: ToolRegistryConfig;

  constructor(config: ToolRegistryConfig = {}) {
    this.config = config;
  }

  /**
   * 注册工具
   */
  register(tool: Tool, source?: string): void {
    if (this.tools.has(tool.name)) {
      log.warn('工具已注册，将覆盖: {name}', { name: tool.name });
    }

    this.tools.set(tool.name, {
      tool,
      registeredAt: new Date(),
      source,
    });

    log.info('工具已注册: {name}', { name: tool.name });
  }

  /**
   * 批量注册工具
   */
  registerBatch(tools: Tool[], source?: string): void {
    for (const tool of tools) {
      this.register(tool, source);
    }
  }

  /**
   * 注销工具
   */
  unregister(name: string): void {
    if (this.tools.delete(name)) {
      log.info('工具已注销: {name}', { name });
    }
  }

  /**
   * 获取工具
   */
  get(name: string): Tool | undefined {
    return this.tools.get(name)?.tool;
  }

  /**
   * 检查工具是否存在
   */
  has(name: string): boolean {
    return this.tools.has(name);
  }

  /**
   * 获取所有工具定义
   */
  getDefinitions(): ToolDefinition[] {
    return Array.from(this.tools.values()).map(r => ({
      name: r.tool.name,
      description: r.tool.description,
      inputSchema: r.tool.inputSchema,
    }));
  }

  /**
   * 获取所有工具
   */
  getAll(): Tool[] {
    return Array.from(this.tools.values()).map(r => r.tool);
  }

  /**
   * 执行工具
   *
   * @param name - 工具名称
   * @param input - 输入参数
   * @param ctx - 执行上下文
   * @returns 执行结果
   */
  async execute(name: string, input: unknown, ctx: ToolContext): Promise<ToolResult> {
    const registered = this.tools.get(name);
    if (!registered) {
      return this.createErrorResult(
        'NOT_FOUND',
        `工具不存在: ${name}`,
        `请检查工具名称是否正确，可用工具: ${this.getToolNames().join(', ')}`
      );
    }

    // 参数验证
    const validation = validateAgainstSchema(input, registered.tool.inputSchema);
    if (!validation.valid) {
      const errorMessages = validation.errors
        .map(e => e.path ? `${e.path}: ${e.message}` : e.message)
        .join('; ');
      log.warn('工具参数验证失败: {name} - {errors}', { name, errors: errorMessages });
      return this.createErrorResult(
        'VALIDATION_ERROR',
        `参数验证失败: ${errorMessages}`,
        '请检查参数格式和必填字段',
        { errors: validation.errors }
      );
    }

    try {
      log.debug('执行工具: {name}', { name, input: validation.data });
      const startTime = Date.now();
      const result = await registered.tool.execute(validation.data, ctx);
      const duration = Date.now() - startTime;

      log.debug('工具执行完成: {name} (耗时 {duration}ms)', { name, duration });

      return {
        ...result,
        metadata: { ...result.metadata, duration },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      log.error('工具执行失败: {name} - {error}', { name, error: errorMessage });
      return this.createErrorResult(
        'EXECUTION_ERROR',
        `工具执行失败: ${errorMessage}`,
        undefined,
        { error: errorMessage },
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * 创建错误结果
   */
  private createErrorResult(
    type: StructuredToolError['type'],
    message: string,
    suggestion?: string,
    details?: Record<string, unknown>,
    cause?: Error
  ): ToolResult {
    return {
      content: [{ type: 'text', text: message }],
      isError: true,
      error: { type, message, suggestion, details, cause },
    };
  }

  /**
   * 获取所有工具名称
   */
  private getToolNames(): string[] {
    return Array.from(this.tools.keys());
  }

  /**
   * 获取工具数量
   */
  get size(): number {
    return this.tools.size;
  }

  /**
   * 清空注册表
   */
  clear(): void {
    this.tools.clear();
    log.info('工具注册表已清空');
  }
}

/**
 * 创建工具注册表
 */
export function createToolRegistry(config?: ToolRegistryConfig): ToolRegistry {
  return new ToolRegistry(config);
}
