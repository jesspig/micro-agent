import type { LLMMessage, ToolCall } from '../providers/base';
import type { MemoryStore } from '../memory/store';
import { loadTemplateFile } from '../config/loader';

/** Bootstrap 文件列表 */
const BOOTSTRAP_FILES = ['AGENTS.md', 'IDENTITY.md', 'USER.md', 'TOOLS.md', 'SOUL.md'] as const;

/**
 * 上下文构建器
 * 
 * 构建发送给 LLM 的消息上下文，包括：
 * - 系统消息（bootstrap 文件，按层级查找）
 * - 记忆上下文
 * - 历史消息
 * - 当前消息
 */
export class ContextBuilder {
  /** 当前工作目录（用于目录级配置查找） */
  private currentDir: string;

  /**
   * @param workspace - 工作目录（项目级）
   * @param memoryStore - 记忆存储
   */
  constructor(
    private workspace: string,
    private memoryStore: MemoryStore
  ) {
    // 默认 currentDir 为 workspace
    this.currentDir = workspace;
  }

  /**
   * 设置当前工作目录
   * 用于目录级配置查找
   */
  setCurrentDir(dir: string): void {
    this.currentDir = dir;
  }

  /**
   * 获取当前工作目录
   */
  getCurrentDir(): string {
    return this.currentDir;
  }

  /**
   * 构建消息列表
   * @param history - 历史消息
   * @param currentMessage - 当前消息内容
   * @param media - 媒体文件列表
   * @returns 完整的消息列表
   */
  async buildMessages(
    history: LLMMessage[],
    currentMessage: string,
    media?: string[]
  ): Promise<LLMMessage[]> {
    const messages: LLMMessage[] = [];

    // 系统消息（bootstrap 文件）
    const systemContent = await this.buildSystemContent();
    if (systemContent) {
      messages.push({ role: 'system', content: systemContent });
    }

    // 记忆上下文
    const memoryContent = this.buildMemoryContent();
    if (memoryContent) {
      messages.push({ role: 'system', content: `# 记忆上下文\n\n${memoryContent}` });
    }

    // 历史消息
    messages.push(...history);

    // 当前消息
    const userContent = media?.length
      ? `${currentMessage}\n\n[附件: ${media.join(', ')}]`
      : currentMessage;
    messages.push({ role: 'user', content: userContent });

    return messages;
  }

  /**
   * 构建系统消息内容
   * 
   * 按优先级查找模板文件：
   * 系统级 < 用户级 < 项目级 < 目录级（向上递归）
   */
  private async buildSystemContent(): Promise<string> {
    const parts: string[] = [];

    for (const file of BOOTSTRAP_FILES) {
      try {
        const content = loadTemplateFile(file, this.workspace, this.currentDir);
        if (content?.trim()) {
          const name = file.replace('.md', '');
          parts.push(`## ${name}\n\n${content.trim()}`);
        }
      } catch {
        // 文件读取失败，跳过
      }
    }

    return parts.join('\n\n');
  }

  /**
   * 构建记忆上下文
   */
  private buildMemoryContent(): string {
    const parts: string[] = [];

    // 长期记忆
    const longTerm = this.memoryStore.readLongTerm();
    if (longTerm.trim()) {
      parts.push(`### 长期记忆\n${longTerm}`);
    }

    // 最近日记
    const recent = this.memoryStore.getRecent(7);
    for (const entry of recent) {
      if (entry.summary) {
        parts.push(`### ${entry.date}\n${entry.summary}`);
      }
    }

    return parts.join('\n\n');
  }

  /**
   * 添加助手消息
   */
  addAssistantMessage(
    messages: LLMMessage[],
    content: string,
    toolCalls?: ToolCall[]
  ): LLMMessage[] {
    const msg: LLMMessage = { role: 'assistant', content };
    if (toolCalls && toolCalls.length > 0) {
      msg.toolCalls = toolCalls;
    }
    return [...messages, msg];
  }

  /**
   * 添加工具结果
   */
  addToolResult(
    messages: LLMMessage[],
    toolCallId: string,
    result: string
  ): LLMMessage[] {
    return [...messages, {
      role: 'tool',
      toolCallId,
      content: result,
    }];
  }
}
