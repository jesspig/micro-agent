/**
 * 上下文构建器
 *
 * 负责将 Session、Memory、Skill 等信息整合为 LLM 可用的消息上下文
 */

import type { Message } from "../types.js";
import type { Session } from "./manager.js";
import type { IMemoryExtended } from "../memory/contract.js";
import type { ISkillExtended } from "../skill/contract.js";

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
  ) {}

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
    const messages: Message[] = [];

    // 1. 系统提示词
    if (options.systemPrompt) {
      messages.push({ role: "system", content: options.systemPrompt });
    }

    // 2. 记忆上下文
    if (options.includeMemory && this.memory) {
      const memoryContext = this.memory.getMemoryContext();
      if (memoryContext) {
        messages.push({
          role: "system",
          content: `<memory>\n${memoryContext}\n</memory>`,
        });
      }
    }

    // 3. 技能摘要
    if (options.includeSkills && this.skills?.length) {
      const skillsSummary = this.buildSkillsSummary();
      if (skillsSummary) {
        messages.push({ role: "system", content: skillsSummary });
      }
    }

    // 4. 对话历史
    const history = session.getMessages();
    const maxHistory = options.maxMessages ?? history.length;
    const recentHistory = history.slice(-maxHistory);
    messages.push(...recentHistory);

    return messages;
  }

  /**
   * 构建技能摘要
   * @returns 格式化的技能摘要文本
   */
  private buildSkillsSummary(): string {
    if (!this.skills?.length) return "";

    const summaries = this.skills.map((s) => {
      const meta = s.meta;
      return `- ${meta.name}: ${meta.description}`;
    });

    return `<skills>\n${summaries.join("\n")}\n</skills>`;
  }
}
