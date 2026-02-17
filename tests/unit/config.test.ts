import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { loadConfig, expandPath, findTemplateFile } from '../../src/config/loader';

const TEST_DIR = join(import.meta.dir, '__config_test__');

describe('Config Loader', () => {
  beforeEach(() => {
    if (!existsSync(TEST_DIR)) {
      mkdirSync(TEST_DIR, { recursive: true });
    }
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  describe('loadConfig', () => {
    it('should return default config when no file exists', () => {
      const config = loadConfig({ configPath: '/nonexistent/path.yaml' });
      expect(config.agents.defaults.model).toBe('ollama/qwen3');
      expect(config.agents.defaults.maxTokens).toBe(8192);
    });

    it('should load config from yaml file', () => {
      const configPath = join(TEST_DIR, 'config.yaml');
      writeFileSync(configPath, `
agents:
  defaults:
    model: custom-model
    maxTokens: 4096
`);

      const config = loadConfig({ configPath });
      expect(config.agents.defaults.model).toBe('custom-model');
      expect(config.agents.defaults.maxTokens).toBe(4096);
    });

    it('should resolve environment variables', () => {
      process.env.TEST_API_KEY = 'secret-key';
      const configPath = join(TEST_DIR, 'config.yaml');
      // 使用反引号模板字符串避免转义问题
      writeFileSync(configPath, `agents:
  defaults:
    model: test
providers:
  openaiCompatible:
    baseUrl: https://api.example.com/v1
    apiKey: \${TEST_API_KEY}
`);

      const config = loadConfig({ configPath });
      expect(config.providers.openaiCompatible?.apiKey).toBe('secret-key');

      delete process.env.TEST_API_KEY;
    });

    it('should merge directory configs upward', () => {
      // 创建目录结构: workspace/A/B/C
      const workspace = join(TEST_DIR, 'workspace');
      const dirA = join(workspace, 'A');
      const dirB = join(dirA, 'B');
      const dirC = join(dirB, 'C');
      
      mkdirSync(join(dirA, '.microbot'), { recursive: true });
      mkdirSync(join(dirB, '.microbot'), { recursive: true });
      
      // A 的配置
      writeFileSync(join(dirA, '.microbot', 'settings.yaml'), `
agents:
  defaults:
    model: model-A
    maxTokens: 2000
`);
      
      // B 的配置（会覆盖 A 的部分配置）
      writeFileSync(join(dirB, '.microbot', 'settings.yaml'), `
agents:
  defaults:
    model: model-B
`);

      // 在 C 目录执行任务，应该合并 A 和 B 的配置
      const config = loadConfig({ workspace, currentDir: dirC });
      
      // B 的 model 覆盖 A 的
      expect(config.agents.defaults.model).toBe('model-B');
      // A 的 maxTokens 被 B 继承（B 没有设置）
      expect(config.agents.defaults.maxTokens).toBe(2000);
    });
  });

  describe('expandPath', () => {
    it('should expand ~ to home directory', () => {
      const path = expandPath('~/test');
      expect(path).not.toContain('~');
      expect(path).toContain('test');
    });

    it('should resolve relative path', () => {
      const path = expandPath('relative/path');
      expect(path).toContain('relative');
      expect(path).toContain('path');
    });
  });

  describe('findTemplateFile', () => {
    it('should find template upward in directory hierarchy', () => {
      // 创建目录结构: workspace/A/B/C
      const workspace = join(TEST_DIR, 'workspace');
      const dirA = join(workspace, 'A');
      const dirB = join(dirA, 'B');
      const dirC = join(dirB, 'C');
      
      // 确保所有目录都存在
      mkdirSync(dirC, { recursive: true });
      
      // 只在 A 目录创建 SOUL.md
      const soulPath = join(dirA, 'SOUL.md');
      writeFileSync(soulPath, '# Soul from A');

      // 在 C 目录查找，应该找到 A 的 SOUL.md
      const found = findTemplateFile('SOUL.md', workspace, dirC);
      expect(found).toBe(soulPath);
    });
  });
});
