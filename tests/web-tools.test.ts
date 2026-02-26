import { describe, it, expect, beforeEach } from 'bun:test';
import { WebFetchTool } from '../extensions/tool';
import { ToolRegistry } from '@micro-agent/sdk';
import type { ToolContext } from '@micro-agent/types';

const defaultCtx: ToolContext = {
  channel: 'test',
  chatId: '123',
  workspace: process.cwd(),
  currentDir: process.cwd(),
  sendToBus: async () => {},
};

describe('Web Tools', () => {
  let registry: ToolRegistry;

  beforeEach(() => {
    registry = new ToolRegistry();
    registry.register(WebFetchTool);
  });

  describe('WebFetchTool', () => {
    it('should fetch webpage content', async () => {
      const result = await registry.execute('web_fetch', { 
        url: 'https://qq.com' 
      }, defaultCtx);
      
      expect(result.length).toBeGreaterThan(0);
      expect(result).not.toContain('获取失败');
    });

    it('should handle invalid URL', async () => {
      const result = await registry.execute('web_fetch', { 
        url: 'not-a-valid-url' 
      }, defaultCtx);
      
      expect(result).toContain('获取失败');
    });
  });
});