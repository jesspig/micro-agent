/**
 * 加密存储
 *
 * 敏感字段加密存储，检索时透明解密。
 * 使用 AES-256-GCM 算法，支持字段级加密。
 */

import { z } from 'zod';
import { getLogger } from '@logtape/logtape';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import type { KeyManager } from './key-manager';
import { getDefaultKeyManager } from './key-manager';

const log = getLogger(['memory', 'security', 'encryption']);

/** 加密算法 */
const ALGORITHM = 'aes-256-gcm';
/** IV 长度（字节） */
const IV_LENGTH = 12;
/** 认证标签长度（字节） */
const AUTH_TAG_LENGTH = 16;

/** 加密数据格式 */
export interface EncryptedData {
  /** 加密版本 */
  version: number;
  /** 密钥标识 */
  keyId: string;
  /** 初始化向量（Base64） */
  iv: string;
  /** 认证标签（Base64） */
  authTag: string;
  /** 加密数据（Base64） */
  ciphertext: string;
}

/** 加密配置 */
export const EncryptionConfigSchema = z.object({
  /** 是否启用加密 */
  enabled: z.boolean().default(true),
  /** 自动检测敏感信息 */
  autoDetect: z.boolean().default(true),
  /** 加密字段前缀 */
  fieldPrefix: z.string().default('encrypted:'),
});

export type EncryptionConfig = z.infer<typeof EncryptionConfigSchema>;

/** 默认配置 */
const DEFAULT_CONFIG: EncryptionConfig = {
  enabled: true,
  autoDetect: true,
  fieldPrefix: 'encrypted:',
};

/**
 * 加密存储
 *
 * 职责：
 * - 字段级加密/解密
 * - 透明加密支持
 * - 与敏感信息检测器集成
 */
export class EncryptionService {
  private config: EncryptionConfig;
  private keyManager: KeyManager;
  private initialized = false;

  constructor(
    keyManager?: KeyManager,
    config: Partial<EncryptionConfig> = {},
  ) {
    this.keyManager = keyManager ?? getDefaultKeyManager();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * 初始化加密服务
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    await this.keyManager.initialize();
    this.initialized = true;

    log.info('加密服务已初始化', { enabled: this.config.enabled });
  }

  /**
   * 加密数据
   */
  async encrypt(plaintext: string): Promise<EncryptedData> {
    await this.ensureInitialized();

    const { key, keyId } = await this.keyManager.getCurrentKey();

    // 生成 IV
    const iv = randomBytes(IV_LENGTH);

    // 创建加密器
    const cipher = createCipheriv(ALGORITHM, key, iv, {
      authTagLength: AUTH_TAG_LENGTH,
    });

    // 加密
    const encrypted = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);

    // 获取认证标签
    const authTag = cipher.getAuthTag();

    const result: EncryptedData = {
      version: 1,
      keyId,
      iv: iv.toString('base64'),
      authTag: authTag.toString('base64'),
      ciphertext: encrypted.toString('base64'),
    };

    log.debug('数据已加密', { keyId, dataLength: plaintext.length });
    return result;
  }

  /**
   * 解密数据
   */
  async decrypt(encryptedData: EncryptedData): Promise<string> {
    await this.ensureInitialized();

    // 获取密钥（支持历史密钥）
    const key = await this.keyManager.getKeyById(encryptedData.keyId);
    if (!key) {
      throw new Error(`密钥不存在或已失效: ${encryptedData.keyId}`);
    }

    // 解码 Base64
    const iv = Buffer.from(encryptedData.iv, 'base64');
    const authTag = Buffer.from(encryptedData.authTag, 'base64');
    const ciphertext = Buffer.from(encryptedData.ciphertext, 'base64');

    // 创建解密器
    const decipher = createDecipheriv(ALGORITHM, key, iv, {
      authTagLength: AUTH_TAG_LENGTH,
    });

    // 设置认证标签
    decipher.setAuthTag(authTag);

    try {
      // 解密
      const decrypted = Buffer.concat([
        decipher.update(ciphertext),
        decipher.final(),
      ]);

      log.debug('数据已解密', { keyId: encryptedData.keyId });
      return decrypted.toString('utf8');
    } catch (e) {
      log.error('解密失败', { keyId: encryptedData.keyId, error: String(e) });
      throw new Error('解密失败：数据可能被篡改或密钥不正确');
    }
  }

  /**
   * 检查是否为加密数据
   */
  isEncrypted(value: unknown): value is EncryptedData {
    if (typeof value === 'object' && value !== null) {
      const obj = value as Record<string, unknown>;
      return (
        typeof obj.version === 'number' &&
        typeof obj.keyId === 'string' &&
        typeof obj.iv === 'string' &&
        typeof obj.authTag === 'string' &&
        typeof obj.ciphertext === 'string'
      );
    }
    return false;
  }

  /**
   * 加密对象中的指定字段
   */
  async encryptFields<T extends Record<string, unknown>>(
    obj: T,
    fields: (keyof T)[],
  ): Promise<T> {
    await this.ensureInitialized();

    if (!this.config.enabled) return obj;

    const result = { ...obj };

    for (const field of fields) {
      const value = result[field];
      if (value !== undefined && value !== null) {
        const plaintext = typeof value === 'string' ? value : JSON.stringify(value);
        const encrypted = await this.encrypt(plaintext);
        (result as Record<string, unknown>)[field as string] = encrypted;
      }
    }

    return result;
  }

  /**
   * 解密对象中的加密字段
   */
  async decryptFields<T extends Record<string, unknown>>(
    obj: T,
    fields?: (keyof T)[],
  ): Promise<T> {
    await this.ensureInitialized();

    const result = { ...obj };
    const fieldsToDecrypt = fields ?? (Object.keys(result) as (keyof T)[]);

    for (const field of fieldsToDecrypt) {
      const value = result[field];
      if (this.isEncrypted(value)) {
        try {
          const decrypted = await this.decrypt(value);
          // 尝试解析 JSON
          try {
            (result as Record<string, unknown>)[field as string] = JSON.parse(decrypted);
          } catch {
            (result as Record<string, unknown>)[field as string] = decrypted;
          }
        } catch (e) {
          log.warn('字段解密失败', { field: String(field), error: String(e) });
        }
      }
    }

    return result;
  }

  /**
   * 加密内容字符串（返回带前缀的加密字符串）
   */
  async encryptContent(content: string): Promise<string> {
    const encrypted = await this.encrypt(content);
    return this.config.fieldPrefix + JSON.stringify(encrypted);
  }

  /**
   * 解密内容字符串
   */
  async decryptContent(content: string): Promise<string> {
    if (!content.startsWith(this.config.fieldPrefix)) {
      return content;
    }

    const jsonStr = content.slice(this.config.fieldPrefix.length);
    const encryptedData = JSON.parse(jsonStr) as EncryptedData;
    return this.decrypt(encryptedData);
  }

  /**
   * 检查内容是否已加密
   */
  isContentEncrypted(content: string): boolean {
    return content.startsWith(this.config.fieldPrefix);
  }

  /**
   * 批量加密
   */
  async encryptBatch(items: string[]): Promise<EncryptedData[]> {
    await this.ensureInitialized();

    return Promise.all(items.map(item => this.encrypt(item)));
  }

  /**
   * 批量解密
   */
  async decryptBatch(items: EncryptedData[]): Promise<string[]> {
    await this.ensureInitialized();

    return Promise.all(items.map(item => this.decrypt(item)));
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<EncryptionConfig>): void {
    this.config = { ...this.config, ...config };
    log.info('加密服务配置已更新', { enabled: this.config.enabled });
  }

  /**
   * 关闭服务
   */
  async close(): Promise<void> {
    this.initialized = false;
    log.info('加密服务已关闭');
  }

  // ========== 私有方法 ==========

  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }
}

/** 导出单例 */
let defaultService: EncryptionService | null = null;

/**
 * 获取默认加密服务
 */
export function getDefaultEncryptionService(): EncryptionService {
  if (!defaultService) {
    defaultService = new EncryptionService();
  }
  return defaultService;
}

/**
 * 重置默认加密服务
 */
export function resetDefaultEncryptionService(): void {
  if (defaultService) {
    defaultService.close().catch(() => {});
  }
  defaultService = null;
}
