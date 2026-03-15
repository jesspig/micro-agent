/**
 * 上下文构建器
 *
 * 负责将 Session、Memory、Skill 等信息整合为 LLM 可用的消息上下文
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
// 常量定义
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
}

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

      // 3. 技能摘要
      if (options.includeSkills && this.skills?.length) {
        const skillsSummary = this.buildSkillsSummary();
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
      messages.push(...recentHistory);

      logger.info("上下文已构建", {
        sessionKey: session.key,
        totalMessages: messages.length,
        historyMessages: recentHistory.length,
        truncatedCount,
        systemPromptLength,
        includedMemory: options.includeMemory && this.memory !== undefined,
        includedSkills: options.includeSkills && (this.skills?.length ?? 0) > 0,
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
   * 构建技能摘要
   * @returns 格式化的技能摘要文本
   */
  private buildSkillsSummary(): string {
    const timer = createTimer();
    const module = MODULE_NAME;
    const method = "buildSkillsSummary";
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

      const summaries = this.skills.map((s) => {
        const meta = s.meta;
        return `- ${meta.name}: ${meta.description}`;
      });

      const result = `<skills>\n${summaries.join("\n")}\n</skills>`;

      logMethodReturn(logger, {
        method,
        module,
        result: sanitize({ skillsCount: summaries.length, length: result.length }),
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
}
