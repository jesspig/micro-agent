/**
 * 插件系统模块入口
 */

// Types - 从 @micro-agent/types 重导出
export type {
  ExtensionType,
  ExtensionDescriptor,
  ExtensionContext,
  Extension,
  LoadedExtension,
  ExtensionDiscoveryResult,
  ExtensionChangeEvent,
} from '@micro-agent/types';

export {
  EXTENSION_TYPES,
  EXTENSION_TYPE_LABELS,
  getExtensionTypeDir,
  isValidExtensionType,
} from '@micro-agent/types';

// Registry
export { ExtensionRegistry, createExtensionRegistry } from './registry';
export type { RegistryConfig } from './registry';

// Discovery
export { ExtensionDiscovery, createExtensionDiscovery } from './discovery';

// Loader
export { ExtensionLoader, createExtensionLoader } from './loader';
export type { LoaderConfig, LoaderState } from './loader';

// Hot Reload
export { HotReloadManager, createHotReloadManager } from './hot-reload';
export type { HotReloadConfig } from './hot-reload';
