import { describe, it, expect, beforeEach } from 'bun:test';
import { WebFetchTool, WebSearchTool } from '../../extensions/tool';
import { ToolRegistry } from '../../src/core/tool';
import type { ToolContext } from '../../src/core/tool';

const defaultCtx: ToolContext = {
  channel: 'test',
  chatId: '123',
  workspace: process.cwd(),
  sendToBus: async () => {},
};

describe('Web Tools', () => {
  let registry: ToolRegistry;

  beforeEach(() => {
    registry = new ToolRegistry();
    registry.register(new WebFetchTool());
    registry.register(new WebSearchTool());  // 无 API Key
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

  describe('WebSearchTool', () => {
    it('should return error when no API key configured', async () => {
      const result = await registry.execute('web_search', { 
        query: 'test' 
      }, defaultCtx);
      
      expect(result).toContain('未配置 Brave API Key');
    });
  });
});
