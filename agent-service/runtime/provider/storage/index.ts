/**
 * Storage Provider 模块入口
 *
 * 存储提供者接口和实现
 */

/** 存储提供者接口 */
export interface StorageProvider {
  /** Provider 名称 */
  readonly name: string;
  
  /** 获取数据 */
  get<T>(key: string): Promise<T | null>;
  
  /** 设置数据 */
  set<T>(key: string, value: T, ttl?: number): Promise<void>;
  
  /** 删除数据 */
  delete(key: string): Promise<void>;
  
  /** 检查键是否存在 */
  has(key: string): Promise<boolean>;
  
  /** 清空所有数据 */
  clear(): Promise<void>;
}

/**
 * 内存存储提供者
 */
export class MemoryStorageProvider implements StorageProvider {
  readonly name = 'memory-storage';
  private data: Map<string, { value: unknown; expiresAt?: number }> = new Map();

  async get<T>(key: string): Promise<T | null> {
    const entry = this.data.get(key);
    if (!entry) return null;
    
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      this.data.delete(key);
      return null;
    }
    
    return entry.value as T;
  }

  async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    this.data.set(key, {
      value,
      expiresAt: ttl ? Date.now() + ttl : undefined,
    });
  }

  async delete(key: string): Promise<void> {
    this.data.delete(key);
  }

  async has(key: string): Promise<boolean> {
    const entry = this.data.get(key);
    if (!entry) return false;
    
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      this.data.delete(key);
      return false;
    }
    
    return true;
  }

  async clear(): Promise<void> {
    this.data.clear();
  }
}

/**
 * 创建内存存储提供者
 */
export function createMemoryStorageProvider(): StorageProvider {
  return new MemoryStorageProvider();
}
