/**
 * 任务类型识别类型定义
 */

/** 任务类型 */
export type TaskType = 'vision' | 'coder' | 'chat';

/** 模型信息（用于提示词） */
export interface ModelInfo {
  id: string;
}

/** 任务类型识别结果 */
export interface TaskTypeResult {
  type: TaskType;
  reason: string;
}

/** 提示词构建函数类型 */
export type IntentPromptBuilder = (models: ModelInfo[]) => string;
export type UserPromptBuilder = (content: string, hasImage: boolean) => string;

