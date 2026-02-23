/**
 * 扩展加载器
 * 
 * 负责扩展的加载、激活和卸载
 */

import { resolve, join } from 'path';
import { getLogger } from '@logtape/logtape';
import type { ExtensionDescriptor, ExtensionDiscoveryResult } from '@microbot/types';
import { ExtensionDiscovery } from './discovery';
import { ExtensionRegistry, type RegistryConfig } from './registry';

const log = getLogger(['extension', 'loader']);

/** 加载器配置 */
export interface LoaderConfig {
  /** 工作目录 */
  workspace: string;
  /** 扩展搜索路径列表 */
  searchPaths: string[];
  /** 获取配置函数 */
  getConfig: <T>(key: string) => T | undefined;
  /** 注册工具函数 */
  registerTool: (tool: unknown) => void;
  /** 注册通道函数 */
  registerChannel: (channel: unknown) => void;
}

/** 加载器状态 */
export interface LoaderState {
  /** 已发现但未加载 */
  discovered: ExtensionDescriptor[];
  /** 已加载 */
  loaded: string[];
  /** 加载失败 */
  failed: Array<{ id: string; error: Error }>;
}

/**
 * 扩展加载器
 * 
 * 统一管理扩展的发现、加载和生命周期
 */
export class ExtensionLoader {
  private discovery: ExtensionDiscovery;
  private registry: ExtensionRegistry;
  private config: LoaderConfig;
  private state: LoaderState = {
    discovered: [],
    loaded: [],
    failed: [],
  };

  constructor(config: LoaderConfig) {
    this.config = config;
    this.discovery = new ExtensionDiscovery();
    this.registry = new ExtensionRegistry({
      workspace: config.workspace,
      getConfig: config.getConfig,
      registerTool: config.registerTool,
      registerChannel: config.registerChannel,
    });

    // 添加搜索路径
    for (const path of config.searchPaths) {
      this.discovery.addSearchPath(path);
    }
  }

  /**
   * 初始化加载器
   * 发现并加载所有扩展
   */
  async initialize(): Promise<LoaderState> {
    log.info('初始化扩展加载器');

    // 发现扩展
    const result = this.discovery.discover();
    this.state.discovered = result.descriptors;

    // 报告发现错误
    for (const { path, error } of result.errors) {
      log.warn('发现扩展失败: {path} - {error}', { path, error: error.message });
    }

    // 加载所有发现的扩展
    for (const descriptor of result.descriptors) {
      await this.loadExtension(descriptor);
    }

    log.info('扩展加载完成: {loaded} 成功, {failed} 失败', {
      loaded: this.state.loaded.length,
      failed: this.state.failed.length,
    });

    return this.state;
  }

  /**
   * 加载单个扩展
   */
  async loadExtension(descriptor: ExtensionDescriptor): Promise<boolean> {
    try {
      // 查找扩展路径
      const extensionPath = this.findExtensionPath(descriptor);
      if (!extensionPath) {
        throw new Error(`未找到扩展: ${descriptor.id}`);
      }

      // 注册扩展
      await this.registry.register(descriptor, extensionPath);

      // 激活扩展
      await this.registry.activate(descriptor.id);

      this.state.loaded.push(descriptor.id);
      log.info('扩展加载成功: {id}', { id: descriptor.id });
      
      return true;
    } catch (e) {
      const error = e as Error;
      this.state.failed.push({ id: descriptor.id, error });
      log.error('扩展加载失败: {id} - {error}', { id: descriptor.id, error: error.message });
      return false;
    }
  }

  /**
   * 卸载扩展
   */
  async unloadExtension(extensionId: string): Promise<void> {
    await this.registry.unload(extensionId);
    
    // 更新状态
    this.state.loaded = this.state.loaded.filter(id => id !== extensionId);
    this.state.failed = this.state.failed.filter(f => f.id !== extensionId);
  }

  /**
   * 重新加载扩展
   */
  async reloadExtension(extensionId: string): Promise<boolean> {
    const loaded = this.registry.get(extensionId);
    if (!loaded) {
      log.warn('扩展未加载: {id}', { id: extensionId });
      return false;
    }

    // 卸载
    await this.unloadExtension(extensionId);

    // 重新发现
    const result = this.discovery.discover();
    const descriptor = result.descriptors.find(d => d.id === extensionId);
    
    if (!descriptor) {
      log.error('无法重新发现扩展: {id}', { id: extensionId });
      return false;
    }

    // 重新加载
    return this.loadExtension(descriptor);
  }

  /**
   * 获取注册表
   */
  getRegistry(): ExtensionRegistry {
    return this.registry;
  }

  /**
   * 获取状态
   */
  getState(): LoaderState {
    return { ...this.state };
  }

  /**
   * 查找扩展路径
   */
  private findExtensionPath(descriptor: ExtensionDescriptor): string | null {
    for (const searchPath of this.config.searchPaths) {
      // 尝试按 ID 查找
      const possiblePath = join(searchPath, descriptor.id);
      const entryFile = descriptor.main ?? 'index.js';
      const entryPath = resolve(possiblePath, entryFile);
      
      // 简单检查入口文件是否存在
      try {
        require.resolve(entryPath);
        return entryPath;
      } catch {
        continue;
      }
    }
    return null;
  }
}
