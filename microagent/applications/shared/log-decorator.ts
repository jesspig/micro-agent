/**
 * 日志装饰器模块
 *
 * 提供装饰器和工具函数来自动化日志记录，减少样板代码
 */

import type { Logger } from "@logtape/logtape";
import { createTimer, type LogMethodOptions } from "./logger.js";

// ============================================================================
// 类型定义
// ============================================================================

/**
 * 方法元数据
 */
interface MethodMetadata {
  /** 方法名称 */
  name: string;
  /** 模块名称 */
  module: string;
  /** 是否需要日志记录 */
  logEnabled: boolean;
  /** 是否记录参数 */
  logParams: boolean;
  /** 是否记录返回值 */
  logResult: boolean;
  /** 是否记录错误 */
  logError: boolean;
}

/**
 * 装饰器选项
 */
export interface LogDecoratorOptions {
  /** 模块名称（默认使用类名） */
  module?: string;
  /** 是否启用日志（默认 true） */
  enabled?: boolean;
  /** 是否记录参数（默认 true） */
  logParams?: boolean;
  /** 是否记录返回值（默认 false，避免敏感信息泄漏） */
  logResult?: boolean;
  /** 是否记录错误（默认 true） */
  logError?: boolean;
  /** 参数脱敏函数 */
  sanitize?: (data: unknown) => unknown;
}

// ============================================================================
// 方法包装器
// ============================================================================

/**
 * 包装异步方法，自动添加日志记录
 */
function wrapAsyncMethod<T extends (...args: any[]) => Promise<any>>(
  target: any,
  propertyKey: string,
  descriptor: TypedPropertyDescriptor<T>,
  metadata: MethodMetadata
): TypedPropertyDescriptor<T> {
  const originalMethod = descriptor.value!;

  descriptor.value = (async function (this: any, ...args: any[]) {
    const timer = createTimer();
    const logger = this.logger as Logger | undefined;

    if (metadata.logEnabled && logger) {
      const { logMethodCall } = await import("./logger.js");
      logMethodCall(logger, {
        method: metadata.name,
        module: metadata.module,
        params: metadata.logParams ? args : undefined,
      });
    }

    try {
      const result = await originalMethod.apply(this, args);

      if (metadata.logEnabled && logger) {
        const { logMethodReturn } = await import("./logger.js");
        logMethodReturn(logger, {
          method: metadata.name,
          module: metadata.module,
          result: metadata.logResult ? result : undefined,
          duration: timer(),
        });
      }

      return result;
    } catch (error) {
      if (metadata.logEnabled && logger) {
        const { logMethodError } = await import("./logger.js");
        logMethodError(logger, {
          method: metadata.name,
          module: metadata.module,
          error: error instanceof Error ? {
            name: error.name,
            message: error.message,
            ...(error.stack ? { stack: error.stack } : {}),
          } : { name: "Error", message: String(error) },
          params: metadata.logParams ? args : undefined,
          duration: timer(),
        });
      }
      throw error;
    }
  }) as T;

  return descriptor;
}

/**
 * 包装同步方法，自动添加日志记录
 */
function wrapSyncMethod<T extends (...args: any[]) => any>(
  target: any,
  propertyKey: string,
  descriptor: TypedPropertyDescriptor<T>,
  metadata: MethodMetadata
): TypedPropertyDescriptor<T> {
  const originalMethod = descriptor.value!;

  descriptor.value = (function (this: any, ...args: any[]) {
    const timer = createTimer();
    const logger = this.logger as Logger | undefined;

    if (metadata.logEnabled && logger) {
      const { logMethodCall } = require("./logger.js");
      logMethodCall(logger, {
        method: metadata.name,
        module: metadata.module,
        params: metadata.logParams ? args : undefined,
      });
    }

    try {
      const result = originalMethod.apply(this, args);

      if (metadata.logEnabled && logger) {
        const { logMethodReturn } = require("./logger.js");
        logMethodReturn(logger, {
          method: metadata.name,
          module: metadata.module,
          result: metadata.logResult ? result : undefined,
          duration: timer(),
        });
      }

      return result;
    } catch (error) {
      if (metadata.logEnabled && logger) {
        const { logMethodError } = require("./logger.js");
        logMethodError(logger, {
          method: metadata.name,
          module: metadata.module,
          error: error instanceof Error ? {
            name: error.name,
            message: error.message,
            ...(error.stack ? { stack: error.stack } : {}),
          } : { name: "Error", message: String(error) },
          params: metadata.logParams ? args : undefined,
          duration: timer(),
        });
      }
      throw error;
    }
  }) as T;

  return descriptor;
}

// ============================================================================
// 装饰器工厂
// ============================================================================

/**
 * 创建方法日志装饰器
 *
 * @example
 * ```ts
 * class MyClass {
 *   private readonly logger = getLogger();
 *
 *   @logMethod()
 *   async myMethod(param: string): Promise<void> {
 *     // 方法实现
 *   }
 * }
 * ```
 */
export function logMethod(options: LogDecoratorOptions = {}): MethodDecorator {
  return (
    target: any,
    propertyKey: string | symbol,
    descriptor: TypedPropertyDescriptor<any>
  ) => {
    if (typeof propertyKey === "symbol") {
      return descriptor;
    }

    const className = target.constructor.name;
    const metadata: MethodMetadata = {
      name: propertyKey as string,
      module: options.module ?? className,
      logEnabled: options.enabled ?? true,
      logParams: options.logParams ?? true,
      logResult: options.logResult ?? false,
      logError: options.logError ?? true,
    };

    // 判断是否为异步方法
    const isAsync = descriptor.value?.constructor?.name === "AsyncFunction";

    if (isAsync) {
      return wrapAsyncMethod(target, propertyKey as string, descriptor, metadata);
    } else {
      return wrapSyncMethod(target, propertyKey as string, descriptor, metadata);
    }
  };
}

/**
 * 创建类日志装饰器
 *
 * 为类中的所有方法自动添加日志记录
 *
 * @example
 * ```ts
 * @logClass()
 * class MyClass {
 *   private readonly logger = getLogger();
 *
 *   async myMethod(param: string): Promise<void> {
 *     // 自动添加日志
 *   }
 * }
 * ```
 */
export function logClass(options: LogDecoratorOptions = {}): ClassDecorator {
  return (target: any) => {
    const prototype = target.prototype;
    const propertyNames = Object.getOwnPropertyNames(prototype);

    for (const propertyName of propertyNames) {
      if (propertyName === "constructor") {
        continue;
      }

      const descriptor = Object.getOwnPropertyDescriptor(prototype, propertyName);
      if (!descriptor || typeof descriptor.value !== "function") {
        continue;
      }

      // 应用方法装饰器
      const methodDecorator = logMethod(options);
      methodDecorator(prototype, propertyName, descriptor);

      // 重新定义属性
      Object.defineProperty(prototype, propertyName, descriptor);
    }
  };
}

// ============================================================================
// 高阶函数
// ============================================================================

/**
 * 创建带日志的异步函数
 *
 * @example
 * ```ts
 * const myFunction = withLog(async (param: string) => {
 *   // 函数实现
 * }, "myFunction", "MyModule");
 * ```
 */
export function withLog<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  name: string,
  module: string,
  logger?: Logger,
  options: { logParams?: boolean; logResult?: boolean } = {}
): T {
  const { logParams = true, logResult = false } = options;

  return (async function (this: any, ...args: any[]) {
    const timer = createTimer();
    const actualLogger = logger ?? this?.logger;

    if (actualLogger) {
      const { logMethodCall } = await import("./logger.js");
      logMethodCall(actualLogger, {
        method: name,
        module,
        params: logParams ? args : undefined,
      });
    }

    try {
      const result = await fn.apply(this, args);

      if (actualLogger) {
        const { logMethodReturn } = await import("./logger.js");
        logMethodReturn(actualLogger, {
          method: name,
          module,
          result: logResult ? result : undefined,
          duration: timer(),
        });
      }

      return result;
    } catch (error) {
      if (actualLogger) {
        const { logMethodError } = await import("./logger.js");
        logMethodError(actualLogger, {
          method: name,
          module,
          error: error instanceof Error ? {
            name: error.name,
            message: error.message,
            ...(error.stack ? { stack: error.stack } : {}),
          } : { name: "Error", message: String(error) },
          params: logParams ? args : undefined,
          duration: timer(),
        });
      }
      throw error;
    }
  }) as T;
}

/**
 * 创建带日志的同步函数
 */
export function withLogSync<T extends (...args: any[]) => any>(
  fn: T,
  name: string,
  module: string,
  logger?: Logger,
  options: { logParams?: boolean; logResult?: boolean } = {}
): T {
  const { logParams = true, logResult = false } = options;

  return (function (this: any, ...args: any[]) {
    const timer = createTimer();
    const actualLogger = logger ?? this?.logger;

    if (actualLogger) {
      const { logMethodCall } = require("./logger.js");
      logMethodCall(actualLogger, {
        method: name,
        module,
        params: logParams ? args : undefined,
      });
    }

    try {
      const result = fn.apply(this, args);

      if (actualLogger) {
        const { logMethodReturn } = require("./logger.js");
        logMethodReturn(actualLogger, {
          method: name,
          module,
          result: logResult ? result : undefined,
          duration: timer(),
        });
      }

      return result;
    } catch (error) {
      if (actualLogger) {
        const { logMethodError } = require("./logger.js");
        logMethodError(actualLogger, {
          method: name,
          module,
          error: error instanceof Error ? {
            name: error.name,
            message: error.message,
            ...(error.stack ? { stack: error.stack } : {}),
          } : { name: "Error", message: String(error) },
          params: logParams ? args : undefined,
          duration: timer(),
        });
      }
      throw error;
    }
  }) as T;
}
