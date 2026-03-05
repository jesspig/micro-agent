/**
 * 应用配置管理
 *
 * 管理应用级别的配置项。
 */

import { join } from 'path';
import { homedir } from 'os';

const log = {
  debug: (...args: unknown[]) => console.debug('[config:settings]', ...args),
  info: (...args: unknown[]) => console.info('[config:settings]', ...args),
};

/** 应用配置 */
export interface AppConfig {
  /** 应用名称 */
  appName: string;
  /** 版本 */
  version: string;
  /** 数据目录 */
  dataDir: string;
  /** 配置目录 */
  configDir: string;
  /** 日志目录 */
  logDir: string;
  /** 是否启用调试模式 */
  debug: boolean;
}

/** 默认配置 */
const DEFAULT_CONFIG: Partial<AppConfig> = {
  appName: 'micro-agent',
  version: '0.1.0',
  debug: false,
};

/**
 * 配置管理器
 */
export class ConfigManager {
  private config: AppConfig;

  constructor(customConfig?: Partial<AppConfig>) {
    const homeDir = homedir();
    const appName = customConfig?.appName || DEFAULT_CONFIG.appName || 'micro-agent';

    this.config = {
      appName: customConfig?.appName || DEFAULT_CONFIG.appName || 'micro-agent',
      version: customConfig?.version || DEFAULT_CONFIG.version || '0.1.0',
      dataDir: customConfig?.dataDir || join(homeDir, `.${appName}`, 'data'),
      configDir: customConfig?.configDir || join(homeDir, `.${appName}`, 'config'),
      logDir: customConfig?.logDir || join(homeDir, `.${appName}`, 'logs'),
      debug: customConfig?.debug || DEFAULT_CONFIG.debug || false,
    };

    log.debug('[ConfigManager] 配置已加载', {
      appName: this.config.appName,
      version: this.config.version,
      dataDir: this.config.dataDir,
    });
  }

  /**
   * 获取配置
   */
  getConfig(): AppConfig {
    return { ...this.config };
  }

  /**
   * 更新配置
   */
  updateConfig(updates: Partial<AppConfig>): void {
    this.config = { ...this.config, ...updates };
    log.info('[ConfigManager] 配置已更新', { updates });
  }

  /**
   * 获取数据目录
   */
  getDataDir(...paths: string[]): string {
    return join(this.config.dataDir, ...paths);
  }

  /**
   * 获取配置目录
   */
  getConfigDir(...paths: string[]): string {
    return join(this.config.configDir, ...paths);
  }

  /**
   * 获取日志目录
   */
  getLogDir(...paths: string[]): string {
    return join(this.config.logDir, ...paths);
  }

  /**
   * 是否为调试模式
   */
  isDebug(): boolean {
    return this.config.debug;
  }

  /**
   * 设置调试模式
   */
  setDebug(debug: boolean): void {
    this.config.debug = debug;
    log.info('[ConfigManager] 调试模式已', { debug: debug ? '启用' : '禁用' });
  }
}

// 导出全局实例
let globalConfig: ConfigManager | null = null;

/**
 * 获取全局配置实例
 */
export function getConfig(): ConfigManager {
  if (!globalConfig) {
    globalConfig = new ConfigManager();
  }
  return globalConfig;
}

/**
 * 设置全局配置实例
 */
export function setConfig(config: ConfigManager): void {
  globalConfig = config;
}