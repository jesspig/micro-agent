/**
 * 任务 API
 */

import type { TaskStatus } from '../client/types';

interface Transport {
  send(method: string, params: unknown): Promise<unknown>;
  sendStream?(method: string, params: unknown, handler: unknown): Promise<void>;
}

export interface TaskInfo {
  id: string;
  sessionKey: string;
  task: string;
  status: TaskStatus;
  createdAt: Date;
  completedAt?: Date;
  result?: unknown;
  error?: string;
}

/**
 * 任务 API
 */
export class TaskAPI {
  constructor(private transport: Transport) {}

  /**
   * 创建任务
   */
  async create(sessionKey: string, task: string): Promise<string> {
    const result = await this.transport.send('task.create', { sessionKey, task });
    return result as string;
  }

  /**
   * 获取任务状态
   */
  async getStatus(taskId: string): Promise<TaskInfo> {
    return this.transport.send('task.getStatus', { taskId }) as Promise<TaskInfo>;
  }

  /**
   * 取消任务
   */
  async cancel(taskId: string): Promise<void> {
    await this.transport.send('task.cancel', { taskId });
  }

  /**
   * 列出任务
   */
  async list(sessionKey: string): Promise<TaskInfo[]> {
    return this.transport.send('task.list', { sessionKey }) as Promise<TaskInfo[]>;
  }
}
