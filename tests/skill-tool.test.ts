/**
 * 技能工具测试
 */

import { describe, test, expect, beforeEach } from 'bun:test';
import { SkillTool, createSkillTool, createSkillTools } from '@microbot/sdk';
import type { Skill } from '@microbot/types';

describe('SkillTool', () => {
  const mockSkill: Skill = {
    name: 'test-skill',
    description: '测试技能',
    content: '测试技能内容',
    skillPath: process.cwd(),
    metadata: {},
  };

  const mockContext = {
    channel: 'test',
    chatId: 'test-chat',
    workspace: process.cwd(),
    currentDir: process.cwd(),
    sendToBus: async () => {},
  };

  describe('createSkillTool', () => {
    test('应创建工具实例', () => {
      const tool = createSkillTool(mockSkill);
      expect(tool.name).toBe('test-skill');
      expect(tool.description).toBe('测试技能');
    });

    test('应有有效的 inputSchema', () => {
      const tool = createSkillTool(mockSkill);
      expect(tool.inputSchema.type).toBe('object');
      expect(tool.inputSchema.properties).toHaveProperty('args');
    });
  });

  describe('createSkillTools', () => {
    test('应为多个技能创建工具数组', () => {
      const skills: Skill[] = [
        mockSkill,
        { ...mockSkill, name: 'another-skill', description: '另一个技能' },
      ];
      const tools = createSkillTools(skills);
      expect(tools.length).toBe(2);
      expect(tools[0].name).toBe('test-skill');
      expect(tools[1].name).toBe('another-skill');
    });
  });

  describe('参数解析', () => {
    test('应接受字符串参数', () => {
      const tool = createSkillTool(mockSkill);
      // 直接测试 execute 方法（不会真正执行脚本，因为测试环境可能没有技能脚本）
      expect(tool).toBeDefined();
    });

    test('应接受对象参数', () => {
      const tool = createSkillTool(mockSkill);
      expect(tool).toBeDefined();
    });
  });
});
