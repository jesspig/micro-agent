import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

const DEFAULT_INTERVAL_MS = 30 * 60 * 1000; // 30 分钟
const HEARTBEAT_PROMPT = `Read HEARTBEAT.md in your workspace (if it exists).
Follow any instructions or tasks listed there.
If nothing needs attention, reply with just: HEARTBEAT_OK`;
const OK_TOKEN = 'HEARTBEAT_OK';

/** Heartbeat 配置 */
interface HeartbeatConfig {
  intervalMs: number;
  workspace: string;
}

/** Heartbeat 回调类型 */
type HeartbeatCallback = (prompt: string) => Promise<string>;

/**
 * Heartbeat 服务
 * 
 * 定期唤醒 Agent 检查 HEARTBEAT.md 中的任务。
 */
export class HeartbeatService {
  private timerId: Timer | null = null;
  private _running = false;

  constructor(
    private onHeartbeat: HeartbeatCallback,
    private config: HeartbeatConfig
  ) {}

  /** 启动服务 */
  start(): void {
    this._running = true;
    this.scheduleNext();
  }

  /** 停止服务 */
  stop(): void {
    this._running = false;
    if (this.timerId) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
  }

  /** 是否运行中 */
  get isRunning(): boolean {
    return this._running;
  }

  /** 调度下一次心跳 */
  private scheduleNext(): void {
    this.timerId = setTimeout(() => {
      if (this._running) {
        this.tick();
        this.scheduleNext();
      }
    }, this.config.intervalMs);
  }

  /** 执行心跳 */
  private async tick(): Promise<void> {
    const heartbeatPath = join(this.config.workspace, 'HEARTBEAT.md');

    // 检查是否有待处理任务
    if (!existsSync(heartbeatPath)) {
      return;
    }

    const content = readFileSync(heartbeatPath, 'utf-8');
    if (this.isEmpty(content)) {
      return;
    }

    // 调用 Agent 处理
    try {
      const response = await this.onHeartbeat(HEARTBEAT_PROMPT);

      if (response.trim() === OK_TOKEN) {
        // Agent 无需处理
      }
    } catch (error) {
      console.error('Heartbeat 执行失败:', error);
    }
  }

  /** 检查 HEARTBEAT.md 是否为空 */
  private isEmpty(content: string): boolean {
    const lines = content.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      if (trimmed.startsWith('#')) continue;
      if (trimmed.startsWith('<!--')) continue;
      if (trimmed.startsWith('- [x]')) continue; // 已完成的任务
      if (trimmed.startsWith('- [ ]')) return false; // 有未完成任务
      return false; // 有其他内容
    }
    return true;
  }
}
