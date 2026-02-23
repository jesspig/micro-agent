/**
 * ACP 模块入口
 */

// 类型
export * from './types';

// 客户端
export { ACPClient, type ACPClientConfig } from './acp-client';

// 适配器
export { ACPAdapter, createACPAdapter, type ACPAdapterConfig, type ToolRegistryLike } from './acp-adapter';
