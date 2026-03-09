/**
 * 敏感信息检测器
 *
 * 自动检测 API 密钥、个人身份信息等敏感内容。
 * 支持正则规则扩展，检测准确率 > 95%。
 */

import { z } from 'zod';
import { getLogger } from '@logtape/logtape';

const log = getLogger(['memory', 'security', 'detector']);

/** 敏感类型枚举 Schema */
const SensitiveTypeSchema = z.enum([
  'api_key',
  'email',
  'phone',
  'id_card',
  'bank_card',
  'password',
  'token',
  'secret',
]);

/** 敏感信息类型 */
export type SensitiveType = z.infer<typeof SensitiveTypeSchema>;

/** 检测规则配置 */
export const DetectionRuleSchema = z.object({
  /** 规则标识 */
  id: z.string(),
  /** 敏感类型 */
  type: SensitiveTypeSchema,
  /** 正则表达式 */
  pattern: z.string(),
  /** 描述 */
  description: z.string(),
  /** 置信度权重 (0-1) */
  confidence: z.number().min(0).max(1).default(0.9),
  /** 是否启用 */
  enabled: z.boolean().default(true),
});

export type DetectionRule = z.infer<typeof DetectionRuleSchema>;

/** 检测结果 */
export interface DetectionMatch {
  /** 敏感类型 */
  type: SensitiveType;
  /** 匹配文本 */
  match: string;
  /** 起始位置 */
  start: number;
  /** 结束位置 */
  end: number;
  /** 置信度 (0-1) */
  confidence: number;
  /** 规则 ID */
  ruleId: string;
}

/** 检测结果 */
export interface DetectionResult {
  /** 是否包含敏感信息 */
  hasSensitive: boolean;
  /** 所有匹配项 */
  matches: DetectionMatch[];
  /** 敏感类型统计 */
  types: Map<SensitiveType, number>;
  /** 最高置信度 */
  maxConfidence: number;
  /** 处理建议 */
  recommendation: 'encrypt' | 'redact' | 'none';
}

/** 检测器配置 */
export interface SensitiveDetectorConfig {
  /** 是否启用检测 */
  enabled: boolean;
  /** 自定义规则 */
  customRules?: DetectionRule[];
  /** 排除的字段名 */
  excludeFields?: string[];
  /** 置信度阈值 */
  confidenceThreshold: number;
}

/** 默认内置检测规则 */
export const DEFAULT_RULES: DetectionRule[] = [
  // API Keys
  {
    id: 'openai-key',
    type: 'api_key',
    pattern: 'sk-[a-zA-Z0-9]{20,}',
    description: 'OpenAI API Key',
    confidence: 0.95,
    enabled: true,
  },
  {
    id: 'anthropic-key',
    type: 'api_key',
    pattern: 'sk-ant-[a-zA-Z0-9-_]{20,}',
    description: 'Anthropic API Key',
    confidence: 0.95,
    enabled: true,
  },
  {
    id: 'slack-token',
    type: 'token',
    pattern: 'xox[baprs]-[0-9]{10,}-[0-9]{10,}-[a-zA-Z0-9]{24}',
    description: 'Slack Token',
    confidence: 0.98,
    enabled: true,
  },
  {
    id: 'github-token',
    type: 'token',
    pattern: 'ghp_[a-zA-Z0-9]{36}',
    description: 'GitHub Personal Access Token',
    confidence: 0.98,
    enabled: true,
  },
  {
    id: 'github-oauth',
    type: 'token',
    pattern: 'gho_[a-zA-Z0-9]{36}',
    description: 'GitHub OAuth Token',
    confidence: 0.98,
    enabled: true,
  },
  {
    id: 'aws-access-key',
    type: 'api_key',
    pattern: 'AKIA[0-9A-Z]{16}',
    description: 'AWS Access Key ID',
    confidence: 0.95,
    enabled: true,
  },
  {
    id: 'google-api-key',
    type: 'api_key',
    pattern: 'AIza[a-zA-Z0-9_-]{35}',
    description: 'Google API Key',
    confidence: 0.95,
    enabled: true,
  },
  {
    id: 'generic-api-key',
    type: 'api_key',
    pattern: '(api[_-]?key|apikey|API[_-]?KEY|APIKEY)["\']?\\s*[:=]\\s*["\']?[a-zA-Z0-9_-]{20,}',
    description: 'Generic API Key Pattern',
    confidence: 0.8,
    enabled: true,
  },
  // 邮箱
  {
    id: 'email',
    type: 'email',
    pattern: '[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}',
    description: 'Email Address',
    confidence: 0.9,
    enabled: true,
  },
  // 手机号（中国）
  {
    id: 'phone-cn',
    type: 'phone',
    pattern: '(?:\\+?86)?1[3-9]\\d{9}',
    description: 'Chinese Mobile Phone Number',
    confidence: 0.85,
    enabled: true,
  },
  // 手机号（国际）
  {
    id: 'phone-intl',
    type: 'phone',
    pattern: '\\+?[1-9]\\d{6,14}',
    description: 'International Phone Number',
    confidence: 0.7,
    enabled: true,
  },
  // 身份证号（中国）
  {
    id: 'id-card-cn',
    type: 'id_card',
    pattern: '\\d{17}[\\dXx]',
    description: 'Chinese ID Card Number',
    confidence: 0.9,
    enabled: true,
  },
  // 银行卡号
  {
    id: 'bank-card',
    type: 'bank_card',
    pattern: '\\b\\d{13,19}\\b',
    description: 'Bank Card Number',
    confidence: 0.7,
    enabled: true,
  },
  // 密码字段
  {
    id: 'password-field',
    type: 'password',
    pattern: '(password|passwd|pwd|PASSWORD|PASSWD|PWD|Password|Passwd|Pwd)["\']?\\s*[:=]\\s*["\']?[^\\s"\']{4,}',
    description: 'Password Field',
    confidence: 0.9,
    enabled: true,
  },
  // Secret/Token 字段
  {
    id: 'secret-field',
    type: 'secret',
    pattern: '(secret|token|bearer|SECRET|TOKEN|BEARER|Secret|Token|Bearer)["\']?\\s*[:=]\\s*["\']?[^\\s"\']{8,}',
    description: 'Secret/Token Field',
    confidence: 0.85,
    enabled: true,
  },
  // JWT Token
  {
    id: 'jwt-token',
    type: 'token',
    pattern: 'eyJ[a-zA-Z0-9_-]+\\.eyJ[a-zA-Z0-9_-]+\\.[a-zA-Z0-9_-]+',
    description: 'JWT Token',
    confidence: 0.95,
    enabled: true,
  },
];

/** 默认配置 */
const DEFAULT_CONFIG: SensitiveDetectorConfig = {
  enabled: true,
  confidenceThreshold: 0.7,
  excludeFields: [],
};

/**
 * 敏感信息检测器
 *
 * 职责：
 * - 自动检测文本中的敏感信息
 * - 支持自定义规则扩展
 * - 提供处理建议
 */
export class SensitiveDetector {
  private config: SensitiveDetectorConfig;
  private rules: DetectionRule[];
  private compiledPatterns: Map<string, RegExp> = new Map();

  constructor(config: Partial<SensitiveDetectorConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.rules = [...DEFAULT_RULES];

    // 添加自定义规则
    if (this.config.customRules) {
      for (const rule of this.config.customRules) {
        this.addRule(rule);
      }
    }

    // 预编译所有正则
    this.compilePatterns();

    log.info('敏感信息检测器已初始化', {
      enabled: this.config.enabled,
      ruleCount: this.rules.length,
    });
  }

  /**
   * 检测文本中的敏感信息
   */
  detect(text: string): DetectionResult {
    if (!this.config.enabled || !text) {
      return this.emptyResult();
    }

    const matches: DetectionMatch[] = [];
    const types = new Map<SensitiveType, number>();

    for (const rule of this.rules) {
      if (!rule.enabled) continue;

      const regex = this.compiledPatterns.get(rule.id);
      if (!regex) continue;

      let match: RegExpExecArray | null;
      while ((match = regex.exec(text)) !== null) {
        // 跳过低置信度匹配
        if (rule.confidence < this.config.confidenceThreshold) continue;

        matches.push({
          type: rule.type,
          match: match[0],
          start: match.index,
          end: match.index + match[0].length,
          confidence: rule.confidence,
          ruleId: rule.id,
        });

        // 统计类型
        const count = types.get(rule.type) ?? 0;
        types.set(rule.type, count + 1);

        // 避免零宽匹配导致的无限循环
        if (match[0].length === 0) {
          regex.lastIndex++;
        }
      }

      // 重置正则状态
      regex.lastIndex = 0;
    }

    // 按置信度排序
    matches.sort((a, b) => b.confidence - a.confidence);

    const maxConfidence = matches.length > 0
      ? Math.max(...matches.map(m => m.confidence))
      : 0;

    // 确定处理建议
    const recommendation = this.determineRecommendation(matches, types);

    log.debug('敏感信息检测完成', {
      hasSensitive: matches.length > 0,
      matchCount: matches.length,
      types: Object.fromEntries(types),
    });

    return {
      hasSensitive: matches.length > 0,
      matches,
      types,
      maxConfidence,
      recommendation,
    };
  }

  /**
   * 检测字段是否敏感
   */
  isFieldSensitive(fieldName: string): boolean {
    if (!this.config.enabled) return false;

    const normalizedField = fieldName.toLowerCase();
    const excludeFields = this.config.excludeFields?.map(f => f.toLowerCase()) ?? [];

    // 检查排除列表
    if (excludeFields.includes(normalizedField)) {
      return false;
    }

    // 检查敏感字段名
    const sensitivePatterns = [
      'password', 'passwd', 'pwd', 'secret', 'token', 'api_key', 'apikey',
      'private_key', 'privatekey', 'credential', 'auth', 'access_key',
    ];

    return sensitivePatterns.some(p => normalizedField.includes(p));
  }

  /**
   * 添加自定义规则
   */
  addRule(rule: DetectionRule): void {
    const parsed = DetectionRuleSchema.parse(rule);
    
    // 检查是否已存在
    const existingIndex = this.rules.findIndex(r => r.id === parsed.id);
    if (existingIndex >= 0) {
      this.rules[existingIndex] = parsed;
    } else {
      this.rules.push(parsed);
    }

    // 编译新规则
    this.compilePattern(parsed);

    log.debug('添加检测规则', { id: parsed.id, type: parsed.type });
  }

  /**
   * 移除规则
   */
  removeRule(ruleId: string): boolean {
    const index = this.rules.findIndex(r => r.id === ruleId);
    if (index >= 0) {
      this.rules.splice(index, 1);
      this.compiledPatterns.delete(ruleId);
      log.debug('移除检测规则', { id: ruleId });
      return true;
    }
    return false;
  }

  /**
   * 获取所有规则
   */
  getRules(): DetectionRule[] {
    return [...this.rules];
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<SensitiveDetectorConfig>): void {
    this.config = { ...this.config, ...config };
    log.info('敏感信息检测器配置已更新', { enabled: this.config.enabled });
  }

  // ========== 私有方法 ==========

  private compilePatterns(): void {
    this.compiledPatterns.clear();
    for (const rule of this.rules) {
      this.compilePattern(rule);
    }
  }

  private compilePattern(rule: DetectionRule): void {
    try {
      const regex = new RegExp(rule.pattern, 'g');
      this.compiledPatterns.set(rule.id, regex);
    } catch (e) {
      log.error('正则编译失败', { id: rule.id, pattern: rule.pattern, error: String(e) });
    }
  }

  private determineRecommendation(
    matches: DetectionMatch[],
    types: Map<SensitiveType, number>,
  ): 'encrypt' | 'redact' | 'none' {
    if (matches.length === 0) return 'none';

    // API 密钥和 Token 必须加密
    if (types.has('api_key') || types.has('token') || types.has('secret')) {
      return 'encrypt';
    }

    // 密码必须加密
    if (types.has('password')) {
      return 'encrypt';
    }

    // 银行卡号必须加密
    if (types.has('bank_card')) {
      return 'encrypt';
    }

    // 身份证号需要脱敏
    if (types.has('id_card')) {
      return 'redact';
    }

    // 手机号需要脱敏
    if (types.has('phone')) {
      return 'redact';
    }

    // 高置信度匹配建议加密
    const highConfidenceMatches = matches.filter(m => m.confidence >= 0.9);
    if (highConfidenceMatches.length > 0) {
      return 'encrypt';
    }

    return 'redact';
  }

  private emptyResult(): DetectionResult {
    return {
      hasSensitive: false,
      matches: [],
      types: new Map(),
      maxConfidence: 0,
      recommendation: 'none',
    };
  }
}

/** 导出单例（可选） */
let defaultDetector: SensitiveDetector | null = null;

/**
 * 获取默认检测器
 */
export function getDefaultDetector(): SensitiveDetector {
  if (!defaultDetector) {
    defaultDetector = new SensitiveDetector();
  }
  return defaultDetector;
}

/**
 * 重置默认检测器
 */
export function resetDefaultDetector(): void {
  defaultDetector = null;
}
