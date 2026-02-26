/**
 * 扩展注册表
 * 
 * 管理已加载扩展的生命周期
 */

import { getLogger } from '@logtape/logtape';
import type {
  Extension,
  ExtensionDescriptor,
  ExtensionContext,
  LoadedExtension,
  ExtensionType,
} from '@micro-agent/types';

const log = getLogger(['extension', 'registry']);

/** 注册表配置 */
export interface RegistryConfig {
  /** 工作目录 */
  workspace: string;
  /** 获取配置函数 */
  getConfig: <T>(key: string) => T | undefined;
  /** 注册工具函数 */
  registerTool: (tool: unknown) => void;
  /** 注册通道函数 */
  registerChannel: (channel: unknown) => void;
}

/**
 * 扩展注册表
 * 
 * 负责管理扩展的注册、激活、停用和卸载
 */
export class ExtensionRegistry {
  private extensions = new Map<string, LoadedExtension>();
  private config: RegistryConfig;

  constructor(config: RegistryConfig) {
    this.config = config;
  }

  /**
   * 注册扩展
   * @param descriptor - 扩展描述符
   * @param extensionPath - 扩展路径
   * @returns 扩展实例
   */
  async register(descriptor: ExtensionDescriptor, extensionPath: string): Promise<LoadedExtension> {
    if (this.extensions.has(descriptor.id)) {
      throw new Error(`扩展已注册: ${descriptor.id}`);
    }

    // 动态加载扩展模块
    const { default: ExtensionClass } = await import(extensionPath);
    const extension: Extension = new ExtensionClass();

    // 验证描述符
    if (extension.descriptor.id !== descriptor.id) {
      throw new Error(`描述符 ID 不匹配: 期望 ${descriptor.id}, 实际 ${extension.descriptor.id}`);
    }

    const loaded: LoadedExtension = {
      extension,
      loadedAt: new Date(),
      path: extensionPath,
      isActive: false,
    };

    this.extensions.set(descriptor.id, loaded);
    log.info('扩展已注册: {id}', { id: descriptor.id });

    return loaded;
  }

  /**
   * 激活扩展
   * @param extensionId - 扩展 ID
   */
  async activate(extensionId: string): Promise<void> {
    const loaded = this.extensions.get(extensionId);
    if (!loaded) {
      throw new Error(`扩展未注册: ${extensionId}`);
    }

    if (loaded.isActive) {
      log.debug('扩展已激活: {id}', { id: extensionId });
      return;
    }

    const context = this.createContext(loaded.path);
    await loaded.extension.activate(context);
    
    // 更新激活状态
    const activated: LoadedExtension = { ...loaded, isActive: true };
    this.extensions.set(extensionId, activated);
    
    log.info('扩展已激活: {id}', { id: extensionId });
  }

  /**
   * 停用扩展
   * @param extensionId - 扩展 ID
   */
  async deactivate(extensionId: string): Promise<void> {
    const loaded = this.extensions.get(extensionId);
    if (!loaded) {
      throw new Error(`扩展未注册: ${extensionId}`);
    }

    if (!loaded.isActive) {
      log.debug('扩展未激活: {id}', { id: extensionId });
      return;
    }

    await loaded.extension.deactivate();
    
    // 更新激活状态
    const deactivated: LoadedExtension = { ...loaded, isActive: false };
    this.extensions.set(extensionId, deactivated);
    
    log.info('扩展已停用: {id}', { id: extensionId });
  }

  /**
   * 卸载扩展
   * @param extensionId - 扩展 ID
   */
  async unload(extensionId: string): Promise<void> {
    const loaded = this.extensions.get(extensionId);
    if (!loaded) {
      return;
    }

    // 先停用
    if (loaded.isActive) {
      await this.deactivate(extensionId);
    }

    this.extensions.delete(extensionId);
    log.info('扩展已卸载: {id}', { id: extensionId });
  }

  /**
   * 获取扩展
   */
  get(extensionId: string): LoadedExtension | undefined {
    return this.extensions.get(extensionId);
  }

  /**
   * 获取所有扩展
   */
  getAll(): LoadedExtension[] {
    return Array.from(this.extensions.values());
  }

  /**
   * 按类型获取扩展
   */
  getByType(type: ExtensionType): LoadedExtension[] {
    return this.getAll().filter(e => e.extension.descriptor.type === type);
  }

  /**
   * 获取激活的扩展
   */
  getActive(): LoadedExtension[] {
    return this.getAll().filter(e => e.isActive);
  }

  /**
   * 检查扩展是否存在
   */
  has(extensionId: string): boolean {
    return this.extensions.has(extensionId);
  }

  /**
   * 获取扩展数量
   */
  get size(): number {
    return this.extensions.size;
  }

  /**
   * 创建扩展上下文
   */
  private createContext(extensionPath: string): ExtensionContext {
    return {
      extensionPath,
      workspace: this.config.workspace,
      registerTool: this.config.registerTool,
      registerChannel: this.config.registerChannel,
      getConfig: this.config.getConfig,
      logger: {
        info: (message, data) => log.info(message, data ?? {}),
        warn: (message, data) => log.warn(message, data ?? {}),
        error: (message, data) => log.error(message, data ?? {}),
        debug: (message, data) => log.debug(message, data ?? {}),
      },
    };
  }
}
