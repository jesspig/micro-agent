import type { LLMMessage, ToolCall, ContentPart } from '../providers/base';
import type { SkillSummary, Skill } from '../skill';
import { loadTemplateFile } from '../config/loader';

/** Bootstrap 文件列表 */
const BOOTSTRAP_FILES = ['AGENTS.md', 'IDENTITY.md', 'USER.md', 'TOOLS.md', 'SOUL.md'] as const;

/**
 * 上下文构建器
 * 
 * 构建发送给 LLM 的消息上下文，包括：
 * - 系统消息（bootstrap 文件，按层级查找）
 * - Always 技能（自动加载完整内容）
 * - 技能摘要（渐进式披露）
 * - 历史消息
 * - 当前消息（支持多模态）
 */
export class ContextBuilder {
  /** 当前工作目录（用于目录级配置查找） */
  private currentDir: string;
  /** 技能摘要列表 */
  private skillSummaries: SkillSummary[] = [];
  /** Always 技能（自动加载完整内容） */
  private alwaysSkills: Skill[] = [];

  /**
   * @param workspace - 工作目录（项目级）
   */
  constructor(private workspace: string) {
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
   * 设置技能摘要
   */
  setSkillSummaries(summaries: SkillSummary[]): void {
    this.skillSummaries = summaries;
  }

  /**
   * 设置 Always 技能
   * 这些技能会自动加载完整内容到上下文
   */
  setAlwaysSkills(skills: Skill[]): void {
    this.alwaysSkills = skills;
  }

  /**
   * 构建消息列表
   * @param history - 历史消息
   * @param currentMessage - 当前消息内容
   * @param media - 媒体文件列表（data URI 格式）
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

    // Always 技能（自动加载完整内容）
    const alwaysContent = this.buildAlwaysSkillsContent();
    if (alwaysContent) {
      messages.push({ role: 'system', content: alwaysContent });
    }

    // 技能摘要（渐进式披露）
    const skillsContent = this.buildSkillsContent();
    if (skillsContent) {
      messages.push({ role: 'system', content: skillsContent });
    }

    // 历史消息
    messages.push(...history);

    // 当前消息（支持多模态）
    const userContent = this.buildUserContent(currentMessage, media);
    messages.push({ role: 'user', content: userContent });

    return messages;
  }

  /**
   * 构建用户消息内容
   * 如果有媒体文件，返回多模态数组格式
   * 
   * OpenAI 推荐顺序：先图片，后文本
   * 这样模型能更好地理解上下文
   */
  private buildUserContent(text: string, media?: string[]): string | ContentPart[] {
    if (!media || media.length === 0) {
      return text;
    }

    // 构建多模态内容数组
    const content: ContentPart[] = [];

    // 先添加图片部分（OpenAI 推荐顺序）
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg'];
    let hasImage = false;
    
    for (const m of media) {
      const isImage = imageExtensions.some(ext => m.toLowerCase().includes(ext)) ||
                      m.includes('image/') ||
                      m.startsWith('data:image');
      
      if (isImage) {
        content.push({
          type: 'image_url',
          image_url: { 
            url: m,
            detail: 'auto',  // 让模型自动决定处理精度
          },
        });
        hasImage = true;
      }
    }

    // 后添加文本部分
    if (text.trim()) {
      content.push({ type: 'text', text });
    }

    // 如果没有图片，回退到纯文本格式
    if (!hasImage) {
      return text + (media.length > 0 ? `\n\n[附件: ${media.join(', ')}]` : '');
    }

    return content;
  }

  /**
   * 构建 Always 技能内容
   * 这些技能会自动加载完整内容，无需 Agent 主动读取
   */
  private buildAlwaysSkillsContent(): string {
    if (this.alwaysSkills.length === 0) return '';

    const parts = this.alwaysSkills.map(skill => {
      const header = `## 技能: ${skill.name}\n\n${skill.description}`;
      // 注入 skill 目录路径，替换内容中的相对路径
      const content = skill.content.replace(/<skill-dir>/g, skill.skillPath);
      return `${header}\n\n**Skill 目录: ${skill.skillPath}**\n\n${content}`;
    });

    return `# 自动加载技能\n\n${parts.join('\n\n---\n\n')}`;
  }

  /**
   * 构建技能摘要内容
   */
  private buildSkillsContent(): string {
    if (this.skillSummaries.length === 0) return '';

    const lines = this.skillSummaries.map(s => `- **${s.name}**: ${s.description}`);
    return `# 可用技能\n\n${lines.join('\n')}\n\n使用 \`read_file\` 工具读取技能详细内容（路径: skills/<技能名>/SKILL.md）`;
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