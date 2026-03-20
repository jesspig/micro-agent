/**
 * 上下文构建器
 *
 * 负责将 Session、Memory、Skill 等信息整合为 LLM 可用的消息上下文
 *
 * 分层架构：
 * 1. 系统提示词（角色定义、约束、平台策略）
 * 2. 记忆上下文（MEMORY.md）
 * 3. 技能摘要（XML 格式，支持按需加载）
 * 4. 对话历史
 * 5. 运行时上下文（注入用户消息，提高缓存命中率）
 */

import type { Message } from "../types.js";
import type { Session } from "./manager.js";
import type { IMemoryExtended } from "../memory/contract.js";
import type { ISkillExtended } from "../skill/contract.js";
import {
  sessionLogger,
  createTimer,
  sanitize,
  logMethodCall,
  logMethodReturn,
  logMethodError,
} from "../../applications/shared/logger.js";

const logger = sessionLogger();

// ============================================================================
// 类型定义
// ============================================================================

/** 模块名称 */
const MODULE_NAME = "ContextBuilder";

/**
 * 上下文构建选项
 */
export interface ContextBuildOptions {
  /** 是否包含记忆上下文 */
  includeMemory?: boolean;
  /** 是否包含技能摘要 */
  includeSkills?: boolean;
  /** 最大历史消息数 */
  maxMessages?: number;
  /** 系统提示词 */
  systemPrompt?: string;
  /** 运行时上下文（注入最后一条用户消息） */
  runtimeContext?: string;
}

/**
 * Skill 摘要项
 */
export interface SkillSummaryItem {
  /** 技能名称 */
  name: string;
  /** 技能描述 */
  description: string;
  /** 技能路径（用于按需加载） */
  location: string;
  /** 是否可用 */
  available: boolean;
  /** 依赖项（可选） */
  requires?: string | undefined;
}

// ============================================================================
// 上下文构建器
// ============================================================================

/**
 * 上下文构建器
 *
 * 整合多种信息源，构建发送给 LLM 的消息列表
 */
export class ContextBuilder {
  constructor(
    private memory?: IMemoryExtended,
    private skills?: ISkillExtended[],
  ) {
    const timer = createTimer();
    const module = MODULE_NAME;
    const method = "constructor";
    logMethodCall(logger, {
      method,
      module,
      params: {
        hasMemory: memory !== undefined,
        skillsCount: skills?.length ?? 0,
      },
    });

    logger.info("上下文构建器已初始化", {
      hasMemory: memory !== undefined,
      skillsCount: skills?.length ?? 0,
    });

    logMethodReturn(logger, {
      method,
      module,
      result: sanitize({
        hasMemory: memory !== undefined,
        skillsCount: skills?.length ?? 0,
      }),
      duration: timer(),
    });
  }

  /**
   * 构建消息上下文
   * @param session - Session 实例
   * @param options - 构建选项
   * @returns 构建后的消息列表
   */
  async build(
    session: Session,
    options: ContextBuildOptions = {},
  ): Promise<Message[]> {
    const timer = createTimer();
    const module = MODULE_NAME;
    const method = "build";
    const systemPromptLength = options.systemPrompt?.length ?? 0;
    logMethodCall(logger, {
      method,
      module,
      params: {
        sessionKey: session.key,
        includeMemory: options.includeMemory,
        includeSkills: options.includeSkills,
        maxMessages: options.maxMessages,
        hasSystemPrompt: options.systemPrompt !== undefined,
        systemPromptLength,
        hasRuntimeContext: options.runtimeContext !== undefined,
      },
    });

    try {
      const messages: Message[] = [];

      // 1. 系统提示词
      if (options.systemPrompt) {
        messages.push({ role: "system", content: options.systemPrompt });
        logger.info("系统提示词已添加", { length: options.systemPrompt.length });
      }

      // 2. 记忆上下文
      if (options.includeMemory && this.memory) {
        const memoryContext = this.memory.getMemoryContext();
        if (memoryContext) {
          messages.push({
            role: "system",
            content: `<memory>\n${memoryContext}\n</memory>`,
          });
          logger.info("记忆上下文已添加", { length: memoryContext.length });
        }
      }

      // 3. 技能摘要（XML 格式）
      if (options.includeSkills && this.skills?.length) {
        const skillsSummary = this.buildSkillsSummaryXml();
        if (skillsSummary) {
          messages.push({ role: "system", content: skillsSummary });
          logger.info("技能摘要已添加", {
            skillsCount: this.skills.length,
            length: skillsSummary.length,
          });
        }
      }

      // 4. 对话历史
      const history = session.getMessages();
      const maxHistory = options.maxMessages ?? history.length;
      const truncatedCount = Math.max(0, history.length - maxHistory);
      const recentHistory = history.slice(-maxHistory);

      // 5. 如果有运行时上下文，注入到最后一条用户消息前
      if (options.runtimeContext && recentHistory.length > 0) {
        const lastUserMsg = recentHistory.findLast((m) => m.role === "user");
        if (lastUserMsg && typeof lastUserMsg.content === "string") {
          lastUserMsg.content = `${options.runtimeContext}\n\n${lastUserMsg.content}`;
          logger.info("运行时上下文已注入用户消息", { runtimeContextLength: options.runtimeContext.length });
        }
      }

      messages.push(...recentHistory);

      logger.info("上下文已构建", {
        sessionKey: session.key,
        totalMessages: messages.length,
        historyMessages: recentHistory.length,
        truncatedCount,
        systemPromptLength,
        includedMemory: options.includeMemory && this.memory !== undefined,
        includedSkills: options.includeSkills && (this.skills?.length ?? 0) > 0,
        injectedRuntimeContext: options.runtimeContext !== undefined,
      });

      logMethodReturn(logger, {
        method,
        module,
        result: sanitize({ messageCount: messages.length, truncatedCount }),
        duration: timer(),
      });
      return messages;
    } catch (err: unknown) {
      const error = err as Error;
      logMethodError(logger, {
        method,
        module,
        error: {
          name: error.name,
          message: error.message,
          ...(error.stack ? { stack: error.stack } : {}),
        },
        params: { sessionKey: session.key, systemPromptLength },
        duration: timer(),
      });
      throw err;
    }
  }

  /**
   * 构建技能摘要（XML 格式）
   *
   * XML 格式优势：
   * - 结构清晰，易于解析
   * - 支持属性和嵌套
   * - 便于按需加载完整内容
   *
   * @returns XML 格式的技能摘要
   */
  private buildSkillsSummaryXml(): string {
    const timer = createTimer();
    const module = MODULE_NAME;
    const method = "buildSkillsSummaryXml";
    logMethodCall(logger, {
      method,
      module,
      params: { skillsCount: this.skills?.length ?? 0 },
    });

    try {
      if (!this.skills?.length) {
        logMethodReturn(logger, {
          method,
          module,
          result: sanitize({ summary: "", reason: "no_skills" }),
          duration: timer(),
        });
        return "";
      }

      const skillItems: SkillSummaryItem[] = this.skills.map((s) => {
        const meta = s.meta;
        const config = s.config;
        return {
          name: meta.name,
          description: meta.description,
          location: config.path,
          available: true,
          requires: meta.dependencies?.join(", "),
        };
      });

      const lines: string[] = ["<skills>"];

      for (const skill of skillItems) {
        lines.push(`  <skill available="${skill.available}">`);
        lines.push(`    <name>${this.escapeXml(skill.name)}</name>`);
        lines.push(`    <description>${this.escapeXml(skill.description)}</description>`);
        lines.push(`    <location>${this.escapeXml(skill.location)}</location>`);
        if (skill.requires) {
          lines.push(`    <requires>${this.escapeXml(skill.requires)}</requires>`);
        }
        lines.push("  </skill>");
      }

      lines.push("</skills>");
      const result = lines.join("\n");

      logMethodReturn(logger, {
        method,
        module,
        result: sanitize({ skillsCount: skillItems.length, length: result.length }),
        duration: timer(),
      });
      return result;
    } catch (err: unknown) {
      const error = err as Error;
      logMethodError(logger, {
        method,
        module,
        error: {
          name: error.name,
          message: error.message,
          ...(error.stack ? { stack: error.stack } : {}),
        },
        params: { skillsCount: this.skills?.length ?? 0 },
        duration: timer(),
      });
      throw err;
    }
  }

  /**
   * 转义 XML 特殊字符
   */
  private escapeXml(text: string): string {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
  }

  /**
   * 获取技能列表（用于按需加载）
   *
   * @returns 技能摘要列表
   */
  getSkillSummaries(): SkillSummaryItem[] {
    if (!this.skills?.length) {
      return [];
    }

    return this.skills.map((s) => ({
      name: s.meta.name,
      description: s.meta.description,
      location: s.config.path,
      available: true,
      requires: s.meta.dependencies?.join(", "),
    }));
  }
}