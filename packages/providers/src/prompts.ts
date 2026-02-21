/**
 * 意图识别类型定义
 */

/** 模型信息（用于提示词） */
export interface ModelInfo {
  id: string;
  level: string;
  vision: boolean;
  think: boolean;
}

/** 意图识别结果 */
export interface IntentResult {
  model: string;
  reason: string;
}

/** 提示词构建函数类型 */
export type IntentPromptBuilder = (models: ModelInfo[]) => string;
export type UserPromptBuilder = (content: string, hasImage: boolean) => string;

