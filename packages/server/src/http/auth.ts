/**
 * 认证模块
 *
 * 提供可选的令牌认证支持。
 */

import { getLogger } from '@logtape/logtape';
import { randomBytes } from 'crypto';

const log = getLogger(['server', 'auth']);

/** 认证配置 */
export interface AuthConfig {
  /** 是否启用认证 */
  enabled: boolean;
  /** 认证令牌 */
  token?: string;
  /** 令牌有效期（毫秒，0 表示永不过期） */
  tokenExpiry?: number;
}

/** 认证结果 */
export interface AuthResult {
  /** 是否认证成功 */
  success: boolean;
  /** 用户标识（如果认证成功） */
  userId?: string;
  /** 错误信息（如果认证失败） */
  error?: string;
}

/** 会话令牌 */
interface SessionToken {
  token: string;
  userId: string;
  createdAt: number;
  expiresAt: number;
}

/**
 * 认证管理器
 */
export class AuthManager {
  private config: AuthConfig;
  private sessionTokens = new Map<string, SessionToken>();

  constructor(config: AuthConfig) {
    this.config = config;
  }

  /**
   * 验证请求
   */
  verify(authHeader: string | null): AuthResult {
    if (!this.config.enabled) {
      return { success: true, userId: 'anonymous' };
    }

    if (!authHeader) {
      return { success: false, error: '缺少认证头' };
    }

    const token = this.extractToken(authHeader);
    if (!token) {
      return { success: false, error: '无效的认证头格式' };
    }

    // 检查主令牌
    if (this.config.token && token === this.config.token) {
      return { success: true, userId: 'admin' };
    }

    // 检查会话令牌
    const sessionToken = this.sessionTokens.get(token);
    if (sessionToken) {
      if (Date.now() < sessionToken.expiresAt) {
        return { success: true, userId: sessionToken.userId };
      } else {
        this.sessionTokens.delete(token);
        return { success: false, error: '会话已过期' };
      }
    }

    return { success: false, error: '无效的令牌' };
  }

  /**
   * 创建会话令牌
   */
  createSessionToken(userId: string): string {
    const token = this.generateToken();
    const now = Date.now();
    const expiry = this.config.tokenExpiry ?? 3600000; // 默认 1 小时

    this.sessionTokens.set(token, {
      token,
      userId,
      createdAt: now,
      expiresAt: now + expiry,
    });

    log.info('创建会话令牌: userId={userId}', { userId });
    return token;
  }

  /**
   * 撤销会话令牌
   */
  revokeSessionToken(token: string): boolean {
    const deleted = this.sessionTokens.delete(token);
    if (deleted) {
      log.info('撤销会话令牌');
    }
    return deleted;
  }

  /**
   * 清理过期令牌
   */
  cleanupExpiredTokens(): number {
    const now = Date.now();
    let count = 0;

    for (const [token, session] of this.sessionTokens) {
      if (now >= session.expiresAt) {
        this.sessionTokens.delete(token);
        count++;
      }
    }

    if (count > 0) {
      log.info('清理过期令牌: count={count}', { count });
    }

    return count;
  }

  /**
   * 从认证头提取令牌
   */
  private extractToken(authHeader: string): string | null {
    if (authHeader.startsWith('Bearer ')) {
      return authHeader.slice(7);
    }
    if (authHeader.startsWith('Token ')) {
      return authHeader.slice(6);
    }
    return authHeader;
  }

  /**
   * 生成随机令牌
   */
  private generateToken(): string {
    return randomBytes(32).toString('hex');
  }
}
