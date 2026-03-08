/**
 * 工具系统入口
 */

export { ToolRegistry, createToolRegistry } from './registry';
export type { ToolRegistryConfig } from './registry';

// 参数验证器
export {
  validateAgainstSchema,
  validateRequired,
  validateType,
  isValid,
} from './schema-validator';
export type { ValidationError, ValidationResult } from './schema-validator';

// 内置工具注册接口（依赖注入）
export {
  registerBuiltinToolProvider,
  getBuiltinToolProvider,
  hasBuiltinToolProvider,
  clearBuiltinToolProvider,
} from './builtin-registry';
export type { BuiltinToolProvider } from './builtin-registry';
