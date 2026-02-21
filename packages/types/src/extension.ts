/**
 * 扩展系统类型定义
 */

/** 扩展类型 */
export type ExtensionType =
  | 'tool'
  | 'channel'
  | 'skill'
  | 'agent'
  | 'workflow'
  | 'command'
  | 'mcp-client'
  | 'mcp-server';

/** 扩展描述符 */
export interface ExtensionDescriptor {
  /** 扩展 ID（唯一标识） */
  readonly id: string;
  /** 扩展名称（显示名称） */
  readonly name: string;
  /** 扩展版本 */
  readonly version: string;
  /** 扩展类型 */
  readonly type: ExtensionType;
  /** 扩展描述 */
  readonly description?: string;
  /** 作者 */
  readonly author?: string;
  /** 入口文件路径（相对于扩展目录） */
  readonly main?: string;
  /** 依赖列表（按目录顺序加载，无自动解析） */
  readonly dependencies?: string[];
}

/** 扩展上下文（传递给 activate） */
export interface ExtensionContext {
  /** 扩展所在目录 */
  readonly extensionPath: string;
  /** 工作目录 */
  readonly workspace: string;
  /** 注册工具 */
  registerTool: (tool: unknown) => void;
  /** 注册通道 */
  registerChannel: (channel: unknown) => void;
  /** 获取配置 */
  getConfig: <T>(key: string) => T | undefined;
  /** 日志记录器 */
  readonly logger: {
    info: (message: string, data?: Record<string, unknown>) => void;
    warn: (message: string, data?: Record<string, unknown>) => void;
    error: (message: string, data?: Record<string, unknown>) => void;
    debug: (message: string, data?: Record<string, unknown>) => void;
  };
}

/** 扩展接口 */
export interface Extension {
  /** 扩展描述符 */
  readonly descriptor: ExtensionDescriptor;
  /**
   * 激活扩展
   * @param context - 扩展上下文
   */
  activate(context: ExtensionContext): Promise<void>;
  /**
   * 停用扩展
   */
  deactivate(): Promise<void>;
}

/** 已加载的扩展 */
export interface LoadedExtension {
  /** 扩展实例 */
  readonly extension: Extension;
  /** 加载时间 */
  readonly loadedAt: Date;
  /** 扩展路径 */
  readonly path: string;
  /** 是否激活 */
  readonly isActive: boolean;
}

/** 扩展变更事件 */
export interface ExtensionChangeEvent {
  /** 变更类型 */
  readonly type: 'add' | 'change' | 'delete';
  /** 扩展路径 */
  readonly path: string;
  /** 扩展类型 */
  readonly extensionType: ExtensionType;
  /** 扩展 ID（delete 时可能为空） */
  readonly extensionId?: string;
}

/** 扩展发现结果 */
export interface ExtensionDiscoveryResult {
  /** 发现的扩展描述符列表 */
  readonly descriptors: ExtensionDescriptor[];
  /** 错误列表 */
  readonly errors: Array<{ path: string; error: Error }>;
  /** 扫描的目录数量 */
  readonly scannedDirs: number;
}
