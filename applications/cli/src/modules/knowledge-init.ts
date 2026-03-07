/**
 * 知识库系统初始化模块
 *
 * 为 Agent Service 准备知识库配置数据。
 * 此模块仅负责准备配置数据，不负责实际初始化。
 *
 * 知识库是独立于记忆系统的文档存储，用于存放用户上传的文档和参考资料。
 * 通过 RAG (Retrieval-Augmented Generation) 技术实现智能检索。
 */

import type { Config } from '@micro-agent/sdk';
import { resolve } from 'path';
import { homedir } from 'os';

/**
 * 知识库配置接口
 *
 * 包含 Agent Service 初始化知识库系统所需的完整配置信息
 */
export interface KnowledgeBaseConfig {
  /** 是否启用知识库 */
  enabled: boolean;
  /** 知识库存储路径（已展开） */
  basePath: string;
  /** 嵌入模型 ID（格式：provider/model） */
  embedModel?: string;
  /** 支持的文件格式列表 */
  supportedFormats: string[];
  /** 分块大小（字符数） */
  chunkSize: number;
  /** 分块重叠（字符数） */
  chunkOverlap: number;
  /** 最大检索结果数 */
  maxSearchResults: number;
  /** 相似度阈值 */
  minSimilarityScore: number;
  /** 后台构建配置 */
  backgroundBuild: {
    /** 是否启用 */
    enabled: boolean;
    /** 构建间隔（毫秒） */
    interval: number;
    /** 每次处理的最大文档数 */
    batchSize: number;
    /** 空闲等待时间（毫秒） */
    idleDelay: number;
  };
}

/**
 * 知识库文档类型
 */
export type KnowledgeDocType =
  | 'markdown'
  | 'text'
  | 'pdf'
  | 'code'
  | 'json'
  | 'yaml'
  | 'word'
  | 'excel'
  | 'powerpoint'
  | 'csv'
  | 'xml'
  | 'rtf';

/**
 * 支持的文件扩展名映射
 */
export const KNOWLEDGE_FILE_EXTENSIONS: Record<string, KnowledgeDocType> = {
  // 文档类
  '.md': 'markdown',
  '.markdown': 'markdown',
  '.txt': 'text',
  '.text': 'text',
  '.pdf': 'pdf',
  '.rtf': 'rtf',
  '.xml': 'xml',
  // 数据类
  '.json': 'json',
  '.yaml': 'yaml',
  '.yml': 'yaml',
  '.csv': 'csv',
  '.tsv': 'csv',
  // Office 文档
  '.doc': 'word',
  '.docx': 'word',
  '.xls': 'excel',
  '.xlsx': 'excel',
  '.ppt': 'powerpoint',
  '.pptx': 'powerpoint',
  // 代码类
  '.js': 'code',
  '.jsx': 'code',
  '.ts': 'code',
  '.tsx': 'code',
  '.mjs': 'code',
  '.cjs': 'code',
  '.py': 'code',
  '.rs': 'code',
  '.go': 'code',
  '.java': 'code',
  '.kt': 'code',
  '.scala': 'code',
  '.cpp': 'code',
  '.c': 'code',
  '.h': 'code',
  '.hpp': 'code',
  '.cs': 'code',
  '.rb': 'code',
  '.php': 'code',
  '.swift': 'code',
  '.r': 'code',
  '.m': 'code',
  '.mm': 'code',
  '.pl': 'code',
  '.lua': 'code',
  '.vim': 'code',
  '.vimrc': 'code',
  '.html': 'code',
  '.htm': 'code',
  '.css': 'code',
  '.scss': 'code',
  '.sass': 'code',
  '.less': 'code',
  '.styl': 'code',
  '.sql': 'code',
  '.sh': 'code',
  '.bash': 'code',
  '.zsh': 'code',
  '.fish': 'code',
  '.ps1': 'code',
  '.bat': 'code',
  '.cmd': 'code',
};

/** 知识库内部文件（不处理为文档） */
const KNOWLEDGE_INTERNAL_FILES = new Set([
  'index.json',
  '.gitignore',
  '.gitkeep',
]);

/**
 * 获取知识库配置
 *
 * 从应用配置中提取知识库相关配置，并转换为 Agent Service 所需格式。
 *
 * @param config - 应用配置
 * @returns 知识库配置
 */
export function getKnowledgeBaseConfig(config: Config): KnowledgeBaseConfig {
  const embedModel = config.agents.models?.embed;
  const knowledgePath = getKnowledgeBasePath();

  // 知识库是否启用依赖���记忆系统和嵌入模型配置
  const enabled = isKnowledgeBaseEnabled(config);

  return {
    enabled,
    basePath: knowledgePath,
    embedModel: embedModel || undefined,
    supportedFormats: Object.keys(KNOWLEDGE_FILE_EXTENSIONS),
    chunkSize: 1000,
    chunkOverlap: 200,
    maxSearchResults: 5,
    minSimilarityScore: 0.6,
    backgroundBuild: {
      enabled: true,
      interval: 60000, // 1分钟检查一次
      batchSize: 3,
      idleDelay: 5000, // 空闲5秒后开始处理
    },
  };
}

/**
 * 检查知识库是否启用
 *
 * 知识库启用需要满足以下条件：
 * 1. 记忆系统已启用
 * 2. 已配置嵌入模型
 *
 * @param config - 应用配置
 * @returns 知识库是否启用
 */
export function isKnowledgeBaseEnabled(config: Config): boolean {
  // 记忆系统必须启用
  const memoryEnabled = config.agents.memory?.enabled ?? true;
  if (!memoryEnabled) {
    return false;
  }

  // 必须配置嵌入模型
  const embedModel = config.agents.models?.embed;
  return !!embedModel;
}

/**
 * 获取知识库路径
 *
 * 默认路径为 ~/.micro-agent/knowledge/
 *
 * @returns 知识库存储路径
 */
export function getKnowledgeBasePath(): string {
  return resolve(homedir(), '.micro-agent/knowledge');
}

/**
 * 获取支持的文件格式列表
 *
 * @returns 支持的文件扩展名数组
 */
export function getSupportedFormats(): string[] {
  return Object.keys(KNOWLEDGE_FILE_EXTENSIONS);
}

/**
 * 检查文件是否受知识库支持
 *
 * @param filename - 文件名
 * @returns 是否支持该文件类型
 */
export function isKnowledgeFileSupported(filename: string): boolean {
  // 排除知识库内部文件
  const basename = filename.split('/').pop()?.toLowerCase() ?? filename.toLowerCase();
  if (KNOWLEDGE_INTERNAL_FILES.has(basename)) {
    return false;
  }

  const ext = filename.toLowerCase().slice(filename.lastIndexOf('.'));
  return ext in KNOWLEDGE_FILE_EXTENSIONS;
}

/**
 * 获取文件的文档类型
 *
 * @param filename - 文件名
 * @returns 文档类型，不支持则返回 null
 */
export function getKnowledgeDocType(filename: string): KnowledgeDocType | null {
  const ext = filename.toLowerCase().slice(filename.lastIndexOf('.'));
  return KNOWLEDGE_FILE_EXTENSIONS[ext] || null;
}

/**
 * 获取知识库状态描述
 *
 * 用于启动信息显示。
 *
 * @param config - 应用配置
 * @returns 知识库状态描述
 */
export function getKnowledgeBaseStatusDescription(config: Config): string {
  const knowledgeConfig = getKnowledgeBaseConfig(config);

  if (!knowledgeConfig.enabled) {
    if (!config.agents.memory?.enabled) {
      return '已禁用（记忆系统未启用）';
    }
    if (!config.agents.models?.embed) {
      return '已禁用（未配置嵌入模型）';
    }
    return '已禁用';
  }

  return `已启用 (${knowledgeConfig.basePath})`;
}
