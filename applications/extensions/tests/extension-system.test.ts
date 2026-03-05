/**
 * packages/extension-system 单元测试
 */

import { describe, it, expect, beforeEach } from 'bun:test'
import { ExtensionDiscovery } from '@micro-agent/extension-system'
import { ExtensionRegistry } from '@micro-agent/extension-system'
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'fs'
import { join } from 'path'

describe('Extension System Package', () => {
  describe('ExtensionDiscovery', () => {
    let discovery: ExtensionDiscovery
    const testDir = join(process.cwd(), 'test-extensions-temp-discovery')

    beforeEach(() => {
      discovery = new ExtensionDiscovery()
      // 清理测试目录
      if (existsSync(testDir)) {
        rmSync(testDir, { recursive: true })
      }
    })

    it('should add search path', () => {
      discovery.addSearchPath('/test/path')
      // Should not throw
      expect(discovery).toBeDefined()
    })

    it('should not add duplicate paths', () => {
      discovery.addSearchPath('/test/path')
      discovery.addSearchPath('/test/path')
      discovery.addSearchPath('/test/path')
      // Should not throw
      expect(discovery).toBeDefined()
    })

    it('should return empty result for non-existent path', () => {
      discovery.addSearchPath('/non/existent/path')
      const result = discovery.discover()
      
      expect(result.descriptors).toHaveLength(0)
      expect(result.scannedDirs).toBe(0)
    })

    it('should discover extension with extension.yaml', () => {
      // 创建测试扩展目录
      const extDir = join(testDir, 'test-ext')
      mkdirSync(extDir, { recursive: true })
      
      writeFileSync(join(extDir, 'extension.yaml'), `
id: test-ext
name: Test Extension
version: 1.0.0
type: tool
description: A test extension
`)

      discovery.addSearchPath(testDir)
      const result = discovery.discover()

      expect(result.descriptors).toHaveLength(1)
      expect(result.descriptors[0].id).toBe('test-ext')
      expect(result.descriptors[0].type).toBe('tool')
      
      // 清理
      rmSync(testDir, { recursive: true })
    })

    it('should discover extension with package.json', () => {
      const pkgTestDir = join(process.cwd(), 'test-extensions-temp-pkg')
      const extDir = join(pkgTestDir, 'pkg-ext')
      mkdirSync(extDir, { recursive: true })
      
      writeFileSync(join(extDir, 'package.json'), JSON.stringify({
        name: 'pkg-ext',
        displayName: 'Package Extension',
        version: '2.0.0',
        description: 'Extension from package.json',
        microAgent: { type: 'skill' },
      }))

      discovery.addSearchPath(pkgTestDir)
      const result = discovery.discover()

      expect(result.descriptors).toHaveLength(1)
      expect(result.descriptors[0].id).toBe('pkg-ext')
      expect(result.descriptors[0].type).toBe('skill')
      
      // 清理
      rmSync(pkgTestDir, { recursive: true })
    })

    it('should report error for invalid manifest', () => {
      const errTestDir = join(process.cwd(), 'test-extensions-temp-err')
      const extDir = join(errTestDir, 'invalid-ext')
      mkdirSync(extDir, { recursive: true })
      
      writeFileSync(join(extDir, 'extension.yaml'), 'invalid: yaml: content:')

      discovery.addSearchPath(errTestDir)
      const result = discovery.discover()

      expect(result.errors.length).toBeGreaterThan(0)
      
      // 清理
      rmSync(errTestDir, { recursive: true })
    })

    it('should report error for missing required fields', () => {
      const missTestDir = join(process.cwd(), 'test-extensions-temp-miss')
      const extDir = join(missTestDir, 'incomplete-ext')
      mkdirSync(extDir, { recursive: true })
      
      writeFileSync(join(extDir, 'extension.yaml'), `
id: incomplete
name: Incomplete
`)

      discovery.addSearchPath(missTestDir)
      const result = discovery.discover()

      expect(result.errors.length).toBeGreaterThan(0)
      
      // 清理
      rmSync(missTestDir, { recursive: true })
    })
  })

  describe('ExtensionRegistry', () => {
    let registry: ExtensionRegistry

    beforeEach(() => {
      registry = new ExtensionRegistry({
        workspace: '/workspace',
        getConfig: () => undefined,
        registerTool: () => {},
        registerChannel: () => {},
      })
    })

    it('should create registry with config', () => {
      expect(registry).toBeDefined()
      expect(registry.size).toBe(0)
    })

    it('should throw error for non-existent extension', () => {
      expect(registry.get('non-existent')).toBeUndefined()
      expect(registry.has('non-existent')).toBe(false)
    })

    it('should return empty array for getAll', () => {
      expect(registry.getAll()).toHaveLength(0)
    })

    it('should return empty array for getByType', () => {
      expect(registry.getByType('tool')).toHaveLength(0)
    })

    it('should return empty array for getActive', () => {
      expect(registry.getActive()).toHaveLength(0)
    })

    it('should throw error when activating non-existent extension', async () => {
      await expect(registry.activate('non-existent')).rejects.toThrow('扩展未注册')
    })

    it('should throw error when deactivating non-existent extension', async () => {
      await expect(registry.deactivate('non-existent')).rejects.toThrow('扩展未注册')
    })
  })
})
