/**
 * ReAct 模式测试
 */

import { describe, test, expect } from 'bun:test';
import {
  ReActResponseSchema,
  ReActActionSchema,
  parseReActResponse,
  ToolToReActAction,
  ReActActionToTool,
  type ReActResponse,
  type ReActAction,
} from '@microbot/runtime';

describe('ReAct Types', () => {
  describe('ReActActionSchema', () => {
    test('应接受有效的动作类型', () => {
      const validActions: ReActAction[] = [
        'finish',
        'read_file',
        'write_file',
        'list_dir',
        'shell_exec',
        'web_fetch',
        'send_message',
      ];

      for (const action of validActions) {
        const result = ReActActionSchema.safeParse(action);
        expect(result.success).toBe(true);
      }
    });

    test('应拒绝无效的动作类型', () => {
      const result = ReActActionSchema.safeParse('invalid_action');
      expect(result.success).toBe(false);
    });
  });

  describe('ReActResponseSchema', () => {
    test('应接受有效的 ReAct 响应', () => {
      const response = {
        thought: '用户想读取文件',
        action: 'read_file',
        action_input: '/etc/hosts',
      };

      const result = ReActResponseSchema.safeParse(response);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.thought).toBe('用户想读取文件');
        expect(result.data.action).toBe('read_file');
        expect(result.data.action_input).toBe('/etc/hosts');
      }
    });

    test('应接受对象类型的 action_input', () => {
      const response = {
        thought: '写入文件',
        action: 'write_file',
        action_input: { path: '/tmp/test.txt', content: 'hello' },
      };

      const result = ReActResponseSchema.safeParse(response);
      expect(result.success).toBe(true);
    });

    test('应接受 null 类型的 action_input', () => {
      const response = {
        thought: '任务完成',
        action: 'finish',
        action_input: null,
      };

      const result = ReActResponseSchema.safeParse(response);
      expect(result.success).toBe(true);
    });

    test('应拒绝缺少必需字段的响应', () => {
      const response = {
        thought: '用户想读取文件',
        // 缺少 action
        action_input: '/etc/hosts',
      };

      const result = ReActResponseSchema.safeParse(response);
      expect(result.success).toBe(false);
    });
  });
});

describe('parseReActResponse', () => {
  test('应解析纯 JSON 响应', () => {
    const content = '{"thought": "思考中", "action": "finish", "action_input": "完成"}';
    const result = parseReActResponse(content);

    expect(result).not.toBeNull();
    expect(result?.thought).toBe('思考中');
    expect(result?.action).toBe('finish');
    expect(result?.action_input).toBe('完成');
  });

  test('应解析 markdown 代码块中的 JSON', () => {
    const content = '```json\n{"thought": "思考", "action": "read_file", "action_input": "test.txt"}\n```';
    const result = parseReActResponse(content);

    expect(result).not.toBeNull();
    expect(result?.action).toBe('read_file');
  });

  test('应解析无语言标记的代码块', () => {
    const content = '```\n{"thought": "思考", "action": "finish", "action_input": "done"}\n```';
    const result = parseReActResponse(content);

    expect(result).not.toBeNull();
    expect(result?.action).toBe('finish');
  });

  test('应从文本中提取 JSON', () => {
    const content = '这是一些文字\n{"thought": "思考", "action": "shell_exec", "action_input": "ls"}\n更多文字';
    const result = parseReActResponse(content);

    expect(result).not.toBeNull();
    expect(result?.action).toBe('shell_exec');
  });

  test('无效 JSON 应返回 null', () => {
    const content = '这不是 JSON';
    const result = parseReActResponse(content);

    expect(result).toBeNull();
  });

  test('JSON 格式正确但 schema 不匹配应返回 null', () => {
    const content = '{"foo": "bar"}';
    const result = parseReActResponse(content);

    expect(result).toBeNull();
  });

  test('无效的动作类型应返回 null', () => {
    const content = '{"thought": "思考", "action": "invalid_action", "action_input": "test"}';
    const result = parseReActResponse(content);

    expect(result).toBeNull();
  });

  describe('动作别名映射', () => {
    test('应将 exec 映射到 shell_exec', () => {
      const content = '{"thought": "执行命令", "action": "exec", "action_input": "ls -la"}';
      const result = parseReActResponse(content);

      expect(result).not.toBeNull();
      expect(result?.action).toBe('shell_exec');
      expect(result?.action_input).toBe('ls -la');
    });

    test('应将 run 映射到 shell_exec', () => {
      const content = '{"thought": "运行命令", "action": "run", "action_input": "pwd"}';
      const result = parseReActResponse(content);

      expect(result).not.toBeNull();
      expect(result?.action).toBe('shell_exec');
    });

    test('应将 bash 映射到 shell_exec', () => {
      const content = '{"thought": "bash命令", "action": "bash", "action_input": "echo hello"}';
      const result = parseReActResponse(content);

      expect(result).not.toBeNull();
      expect(result?.action).toBe('shell_exec');
    });

    test('应将 done 映射到 finish', () => {
      const content = '{"thought": "完成了", "action": "done", "action_input": "任务完成"}';
      const result = parseReActResponse(content);

      expect(result).not.toBeNull();
      expect(result?.action).toBe('finish');
    });

    test('应将 answer 映射到 finish', () => {
      const content = '{"thought": "回答用户", "action": "answer", "action_input": "这是答案"}';
      const result = parseReActResponse(content);

      expect(result).not.toBeNull();
      expect(result?.action).toBe('finish');
    });

    test('应将 ls 映射到 list_dir', () => {
      const content = '{"thought": "列出目录", "action": "ls", "action_input": "/home"}';
      const result = parseReActResponse(content);

      expect(result).not.toBeNull();
      expect(result?.action).toBe('list_dir');
    });

    test('应将 cat 映射到 read_file', () => {
      const content = '{"thought": "读取文件", "action": "cat", "action_input": "/etc/hosts"}';
      const result = parseReActResponse(content);

      expect(result).not.toBeNull();
      expect(result?.action).toBe('read_file');
    });

    test('应将 fetch 映射到 web_fetch', () => {
      const content = '{"thought": "获取网页", "action": "fetch", "action_input": "https://example.com"}';
      const result = parseReActResponse(content);

      expect(result).not.toBeNull();
      expect(result?.action).toBe('web_fetch');
    });

    test('动作名称应不区分大小写', () => {
      const content = '{"thought": "执行", "action": "EXEC", "action_input": "test"}';
      const result = parseReActResponse(content);

      expect(result).not.toBeNull();
      expect(result?.action).toBe('shell_exec');
    });
  });
});

describe('Tool Mappings', () => {
  test('ToolToReActAction 应正确映射工具名称', () => {
    expect(ToolToReActAction['read_file']).toBe('read_file');
    expect(ToolToReActAction['write_file']).toBe('write_file');
    expect(ToolToReActAction['shell_exec']).toBe('shell_exec');
  });

  test('ReActActionToTool 应正确映射动作到工具', () => {
    expect(ReActActionToTool['finish']).toBeNull();
    expect(ReActActionToTool['read_file']).toBe('read_file');
    expect(ReActActionToTool['shell_exec']).toBe('shell_exec');
  });

  test('映射应该双向一致', () => {
    const toolNames = Object.keys(ToolToReActAction) as ReActAction[];
    for (const name of toolNames) {
      const action = ToolToReActAction[name];
      if (action && ReActActionToTool[action]) {
        expect(ReActActionToTool[action]).toBe(name);
      }
    }
  });
});
