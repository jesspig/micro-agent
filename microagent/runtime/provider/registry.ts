import type { IProvider } from "../contracts.js";
import type { ProviderSpec } from "../types.js";
import { RegistryError } from "../errors.js";
import { providerLogger, createTimer, logMethodCall, logMethodReturn, logMethodError } from "../../applications/shared/logger.js";

const logger = providerLogger();

/**
 * 内置 Provider 规格
 * 定义常见 LLM 提供商的默认配置
 */
const BUILTIN_PROVIDERS: ProviderSpec[] = [
  {
    name: "openai",
    keywords: ["gpt", "o1", "o3"],
    envKey: "OPENAI_API_KEY",
  },
  {
    name: "anthropic",
    keywords: ["claude"],
    envKey: "ANTHROPIC_API_KEY",
    supportsPromptCaching: true,
  },
  {
    name: "openrouter",
    keywords: ["openrouter"],
    envKey: "OPENROUTER_API_KEY",
    isGateway: true,
  },
  {
    name: "google",
    keywords: ["gemini"],
    envKey: "GOOGLE_API_KEY",
  },
  {
    name: "deepseek",
    keywords: ["deepseek"],
    envKey: "DEEPSEEK_API_KEY",
  },
  {
    name: "moonshot",
    keywords: ["moonshot", "kimi"],
    envKey: "MOONSHOT_API_KEY",
  },
];

/**
 * Provider 注册表
 * 管理 Provider 实例的注册、查询和列表
 */
export class ProviderRegistry {
  private providers = new Map<string, IProvider>();

  /**
   * 注册 Provider
   * @param provider Provider 实例
   * @throws RegistryError 如果 Provider 已存在
   */
  register(provider: IProvider): void {
    const timer = createTimer();
    logMethodCall(logger, { method: "register", module: "ProviderRegistry", params: { name: provider.name } });

    if (this.providers.has(provider.name)) {
      const error = new RegistryError(
        `Provider "${provider.name}" 已存在`,
        "Provider",
        provider.name
      );
      logMethodError(logger, {
        method: "register",
        module: "ProviderRegistry",
        error: { name: error.name, message: error.message, stack: error.stack },
        params: { name: provider.name },
        duration: timer()
      });
      throw error;
    }

    this.providers.set(provider.name, provider);
    logger.info("Provider 注册成功", { name: provider.name, total: this.providers.size });

    logMethodReturn(logger, {
      method: "register",
      module: "ProviderRegistry",
      result: { name: provider.name },
      duration: timer()
    });
  }

  /**
   * 获取 Provider
   * @param name Provider 名称
   * @returns Provider 实例或 undefined
   */
  get(name: string): IProvider | undefined {
    const timer = createTimer();
    logMethodCall(logger, { method: "get", module: "ProviderRegistry", params: { name } });

    const provider = this.providers.get(name);

    logMethodReturn(logger, {
      method: "get",
      module: "ProviderRegistry",
      result: provider ? { name: provider.name, found: true } : { name, found: false },
      duration: timer()
    });

    return provider;
  }

  /**
   * 获取所有 Provider
   * @returns Provider 列表
   */
  list(): IProvider[] {
    const timer = createTimer();
    logMethodCall(logger, { method: "list", module: "ProviderRegistry" });

    const providers = Array.from(this.providers.values());

    logMethodReturn(logger, {
      method: "list",
      module: "ProviderRegistry",
      result: { count: providers.length, names: providers.map(p => p.name) },
      duration: timer()
    });

    return providers;
  }

  /**
   * 检查 Provider 是否存在
   * @param name Provider 名称
   * @returns 是否存在
   */
  has(name: string): boolean {
    const timer = createTimer();
    logMethodCall(logger, { method: "has", module: "ProviderRegistry", params: { name } });

    const exists = this.providers.has(name);

    logMethodReturn(logger, {
      method: "has",
      module: "ProviderRegistry",
      result: { name, exists },
      duration: timer()
    });

    return exists;
  }

  /**
   * 移除 Provider
   * @param name Provider 名称
   * @returns 是否成功移除
   */
  delete(name: string): boolean {
    const timer = createTimer();
    logMethodCall(logger, { method: "delete", module: "ProviderRegistry", params: { name } });

    const removed = this.providers.delete(name);

    if (removed) {
      logger.info("Provider 移除成功", { name, remaining: this.providers.size });
    }

    logMethodReturn(logger, {
      method: "delete",
      module: "ProviderRegistry",
      result: { name, removed },
      duration: timer()
    });

    return removed;
  }

  /**
   * 根据模型名查找匹配的 Provider 规格
   * @param model 模型名称
   * @returns 匹配的 Provider 规格或 undefined
   */
  static findByModel(model: string): ProviderSpec | undefined {
    const timer = createTimer();
    logMethodCall(logger, { method: "findByModel", module: "ProviderRegistry", params: { model } });

    const lowerModel = model.toLowerCase();
    const spec = BUILTIN_PROVIDERS.find(
      (p) => !p.isGateway && p.keywords?.some((k) => lowerModel.includes(k))
    );

    logMethodReturn(logger, {
      method: "findByModel",
      module: "ProviderRegistry",
      result: spec ? { name: spec.name, keywords: spec.keywords } : undefined,
      duration: timer()
    });

    return spec;
  }

  /**
   * 获取所有内置 Provider 规格
   * @returns Provider 规格列表
   */
  static getBuiltinProviders(): ProviderSpec[] {
    const timer = createTimer();
    logMethodCall(logger, { method: "getBuiltinProviders", module: "ProviderRegistry" });

    const providers = [...BUILTIN_PROVIDERS];

    logMethodReturn(logger, {
      method: "getBuiltinProviders",
      module: "ProviderRegistry",
      result: { count: providers.length, names: providers.map(p => p.name) },
      duration: timer()
    });

    return providers;
  }
}