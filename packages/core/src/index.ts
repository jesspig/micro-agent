/**
 * Core SDK 入口
 * 
 * 导出所有核心模块，支持独立导入：
 * ```typescript
 * import { Container, EventBus, HookSystem } from '@microbot/sdk/core';
 * ```
 */

// 类型定义
export * from './types';

// 核心容器
export { ContainerImpl, container } from './container';
export type { Container } from './types/interfaces';

// 事件总线
export { EventBus, eventBus } from './event-bus';
export type { EventType, EventHandler } from './types/events';

// 钩子系统
export { HookSystem, hookSystem } from './hook-system';
export type { HookType, Hook } from './hook-system';

// 中间件管道
export { Pipeline } from './pipeline';
export type { Middleware } from './pipeline';

// Agent 模块
export { ContextBuilder, AgentLoop, SubagentManager } from './agent';
export type { AgentConfig as AgentLoopConfig } from './agent';

// Provider 模块
export * from './providers';

// Bus 模块
export * from './bus';

// Config 模块
export * from './config';

// Tool 模块
export * from './tool';

// Channel 模块
export * from './channel';

// Skill 模块
export * from './skill';

// Storage 模块
export * from './storage';

// Service 模块
export * from './service';
