/**
 * 消息构建器
 *
 * 负责消息列表构建、格式化和压缩
 */

import type { InboundMessage, LLMMessage, MessageContent } from '@micro-agent/types';
import type { MemoryEntry } from '../types';
import type { AgentExecutorConfig } from './types';
import { buildUserContent, convertToPlainText } from '@micro-agent/providers';
import { MessageHistoryManager } from '../message-manager';
import { getLogger } from '@logtape/logtape';

const log = getLogger(['executor', 'message']);

/**
 * 消息构建器
 */
export class MessageBuilder {
  private messageManager: MessageHistoryManager;

  constructor(config: Pick<AgentExecutorConfig, 'maxHistoryMessages'> = {}) {
    this.messageManager = new MessageHistoryManager({
      maxMessages: config.maxHistoryMessages ?? 50,
      truncationStrategy: 'sliding',
      preserveSystemMessages: true,
      preserveRecentCount: 10,
    });
  }

  /**
   * 构建消息列表
   */
  buildMessages(history: LLMMessage[], msg: InboundMessage, memories?: MemoryEntry[]): LLMMessage[] {
    const messages: LLMMessage[] = [];

    // 构建系统提示（包含记忆上下文）
    const systemPrompt = this.buildSystemPrompt(memories, msg);
    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }

    messages.push(...history);

    const userContent: MessageContent = buildUserContent(msg.content, msg.media);
    messages.push({ role: 'user', content: userContent });

    if (msg.media && msg.media.length > 0) {
      log.info('📎 媒体', { count: msg.media.length });
    }

    return messages;
  }

  /**
   * 构建系统提示（包含记忆上下文）
   */
  private buildSystemPrompt(memories?: MemoryEntry[], msg?: InboundMessage): string {
    let prompt = msg?.metadata?.systemPrompt as string ?? '';

    // 注入记忆上下文
    if (memories && memories.length > 0) {
      const memoryContext = this.formatMemoryContext(memories);
      prompt = prompt 
        ? `${prompt}\n\n${memoryContext}` 
        : memoryContext;
      
      log.info('💉 记忆已注入系统提示', { 
        memoryCount: memories.length,
        contextLength: memoryContext.length 
      });
    }

    return prompt;
  }

  /**
   * 格式化记忆上下文
   */
  private formatMemoryContext(memories: MemoryEntry[]): string {
    // 区分文档记忆和其他记忆
    const documentMemories = memories.filter(m => m.type === 'document' || m.metadata.documentTitle);
    const otherMemories = memories.filter(m => m.type !== 'document' && !m.metadata.documentTitle);
    
    const lines: string[] = [];
    
    // 文档记忆（知识库）- 使用交叉引用格式
    if (documentMemories.length > 0) {
      // 按文档 ID 分组统计
      const docGroups = this.groupDocumentsById(documentMemories);
      const docCount = docGroups.size;
      const chunkCount = documentMemories.length;
      
      lines.push('<knowledge-documents>');
      lines.push(`知识库检索结果：共 **${docCount}** 个文档，**${chunkCount}** 个相关片段。`);
      lines.push('');
      lines.push('### 📖 引用说明');
      lines.push('每个片段前标注了引用编号 [1], [2], [3]...');
      lines.push('**回答时请在相关语句末尾标注引用编号**，例如：');
      lines.push('- 「该产品支持多模态交互[1]」');
      lines.push('- 「根据白皮书第三章的描述[3]，系统架构包含三个核心模块」');
      lines.push('');
      
      // 文档概览（带引用编号映射）
      lines.push('### 📚 文档概览');
      let refIndex = 1;
      const refMapping: string[] = []; // 记录每个引用编号对应的文档
      for (const [docId, chunks] of docGroups) {
        const docTitle = chunks[0].metadata.documentTitle || '未知文档';
        const avgScore = chunks.reduce((sum, c) => sum + (c.metadata.score ?? 0), 0) / chunks.length;
        const refRange = chunks.length > 1 
          ? `[${refIndex}-${refIndex + chunks.length - 1}]`
          : `[${refIndex}]`;
        lines.push(`- **${docTitle}** ${refRange} - ${chunks.length} 个片段，平均相似度 ${(avgScore * 100).toFixed(1)}%`);
        for (let i = 0; i < chunks.length; i++) {
          refMapping.push(docTitle);
        }
        refIndex += chunks.length;
      }
      lines.push('');
      
      // 片段内容（全局编号，便于引用）
      lines.push('### 📄 检索片段');
      refIndex = 1;
      for (const [docId, chunks] of docGroups) {
        const docTitle = chunks[0].metadata.documentTitle || '未知文档';
        
        // 按 chunkIndex 或 score 排序
        const sortedChunks = [...chunks].sort((a, b) => {
          const aIdx = a.metadata.chunkIndex ?? 0;
          const bIdx = b.metadata.chunkIndex ?? 0;
          return aIdx - bIdx;
        });
        
        for (const chunk of sortedChunks) {
          // 构建来源信息
          const sourceParts: string[] = [docTitle];
          if (chunk.metadata.pageNumber) {
            sourceParts.push(`p.${chunk.metadata.pageNumber}`);
          }
          if (chunk.metadata.section) {
            sourceParts.push(chunk.metadata.section);
          }
          const sourceInfo = sourceParts.join(' | ');
          const scoreInfo = chunk.metadata.score ? ` (相似度 ${(chunk.metadata.score * 100).toFixed(0)}%)` : '';
          
          const preview = chunk.content.length > 350 ? chunk.content.slice(0, 350) + '...' : chunk.content;
          lines.push(`**[${refIndex}]** ${sourceInfo}${scoreInfo}`);
          lines.push(preview);
          lines.push('');
          refIndex++;
        }
      }
      
      lines.push('</knowledge-documents>');
    }
    
    // 其他记忆（对话历史、偏好等）- 不需要引用
    if (otherMemories.length > 0) {
      lines.push('<relevant-memories>');
      lines.push('以下是相关的历史记忆：');
      lines.push('');
      
      for (const m of otherMemories) {
        const typeLabel = this.getMemoryTypeLabel(m.type);
        const preview = m.content.length > 200 ? m.content.slice(0, 200) + '...' : m.content;
        lines.push(`- [${typeLabel}] ${preview}`);
      }
      
      lines.push('</relevant-memories>');
    }
    
    log.debug('📝 格式化记忆上下文', { 
      documentCount: documentMemories.length,
      memoryCount: otherMemories.length,
      totalLength: lines.join('\n').length
    });
    
    return lines.join('\n');
  }

  /**
   * 按文档 ID 分组
   */
  private groupDocumentsById(memories: MemoryEntry[]): Map<string, MemoryEntry[]> {
    const groups = new Map<string, MemoryEntry[]>();
    
    for (const m of memories) {
      // 使用 documentId 作为分组键，如果没有则使用 documentTitle
      const key = m.metadata.documentId || m.metadata.documentTitle || `unknown-${m.id}`;
      
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(m);
    }
    
    return groups;
  }

  /**
   * 构建文档来源信息
   */
  private buildDocumentSourceInfo(memory: MemoryEntry): string {
    const { metadata } = memory;
    const parts: string[] = [];
    
    if (metadata.documentTitle) {
      parts.push(`文档: ${metadata.documentTitle}`);
    }
    if (metadata.pageNumber) {
      parts.push(`页码: ${metadata.pageNumber}`);
    }
    if (metadata.section) {
      parts.push(`章节: ${metadata.section}`);
    }
    if (metadata.score) {
      parts.push(`相似度: ${(metadata.score * 100).toFixed(1)}%`);
    }
    
    return parts.length > 0 ? `(${parts.join(' | ')})` : '';
  }

  /**
   * 获取记忆类型标签
   */
  private getMemoryTypeLabel(type: string): string {
    const labels: Record<string, string> = {
      fact: '事实',
      preference: '偏好',
      decision: '决策',
      entity: '实体',
      conversation: '对话',
      summary: '摘要',
      other: '其他',
    };
    return labels[type] || type;
  }

  /**
   * 截断消息列表
   */
  truncateMessages(messages: LLMMessage[]): LLMMessage[] {
    return this.messageManager.truncate(messages);
  }

  /**
   * 压缩消息历史
   */
  compressMessages(messages: LLMMessage[]): void {
    const compressed = this.messageManager.compressToolResults(messages);
    messages.length = 0;
    messages.push(...compressed);
  }

  /**
   * 确保消息列表包含系统提示词
   */
  ensureSystemPrompt(messages: LLMMessage[], systemPrompt?: string): LLMMessage[] {
    const hasSystem = messages.some(m => m.role === 'system');
    if (hasSystem || !systemPrompt) {
      return messages;
    }
    return [
      { role: 'system', content: systemPrompt },
      ...messages,
    ];
  }

  /**
   * 转换为纯文本消息（非视觉模型）
   */
  convertToPlainText(messages: LLMMessage[]): LLMMessage[] {
    return convertToPlainText(messages);
  }

  /**
   * 修复 tool 消息依赖关系
   * 
   * 确保每个 tool 消息都有对应的 assistant+tool_calls 消息
   * 移除孤立的 tool 消息，避免 API 错误
   */
  fixToolMessageDependencies(messages: LLMMessage[]): LLMMessage[] {
    const result: LLMMessage[] = [];
    
    // 收集所有有效的 tool_call_id
    const validToolCallIds = new Set<string>();
    for (const msg of messages) {
      if (msg.role === 'assistant' && msg.toolCalls) {
        for (const tc of msg.toolCalls) {
          if (tc.id) validToolCallIds.add(tc.id);
        }
      }
    }
    
    // 过滤消息，保留有效的 tool 消息
    for (const msg of messages) {
      if (msg.role === 'tool') {
        // tool 消息必须有对应的 tool_call_id
        if (msg.toolCallId && validToolCallIds.has(msg.toolCallId)) {
          result.push(msg);
        } else {
          log.debug('丢弃孤立的 tool 消息', { toolCallId: msg.toolCallId });
        }
      } else {
        result.push(msg);
      }
    }
    
    return result;
  }
}