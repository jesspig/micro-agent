import type { LLMProvider, LLMMessage } from '../providers/base';
import type { MessageBus } from '../bus/queue';

/**
 * 子代理管理器
 * 
 * 创建后台子代理执行独立任务，完成后通过系统消息通知主代理。
 */
export class SubagentManager {
  private runningTasks = new Map<string, Promise<void>>();

  constructor(
    private provider: LLMProvider,
    private workspace: string,
    private bus: MessageBus,
    private model: string
  ) {}

  /**
   * 生成子代理
   * @param task - 任务描述
   * @param label - 任务标签
   * @param originChannel - 来源通道
   * @param originChatId - 来源聊天 ID
   */
  async spawn(
    task: string,
    label: string | undefined,
    originChannel: string,
    originChatId: string
  ): Promise<string> {
    const taskId = crypto.randomUUID().slice(0, 8);
    const taskName = label ?? `task-${taskId}`;

    const taskPromise = this.executeTask(
      taskId,
      taskName,
      task,
      originChannel,
      originChatId
    );
    this.runningTasks.set(taskId, taskPromise);

    return `已启动子代理 [${taskName}] (${taskId})，完成后将通知您。`;
  }

  /**
   * 执行任务
   */
  private async executeTask(
    taskId: string,
    taskName: string,
    task: string,
    originChannel: string,
    originChatId: string
  ): Promise<void> {
    try {
      const messages: LLMMessage[] = [
        {
          role: 'system',
          content: '你是一个独立的后台任务执行者。完成指定任务后报告结果。',
        },
        { role: 'user', content: task },
      ];

      const response = await this.provider.chat(messages, undefined, this.model);

      // 发送完成通知
      await this.bus.publishInbound({
        channel: 'system',
        senderId: `subagent:${taskId}`,
        chatId: `${originChannel}:${originChatId}`,
        content: `[${taskName}] 任务完成:\n\n${response.content}`,
        timestamp: new Date(),
        media: [],
        metadata: { taskId, taskName },
      });
    } catch (error) {
      await this.bus.publishInbound({
        channel: 'system',
        senderId: `subagent:${taskId}`,
        chatId: `${originChannel}:${originChatId}`,
        content: `[${taskName}] 任务失败: ${error}`,
        timestamp: new Date(),
        media: [],
        metadata: { taskId, taskName, error: true },
      });
    } finally {
      this.runningTasks.delete(taskId);
    }
  }

  /** 获取运行中的任务数 */
  get runningCount(): number {
    return this.runningTasks.size;
  }
}
