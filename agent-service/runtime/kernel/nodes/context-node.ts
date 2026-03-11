/**
 * 上下文构建节点
 *
 * 职责：
 * 1. 检索相关记忆
 * 2. 检索知识库内容
 * 3. 构建完整系统提示词
 */

import type { RunnableConfig } from "@langchain/core/runnables";
import type { AgentState, AgentStateUpdate } from "../state";
import type { LangGraphAgentConfig, MemoryEntry, KnowledgeSearchResult } from "../types";
import type { LLMMessage } from "../../../types/message";

/** 记忆管理器接口 */
interface MemoryManagerLike {
  search: (query: string, options?: { limit?: number }) => Promise<Array<{ entry: MemoryEntry }>>;
}

/** 知识检索器接口 */
interface KnowledgeRetrieverLike {
  retrieve: (query: string) => Promise<KnowledgeSearchResult[]>;
}

/**
 * 创建上下文构建节点
 */
export function createBuildContextNode(config: LangGraphAgentConfig) {
  const memoryManager = config.memoryManager as MemoryManagerLike | undefined;
  const knowledgeRetriever = config.knowledgeRetriever as KnowledgeRetrieverLike | undefined;

  return async (state: AgentState, _runConfig?: RunnableConfig): Promise<AgentStateUpdate> => {
    // 获取最后一条用户消息
    const messages = state.messages;
    const lastUserMessage = [...messages].reverse().find((m) => m._getType?.() === "human");

    if (!lastUserMessage) {
      return {};
    }

    const query = typeof lastUserMessage.content === "string"
      ? lastUserMessage.content
      : JSON.stringify(lastUserMessage.content);

    // 并行检索记忆和知识
    const [memories, knowledge] = await Promise.all([
      memoryManager?.search(query, { limit: 5 }) ?? Promise.resolve([]),
      knowledgeRetriever?.retrieve(query) ?? Promise.resolve([]),
    ]);

    // 构建增强的系统提示词
    let enhancedPrompt = state.systemPrompt || config.systemPrompt;

    // 添加记忆上下文
    if (memories.length > 0) {
      const memoryContext = memories
        .map((m) => {
          const entry = m.entry;
          return `[${entry.type || "记忆"}] ${entry.content || ""}`;
        })
        .join("\n");
      enhancedPrompt += `\n\n# 相关记忆\n\n${memoryContext}\n`;
    }

    // 添加知识库上下文
    if (knowledge.length > 0) {
      const knowledgeContext = knowledge
        .map((r) => {
          const doc = r.document;
          return `【${doc.path}】\n${doc.content.slice(0, 500)}...`;
        })
        .join("\n\n---\n\n");
      enhancedPrompt += `\n\n# 相关知识库内容\n\n${knowledgeContext}\n`;
    }

    return {
      retrievedMemories: memories.map((m) => ({
        type: m.entry.type,
        content: m.entry.content,
      })),
      retrievedKnowledge: knowledge,
      systemPrompt: enhancedPrompt,
    };
  };
}
