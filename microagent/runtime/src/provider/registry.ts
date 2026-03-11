import type { IProvider } from "../contracts.js";
import type { ProviderSpec } from "../types.js";
import { RegistryError } from "../errors.js";

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
    if (this.providers.has(provider.name)) {
      throw new RegistryError(
        `Provider "${provider.name}" 已存在`,
        "Provider",
        provider.name
      );
    }
    this.providers.set(provider.name, provider);
  }

  /**
   * 获取 Provider
   * @param name Provider 名称
   * @returns Provider 实例或 undefined
   */
  get(name: string): IProvider | undefined {
    return this.providers.get(name);
  }

  /**
   * 获取所有 Provider
   * @returns Provider 列表
   */
  list(): IProvider[] {
    return Array.from(this.providers.values());
  }

  /**
   * 检查 Provider 是否存在
   * @param name Provider 名称
   * @returns 是否存在
   */
  has(name: string): boolean {
    return this.providers.has(name);
  }

  /**
   * 移除 Provider
   * @param name Provider 名称
   * @returns 是否成功移除
   */
  delete(name: string): boolean {
    return this.providers.delete(name);
  }

  /**
   * 根据模型名查找匹配的 Provider 规格
   * @param model 模型名称
   * @returns 匹配的 Provider 规格或 undefined
   */
  static findByModel(model: string): ProviderSpec | undefined {
    const lowerModel = model.toLowerCase();
    return BUILTIN_PROVIDERS.find(
      (p) => !p.isGateway && p.keywords?.some((k) => lowerModel.includes(k))
    );
  }

  /**
   * 获取所有内置 Provider 规格
   * @returns Provider 规格列表
   */
  static getBuiltinProviders(): ProviderSpec[] {
    return [...BUILTIN_PROVIDERS];
  }
}
