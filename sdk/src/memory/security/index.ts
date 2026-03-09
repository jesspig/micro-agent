/**
 * Security 模块入口
 *
 * 提供敏感信息检测、加密存储和密钥管理功能。
 */

// 敏感信息检测器
export {
  SensitiveDetector,
  getDefaultDetector,
  resetDefaultDetector,
  DetectionRuleSchema,
  DEFAULT_RULES,
} from './sensitive-detector';

export type {
  SensitiveType,
  DetectionRule,
  DetectionMatch,
  DetectionResult,
  SensitiveDetectorConfig,
} from './sensitive-detector';

// 密钥管理器
export {
  KeyManager,
  getDefaultKeyManager,
  resetDefaultKeyManager,
  KeyManagerConfigSchema,
} from './key-manager';

export type {
  KeySource,
  KeyInfo,
  KeyManagerConfig,
} from './key-manager';

// 加密服务
export {
  EncryptionService,
  getDefaultEncryptionService,
  resetDefaultEncryptionService,
  EncryptionConfigSchema,
} from './encryption';

export type {
  EncryptedData,
  EncryptionConfig,
} from './encryption';

/**
 * 创建安全上下文
 *
 * 一次性初始化所有安全组件
 */
export async function createSecurityContext(options?: {
  encryptionEnabled?: boolean;
  autoDetect?: boolean;
  allowAutoGenerateKey?: boolean;
}): Promise<{
  detector: import('./sensitive-detector').SensitiveDetector;
  keyManager: import('./key-manager').KeyManager;
  encryption: import('./encryption').EncryptionService;
}> {
  const { SensitiveDetector } = await import('./sensitive-detector');
  const { KeyManager } = await import('./key-manager');
  const { EncryptionService } = await import('./encryption');

  // 创建密钥管理器
  const keyManager = new KeyManager({
    allowAutoGenerate: options?.allowAutoGenerateKey ?? false,
  });

  // 创建加密服务
  const encryption = new EncryptionService(keyManager, {
    enabled: options?.encryptionEnabled ?? true,
    autoDetect: options?.autoDetect ?? true,
  });

  // 创建敏感信息检测器
  const detector = new SensitiveDetector({
    enabled: true,
  });

  // 初始化
  await keyManager.initialize();
  await encryption.initialize();

  return { detector, keyManager, encryption };
}
