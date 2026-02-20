import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { mkdirSync, rmSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { ReadFileTool, WriteFileTool, ListDirTool } from '../../extensions/tool';
import { ToolRegistry } from '@microbot/core/tools';
import type { ToolContext } from '@microbot/core/tools';

const testDir = join(process.cwd(), 'test-fs-workspace');

const defaultCtx: ToolContext = {
  channel: 'test',
  chatId: '123',
  workspace: testDir,
  sendToBus: async () => {},
};

describe('Filesystem Tools', () => {
  let registry: ToolRegistry;

  beforeEach(() => {
    // 创建测试目录
    if (!existsSync(testDir)) {
      mkdirSync(testDir, { recursive: true });
    }
    
    registry = new ToolRegistry();
    registry.register(new ReadFileTool());
    registry.register(new WriteFileTool());
    registry.register(new ListDirTool());
  });

  afterEach(() => {
    // 清理测试目录
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('ReadFileTool', () => {
    it('should read file content', async () => {
      const filePath = join(testDir, 'test.txt');
      writeFileSync(filePath, 'Hello, World!', 'utf-8');
      
      const result = await registry.execute('read_file', { path: 'test.txt' }, defaultCtx);
      expect(result).toBe('Hello, World!');
    });

    it('should return error for non-existent file', async () => {
      const result = await registry.execute('read_file', { path: 'nonexistent.txt' }, defaultCtx);
      expect(result).toContain('错误');
      expect(result).toContain('不存在');
    });

    it('should limit lines', async () => {
      const filePath = join(testDir, 'lines.txt');
      writeFileSync(filePath, 'Line 1\nLine 2\nLine 3\nLine 4', 'utf-8');
      
      const result = await registry.execute('read_file', { path: 'lines.txt', limit: 2 }, defaultCtx);
      expect(result).toBe('Line 1\nLine 2');
    });
  });

  describe('WriteFileTool', () => {
    it('should write file content', async () => {
      const result = await registry.execute('write_file', { 
        path: 'output.txt', 
        content: 'Test content' 
      }, defaultCtx);
      
      expect(result).toContain('已写入');
      
      // 验证文件内容
      const filePath = join(testDir, 'output.txt');
      const content = require('fs').readFileSync(filePath, 'utf-8');
      expect(content).toBe('Test content');
    });
  });

  describe('ListDirTool', () => {
    it('should list directory contents', async () => {
      // 创建测试文件和目录
      mkdirSync(join(testDir, 'subdir'), { recursive: true });
      writeFileSync(join(testDir, 'file1.txt'), 'content', 'utf-8');
      writeFileSync(join(testDir, 'file2.txt'), 'content', 'utf-8');
      
      const result = await registry.execute('list_dir', { path: '.' }, defaultCtx);
      expect(result).toContain('DIR');
      expect(result).toContain('subdir');
      expect(result).toContain('FILE');
      expect(result).toContain('file1.txt');
    });

    it('should return error for non-existent directory', async () => {
      const result = await registry.execute('list_dir', { path: 'nonexistent' }, defaultCtx);
      expect(result).toContain('错误');
      expect(result).toContain('不存在');
    });
  });
});
