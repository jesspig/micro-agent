import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { loadConfig, expandPath } from '../../src/config/loader';

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
      const config = loadConfig('/nonexistent/path.yaml');
      expect(config.agents.defaults.model).toBe('qwen3');
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

      const config = loadConfig(configPath);
      expect(config.agents.defaults.model).toBe('custom-model');
      expect(config.agents.defaults.maxTokens).toBe(4096);
    });

    it('should resolve environment variables', () => {
      process.env.TEST_API_KEY = 'secret-key';
      const configPath = join(TEST_DIR, 'config.yaml');
      writeFileSync(configPath, `
agents:
  defaults:
    model: test
providers:
  openaiCompatible:
    baseUrl: https://api.example.com/v1
    apiKey: \${TEST_API_KEY}
`);

      const config = loadConfig(configPath);
      expect(config.providers.openaiCompatible?.apiKey).toBe('secret-key');

      delete process.env.TEST_API_KEY;
    });
  });

  describe('expandPath', () => {
    it('should expand ~ to home directory', () => {
      const path = expandPath('~/test');
      expect(path).not.toContain('~');
      expect(path).toContain('test');
    });

    it('should keep absolute path unchanged', () => {
      const path = expandPath('C:\\absolute\\path');
      expect(path).toBe('C:\\absolute\\path');
    });
  });
});
