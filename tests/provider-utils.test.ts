/**
 * Provider 工具函数测试
 */

import { describe, it, expect } from 'bun:test';
import { isValidImageUrl, isImageUrl, buildUserContent, convertToPlainText } from '../packages/providers/src/utils';
import type { LLMMessage } from '../packages/providers/src/base';

describe('Provider Utils', () => {
  describe('isValidImageUrl', () => {
    it('应接受 https URL', () => {
      expect(isValidImageUrl('https://example.com/image.png')).toBe(true);
    });

    it('应接受 http URL', () => {
      expect(isValidImageUrl('http://example.com/image.jpg')).toBe(true);
    });

    it('应接受 data URI', () => {
      expect(isValidImageUrl('data:image/png;base64,iVBORw0KGgo=')).toBe(true);
    });

    it('应拒绝 file:// 协议', () => {
      expect(isValidImageUrl('file:///etc/passwd')).toBe(false);
    });

    it('应拒绝 ftp:// 协议', () => {
      expect(isValidImageUrl('ftp://example.com/image.png')).toBe(false);
    });

    it('应拒绝 localhost', () => {
      expect(isValidImageUrl('http://localhost/image.png')).toBe(false);
      expect(isValidImageUrl('http://127.0.0.1/image.png')).toBe(false);
    });

    it('应拒绝 AWS 元数据地址', () => {
      expect(isValidImageUrl('http://169.254.169.254/latest/meta-data/')).toBe(false);
    });

    it('应拒绝内网 IP', () => {
      expect(isValidImageUrl('http://10.0.0.1/image.png')).toBe(false);
      expect(isValidImageUrl('http://192.168.1.1/image.png')).toBe(false);
      expect(isValidImageUrl('http://172.16.0.1/image.png')).toBe(false);
    });

    it('应拒绝无效 URL', () => {
      expect(isValidImageUrl('not-a-url')).toBe(false);
    });

    it('应拒绝非图片 data URI', () => {
      expect(isValidImageUrl('data:text/html,<h1>test</h1>')).toBe(false);
    });
  });

  describe('isImageUrl', () => {
    it('应识别图片扩展名', () => {
      expect(isImageUrl('https://example.com/photo.jpg')).toBe(true);
      expect(isImageUrl('https://example.com/photo.png')).toBe(true);
      expect(isImageUrl('https://example.com/photo.gif')).toBe(true);
      expect(isImageUrl('https://example.com/photo.webp')).toBe(true);
    });

    it('应识别 data URI', () => {
      expect(isImageUrl('data:image/png;base64,abc')).toBe(true);
    });

    it('应拒绝非图片文件', () => {
      expect(isImageUrl('https://example.com/doc.pdf')).toBe(false);
      expect(isImageUrl('https://example.com/video.mp4')).toBe(false);
    });

    it('应根据路径判断，忽略查询参数', () => {
      expect(isImageUrl('https://example.com/image.png?size=large&v=1')).toBe(true);
      expect(isImageUrl('https://example.com/doc.pdf?format=png')).toBe(false);
    });
  });

  describe('buildUserContent', () => {
    it('无媒体时返回纯文本', () => {
      const result = buildUserContent('Hello', undefined);
      expect(result).toBe('Hello');
    });

    it('空媒体数组时返回纯文本', () => {
      const result = buildUserContent('Hello', []);
      expect(result).toBe('Hello');
    });

    it('有媒体时返回 ContentPart 数组', () => {
      const result = buildUserContent('Hello', ['https://example.com/image.png']);
      expect(Array.isArray(result)).toBe(true);
      if (Array.isArray(result)) {
        expect(result).toHaveLength(2);
        expect(result[0]).toEqual({ type: 'image_url', image_url: { url: 'https://example.com/image.png', detail: 'auto' } });
        expect(result[1]).toEqual({ type: 'text', text: 'Hello' });
      }
    });

    it('应忽略不安全的图片 URL', () => {
      const result = buildUserContent('Hello', ['http://localhost/image.png']);
      expect(typeof result).toBe('string');
      expect(result).toContain('无效或受限');
    });

    it('应忽略非图片 URL', () => {
      const result = buildUserContent('Hello', ['https://example.com/doc.pdf']);
      expect(result).toBe('Hello');
    });

    it('应限制媒体数量', () => {
      const media = Array(15).fill('https://example.com/image.png');
      const result = buildUserContent('Hello', media);
      if (Array.isArray(result)) {
        const imageParts = result.filter(p => p.type === 'image_url');
        expect(imageParts.length).toBeLessThanOrEqual(10);
      }
    });

    it('应按正确顺序排列（图片在前）', () => {
      const result = buildUserContent('Hello', ['https://example.com/image.png']);
      if (Array.isArray(result)) {
        expect(result[0].type).toBe('image_url');
        expect(result[1].type).toBe('text');
      }
    });
  });

  describe('convertToPlainText', () => {
    it('应保留纯文本消息', () => {
      const messages: LLMMessage[] = [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there' },
      ];
      const result = convertToPlainText(messages);
      expect(result[0].content).toBe('Hello');
      expect(result[1].content).toBe('Hi there');
    });

    it('应转换多模态消息', () => {
      const messages: LLMMessage[] = [
        {
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: 'https://example.com/image.png' } },
            { type: 'text', text: 'Hello' },
          ],
        },
      ];
      const result = convertToPlainText(messages);
      expect(result[0].content).toBe('[图片]\nHello');
    });

    it('应处理多张图片', () => {
      const messages: LLMMessage[] = [
        {
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: 'https://example.com/1.png' } },
            { type: 'image_url', image_url: { url: 'https://example.com/2.png' } },
            { type: 'text', text: 'Compare' },
          ],
        },
      ];
      const result = convertToPlainText(messages);
      expect(result[0].content).toBe('[图片]\n[图片]\nCompare');
    });

    it('应保留其他消息属性', () => {
      const messages: LLMMessage[] = [
        { role: 'assistant', content: 'Hi', toolCalls: [{ id: '1', name: 'test', arguments: {} }] },
      ];
      const result = convertToPlainText(messages);
      expect(result[0].toolCalls).toBeDefined();
    });
  });
});
