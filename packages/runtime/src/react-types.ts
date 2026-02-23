/**
 * ReAct 类型定义和解析器
 */

import { z, ZodError } from 'zod';

/**
 * 预定义的 ReAct 动作类型
 */
export const PredefinedActions = [
  'finish',
  'read_file',
  'write_file',
  'list_dir',
  'shell_exec',
  'web_fetch',
  'send_message',
] as const;

/**
 * 预定义动作类型（用于类型安全）
 */
export type PredefinedAction = typeof PredefinedActions[number];

/**
 * ReAct 动作类型（支持动态工具名称）
 */
export type ReActAction = string;

/**
 * ReAct 响应 Schema
 * action 支持任意字符串，允许动态工具调用
 */
export const ReActResponseSchema = z.object({
  /** 思考过程 */
  thought: z.string().describe('分析当前情况，思考下一步该做什么'),
  /** 动作类型（支持动态工具名称） */
  action: z.string().min(1).describe('要执行的动作或工具名称'),
  /** 动作参数 */
  action_input: z.union([
    z.string(),
    z.object({}).passthrough(),
    z.null(),
  ]).describe('动作的输入参数'),
});

/**
 * ReAct 响应类型
 */
export type ReActResponse = z.infer<typeof ReActResponseSchema>;

/**
 * 动作别名映射
 * LLM 可能返回变体名称，统一映射到标准动作
 */
const ActionAliases: Record<string, string> = {
  // finish 别名
  'finish': 'finish',
  'done': 'finish',
  'complete': 'finish',
  'answer': 'finish',
  'reply': 'finish',
  // shell_exec 别名
  'shell_exec': 'shell_exec',
  'shell': 'shell_exec',
  'exec': 'shell_exec',
  'execute': 'shell_exec',
  'run': 'shell_exec',
  'command': 'shell_exec',
  'bash': 'shell_exec',
  // read_file 别名
  'read_file': 'read_file',
  'read': 'read_file',
  'cat': 'read_file',
  'file_read': 'read_file',
  // write_file 别名
  'write_file': 'write_file',
  'write': 'write_file',
  'save': 'write_file',
  'file_write': 'write_file',
  // list_dir 别名
  'list_dir': 'list_dir',
  'ls': 'list_dir',
  'dir': 'list_dir',
  'list': 'list_dir',
  'list_directory': 'list_dir',
  // web_fetch 别名
  'web_fetch': 'web_fetch',
  'fetch': 'web_fetch',
  'http': 'web_fetch',
  'get': 'web_fetch',
  'curl': 'web_fetch',
  // send_message 别名
  'send_message': 'send_message',
  'message': 'send_message',
  'send': 'send_message',
  'say': 'send_message',
};

/**
 * 解析 LLM 响应为 ReAct 格式
 * 
 * 支持预定义动作和动态工具名称
 */
const MAX_RESPONSE_LENGTH = 10000; // 最大响应长度，超过则拒绝处理

export function parseReActResponse(content: string): ReActResponse | null {
  // 检查响应长度，防止 LLM 输出异常（大量重复文本）
  if (content.length > MAX_RESPONSE_LENGTH) {
    logDebug('响应过长，跳过解析', { length: content.length, preview: content.slice(0, 200) });
    return null;
  }

  // 尝试提取 JSON（可能被 markdown 代码块包裹）
  let jsonStr: string | null = null;

  // 尝试提取 ```json ... ``` 中的内容
  const jsonBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonBlockMatch) {
    jsonStr = jsonBlockMatch[1].trim();
  } else {
    // 尝试直接匹配 JSON 对象
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      jsonStr = jsonMatch[0];
    }
  }

  if (!jsonStr) return null;

  try {
    const parsed = JSON.parse(jsonStr);
    
    // 验证必需字段存在
    if (typeof parsed.thought !== 'string') {
      logDebug('缺少 thought 字段', parsed);
      return null;
    }
    if (parsed.action === undefined || parsed.action === null) {
      logDebug('缺少 action 字段', parsed);
      return null;
    }
    
    // 处理 action 字段异常格式
    let normalizedAction: string;
    const originalAction = parsed.action;
    
    // 如果 action 是对象（如 {"type": "read_file", "path": {...}}），提取 type
    if (typeof originalAction === 'object' && originalAction !== null && 'type' in originalAction) {
      normalizedAction = String((originalAction as Record<string, unknown>).type).toLowerCase().trim();
    } else if (typeof originalAction === 'string') {
      const actionStr = originalAction.toLowerCase().trim();
      // 如果是空字符串，尝试从 thought 推断
      if (!actionStr) {
        logDebug('action 为空，尝试从 thought 推断', parsed);
        // 简单推断：如果 thought 包含关键词
        const thought = (parsed.thought || '').toLowerCase();
        if (thought.includes('read') || thought.includes('读取')) {
          normalizedAction = 'read_file';
        } else if (thought.includes('write') || thought.includes('写入') || thought.includes('创建')) {
          normalizedAction = 'write_file';
        } else if (thought.includes('shell') || thought.includes('命令') || thought.includes('执行')) {
          normalizedAction = 'shell_exec';
        } else if (thought.includes('finish') || thought.includes('完成') || thought.includes('回复')) {
          normalizedAction = 'finish';
        } else {
          logDebug('无法推断 action', parsed);
          return null;
        }
      } else {
        normalizedAction = actionStr;
      }
    } else {
      logDebug('action 字段类型异常', typeof originalAction);
      return null;
    }
    
    // 映射到标准动作
    const finalAction = ActionAliases[normalizedAction] ?? normalizedAction;
    
    // 处理 action_input 异常格式
    let normalizedInput: string | Record<string, unknown> | null = parsed.action_input ?? null;
    
    // 如果 action_input 是对象且包含 value 字段（如 {value: "路径"}），提取 value
    if (typeof normalizedInput === 'object' && normalizedInput !== null && 'value' in normalizedInput) {
      normalizedInput = (normalizedInput as Record<string, unknown>).value as string;
    }
    
    const normalized = {
      thought: parsed.thought,
      action: finalAction,
      action_input: normalizedInput,
    };
    
    const result = ReActResponseSchema.safeParse(normalized);
    if (result.success) {
      return result.data;
    }
    logDebug('ReAct 解析失败', result.error);
  } catch (e) {
    logDebug('JSON 解析失败', e);
  }

  return null;
}

/**
 * 调试日志（仅在开发环境输出）
 */
function logDebug(message: string, data: unknown): void {
  if (process.env.NODE_ENV === 'development') {
    console.debug(`[ReAct] ${message}`, data);
  }
}

/**
 * 工具名称到 ReAct 动作的映射
 */
export const ToolToReActAction: Record<string, string> = {
  'read_file': 'read_file',
  'write_file': 'write_file',
  'list_dir': 'list_dir',
  'exec': 'shell_exec',
  'web_fetch': 'web_fetch',
  'message': 'send_message',
};

/**
 * ReAct 动作到工具名称的映射
 * 仅用于预定义动作，动态工具直接使用 action 名称
 */
export const ReActActionToTool: Record<string, string | null> = {
  'finish': null,
  'read_file': 'read_file',
  'write_file': 'write_file',
  'list_dir': 'list_dir',
  'shell_exec': 'exec',
  'web_fetch': 'web_fetch',
  'send_message': 'message',
};
