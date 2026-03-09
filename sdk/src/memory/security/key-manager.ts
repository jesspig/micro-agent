/**
 * 密钥管理器
 *
 * 安全管理加密密钥，支持系统级密钥派生。
 * 密钥从不从配置文件读取，使用环境变量或系统密钥链。
 */

import { z } from 'zod';
import { getLogger } from '@logtape/logtape';
import { randomBytes, pbkdf2Sync, createHash } from 'crypto';

const log = getLogger(['memory', 'security', 'key-manager']);

/** 密钥来源 */
export type KeySource = 'env' | 'derived' | 'generated';

/** 密钥信息 */
export interface KeyInfo {
  /** 密钥标识 */
  keyId: string;
  /** 创建时间 */
  createdAt: Date;
  /** 密钥来源 */
  source: KeySource;
  /** 是否为当前活跃密钥 */
  active: boolean;
  /** 轮换次数 */
  rotationCount: number;
}

/** 密钥管理配置 */
export const KeyManagerConfigSchema = z.object({
  /** 环境变量名 */
  envKeyName: z.string().default('MICRO_AGENT_ENCRYPTION_KEY'),
  /** 密钥派生盐 */
  derivationSalt: z.string().optional(),
  /** 密钥派生迭代次数 */
  derivationIterations: z.number().min(10000).default(100000),
  /** 密钥长度（字节） */
  keyLength: z.number().default(32),
  /** 是否允许自动生成密钥 */
  allowAutoGenerate: z.boolean().default(false),
  /** 密钥轮换周期（天），0 表示不自动轮换 */
  rotationDays: z.number().min(0).default(0),
});

export type KeyManagerConfig = z.infer<typeof KeyManagerConfigSchema>;

/** 默认配置 */
const DEFAULT_CONFIG: KeyManagerConfig = {
  envKeyName: 'MICRO_AGENT_ENCRYPTION_KEY',
  derivationIterations: 100000,
  keyLength: 32,
  allowAutoGenerate: false,
  rotationDays: 0,
};

/**
 * 密钥管理器
 *
 * 职责：
 * - 从安全来源获取加密密钥
 * - 支持密钥派生（基于系统标识）
 * - 支持密钥轮换
 * - 管理密钥生命周期
 */
export class KeyManager {
  private config: KeyManagerConfig;
  private currentKey: Uint8Array | null = null;
  private currentKeyId: string = '';
  private keyHistory: Map<string, { key: Uint8Array; info: KeyInfo }> = new Map();
  private initialized = false;

  constructor(config: Partial<KeyManagerConfig> = {}) {
    this.config = KeyManagerConfigSchema.parse({ ...DEFAULT_CONFIG, ...config });
  }

  /**
   * 初始化密钥管理器
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    // 尝试从环境变量获取密钥
    const envKey = this.getFromEnv();
    if (envKey) {
      await this.setKey(envKey, 'env');
      log.info('密钥已从环境变量加载', { keyId: this.currentKeyId });
      this.initialized = true;
      return;
    }

    // 尝试从系统派生密钥
    const derivedKey = this.deriveFromSystem();
    if (derivedKey) {
      await this.setKey(derivedKey, 'derived');
      log.info('密钥已从系统派生', { keyId: this.currentKeyId });
      this.initialized = true;
      return;
    }

    // 检查是否允许自动生成
    if (this.config.allowAutoGenerate) {
      const generatedKey = this.generateKey();
      await this.setKey(generatedKey, 'generated');
      log.warn('使用自动生成的密钥（仅用于开发环境）', { keyId: this.currentKeyId });
      this.initialized = true;
      return;
    }

    throw new Error(
      '无法获取加密密钥。请设置环境变量 MICRO_AGENT_ENCRYPTION_KEY 或启用 allowAutoGenerate（仅限开发环境）'
    );
  }

  /**
   * 获取当前活跃密钥
   */
  async getCurrentKey(): Promise<{ key: Uint8Array; keyId: string }> {
    await this.ensureInitialized();

    if (!this.currentKey || !this.currentKeyId) {
      throw new Error('密钥未初始化');
    }

    return {
      key: this.currentKey,
      keyId: this.currentKeyId,
    };
  }

  /**
   * 根据密钥 ID 获取密钥（用于解密历史数据）
   */
  async getKeyById(keyId: string): Promise<Uint8Array | undefined> {
    await this.ensureInitialized();

    // 当前密钥
    if (keyId === this.currentKeyId) {
      return this.currentKey ?? undefined;
    }

    // 历史密钥
    const historical = this.keyHistory.get(keyId);
    return historical?.key;
  }

  /**
   * 获取所有密钥信息
   */
  async getKeyInfos(): Promise<KeyInfo[]> {
    await this.ensureInitialized();

    const infos: KeyInfo[] = [];

    // 当前密钥
    if (this.currentKeyId) {
      const current = this.keyHistory.get(this.currentKeyId);
      if (current) {
        infos.push({ ...current.info, active: true });
      }
    }

    // 历史密钥
    for (const [keyId, { info }] of this.keyHistory) {
      if (keyId !== this.currentKeyId) {
        infos.push({ ...info, active: false });
      }
    }

    return infos.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  /**
   * 轮换密钥
   */
  async rotateKey(): Promise<string> {
    await this.ensureInitialized();

    // 生成新密钥
    const newKey = this.generateKey();
    const newKeyId = this.generateKeyId();

    // 保存旧密钥到历史
    if (this.currentKey && this.currentKeyId) {
      const current = this.keyHistory.get(this.currentKeyId);
      if (current) {
        this.keyHistory.set(this.currentKeyId, {
          key: this.currentKey,
          info: {
            ...current.info,
            active: false,
            rotationCount: current.info.rotationCount + 1,
          },
        });
      }
    }

    // 设置新密钥
    this.currentKey = newKey;
    this.currentKeyId = newKeyId;

    // 记录新密钥
    this.keyHistory.set(newKeyId, {
      key: newKey,
      info: {
        keyId: newKeyId,
        createdAt: new Date(),
        source: 'generated',
        active: true,
        rotationCount: 0,
      },
    });

    log.info('密钥已轮换', { newKeyId, previousKeyId: this.currentKeyId });
    return newKeyId;
  }

  /**
   * 检查是否需要轮换
   */
  async needsRotation(): Promise<boolean> {
    await this.ensureInitialized();

    if (this.config.rotationDays <= 0) return false;

    const infos = await this.getKeyInfos();
    const activeKey = infos.find(i => i.active);
    if (!activeKey) return false;

    const daysSinceCreation =
      (Date.now() - activeKey.createdAt.getTime()) / (1000 * 60 * 60 * 24);

    return daysSinceCreation >= this.config.rotationDays;
  }

  /**
   * 导出密钥（用于备份，需谨慎使用）
   */
  async exportKey(keyId?: string): Promise<string> {
    await this.ensureInitialized();

    let key: Uint8Array;
    let id: string;

    if (keyId) {
      const historical = this.keyHistory.get(keyId);
      if (!historical) {
        throw new Error(`密钥不存在: ${keyId}`);
      }
      key = historical.key;
      id = keyId;
    } else {
      if (!this.currentKey || !this.currentKeyId) {
        throw new Error('当前密钥未初始化');
      }
      key = this.currentKey;
      id = this.currentKeyId;
    }

    // Base64 编码
    const exported = Buffer.from(key).toString('base64');

    log.warn('密钥已导出', { keyId: id });
    return exported;
  }

  /**
   * 导入密钥
   */
  async importKey(base64Key: string, source: KeySource = 'env'): Promise<string> {
    const key = Buffer.from(base64Key, 'base64');

    if (key.length !== this.config.keyLength) {
      throw new Error(`密钥长度不正确: 期望 ${this.config.keyLength}，实际 ${key.length}`);
    }

    await this.setKey(key, source);
    log.info('密钥已导入', { keyId: this.currentKeyId, source });
    return this.currentKeyId;
  }

  /**
   * 关闭密钥管理器
   */
  async close(): Promise<void> {
    // 安全清除密钥
    if (this.currentKey) {
      this.currentKey.fill(0);
      this.currentKey = null;
    }

    for (const { key } of this.keyHistory.values()) {
      key.fill(0);
    }
    this.keyHistory.clear();

    this.initialized = false;
    log.info('密钥管理器已关闭');
  }

  // ========== 私有方法 ==========

  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }

  private getFromEnv(): Uint8Array | null {
    const envValue = process.env[this.config.envKeyName];
    if (!envValue) return null;

    // 尝试 Base64 解码
    try {
      const decoded = Buffer.from(envValue, 'base64');
      if (decoded.length >= 16) {
        // 如果长度不足，进行派生
        if (decoded.length < this.config.keyLength) {
          return this.deriveKey(decoded.toString('utf8'));
        }
        return new Uint8Array(decoded.slice(0, this.config.keyLength));
      }
    } catch {
      // 不是 Base64，作为原始字符串处理
    }

    // 作为字符串派生密钥
    return this.deriveKey(envValue);
  }

  private deriveFromSystem(): Uint8Array | null {
    // 收集系统标识符
    const identifiers: string[] = [];

    // 用户名
    const username = process.env.USERNAME ?? process.env.USER;
    if (username) identifiers.push(username);

    // 主机名
    const hostname = process.env.COMPUTERNAME ?? process.env.HOSTNAME;
    if (hostname) identifiers.push(hostname);

    // 用户主目录
    const homeDir = process.env.USERPROFILE ?? process.env.HOME;
    if (homeDir) identifiers.push(homeDir);

    // 应用路径
    if (identifiers.length < 2) {
      identifiers.push('micro-agent');
    }

    if (identifiers.length === 0) {
      return null;
    }

    // 组合标识符
    const combined = identifiers.join(':');
    return this.deriveKey(combined);
  }

  private deriveKey(source: string): Uint8Array {
    const salt = this.config.derivationSalt ?? 'micro-agent-salt-v1';

    const derived = pbkdf2Sync(
      source,
      salt,
      this.config.derivationIterations,
      this.config.keyLength,
      'sha256'
    );

    return new Uint8Array(derived);
  }

  private generateKey(): Uint8Array {
    return new Uint8Array(randomBytes(this.config.keyLength));
  }

  private generateKeyId(): string {
    const timestamp = Date.now().toString(36);
    const random = randomBytes(4).toString('hex');
    return `key_${timestamp}_${random}`;
  }

  private async setKey(key: Uint8Array, source: KeySource): Promise<void> {
    const keyId = this.generateKeyId();

    this.currentKey = key;
    this.currentKeyId = keyId;

    this.keyHistory.set(keyId, {
      key,
      info: {
        keyId,
        createdAt: new Date(),
        source,
        active: true,
        rotationCount: 0,
      },
    });
  }
}

/** 导出单例 */
let defaultManager: KeyManager | null = null;

/**
 * 获取默认密钥管理器
 */
export function getDefaultKeyManager(): KeyManager {
  if (!defaultManager) {
    defaultManager = new KeyManager();
  }
  return defaultManager;
}

/**
 * 重置默认密钥管理器
 */
export function resetDefaultKeyManager(): void {
  if (defaultManager) {
    defaultManager.close().catch(() => {});
  }
  defaultManager = null;
}
