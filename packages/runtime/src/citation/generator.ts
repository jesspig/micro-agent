/**
 * 引用生成器
 * 
 * 从检索结果生成带引用的响应，实现 RAG 级别的溯源能力
 */

import type { MemoryEntry, Citation, CitedResponse, CitationGeneratorConfig } from '../types';

/** 默认配置 */
const DEFAULT_CONFIG: CitationGeneratorConfig = {
  minConfidence: 0.7,  // 提高阈值，避免低相关度引用
  maxCitations: 5,
  maxSnippetLength: 200,
  format: 'numbered',
};

/**
 * 引用生成器
 * 
 * 从检索结果生成带引用的响应
 */
export class CitationGenerator {
  private config: CitationGeneratorConfig;

  constructor(config?: Partial<CitationGeneratorConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * 从记忆条目生成引用
   * @param entries 检索结果
   * @returns 引用列表
   */
  generateCitations(entries: MemoryEntry[]): Citation[] {
    const citations: Citation[] = [];

    for (const entry of entries) {
      // 仅处理文档类型且有置信度的条目
      if (entry.type !== 'document' || !entry.metadata.documentId) {
        continue;
      }

      const confidence = entry.metadata.confidence ?? entry.metadata.score ?? 0;
      
      // 过滤低置信度结果
      if (confidence < this.config.minConfidence) {
        continue;
      }

      const citation: Citation = {
        id: `cite_${entry.id}`,
        documentId: entry.metadata.documentId,
        documentPath: entry.metadata.documentPath ?? '',
        documentTitle: entry.metadata.documentTitle,
        snippet: this.truncateSnippet(entry.content),
        pageNumber: entry.metadata.pageNumber,
        section: entry.metadata.section,
        confidence,
        charRange: entry.metadata.charRange,
      };

      citations.push(citation);

      // 限制引用数量
      if (citations.length >= this.config.maxCitations) {
        break;
      }
    }

    return citations;
  }

  /**
   * 格式化单个引用
   * @param citation 引用
   * @param index 引用索引
   * @returns 格式化后的引用文本
   */
  formatCitation(citation: Citation, index: number): string {
    const parts: string[] = [];

    // 标题
    if (citation.documentTitle) {
      parts.push(citation.documentTitle);
    } else {
      parts.push(citation.documentPath.split('/').pop() ?? citation.documentPath);
    }

    // 页码
    if (citation.pageNumber) {
      parts.push(`p.${citation.pageNumber}`);
    }

    // 章节
    if (citation.section) {
      parts.push(`§${citation.section}`);
    }

    // 置信度
    parts.push(`(${(citation.confidence * 100).toFixed(0)}%)`);

    switch (this.config.format) {
      case 'numbered':
        return `[${index + 1}] ${parts.join(', ')}`;
      case 'bracket':
        return `【${index + 1}】${parts.join(', ')}`;
      case 'footnote':
        return `${parts.join(', ')}`;
      default:
        return `[${index + 1}] ${parts.join(', ')}`;
    }
  }

  /**
   * 格式化引用列表
   * @param citations 引用列表
   * @returns 格式化后的引用文本
   */
  formatCitations(citations: Citation[]): string {
    if (citations.length === 0) {
      return '';
    }

    const lines = citations.map((c, i) => this.formatCitation(c, i));
    return `参考资料：\n${lines.join('\n')}`;
  }

  /**
   * 生成带引用的响应
   * @param content 响应内容
   * @param entries 检索结果
   * @returns 带引用的响应
   */
  generateCitedResponse(content: string, entries: MemoryEntry[]): CitedResponse {
    const citations = this.generateCitations(entries);
    
    let citedContent = content;
    if (citations.length > 0) {
      const formattedCitations = this.formatCitations(citations);
      citedContent = `${content}\n\n---\n${formattedCitations}`;
    }

    return {
      content: citedContent,
      citations,
    };
  }

  /**
   * 截断片段到最大长度
   */
  private truncateSnippet(content: string): string {
    if (content.length <= this.config.maxSnippetLength) {
      return content;
    }
    return content.slice(0, this.config.maxSnippetLength) + '...';
  }
}

/** 创建引用生成器实例 */
export function createCitationGenerator(
  config?: Partial<CitationGeneratorConfig>
): CitationGenerator {
  return new CitationGenerator(config);
}
