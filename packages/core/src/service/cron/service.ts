import type { CronJob, ScheduleKind } from '../../storage/cron/store';
import { CronStore } from '../../storage/cron/store';
import { parseCronExpression } from 'cron-schedule';

/** Cron 服务配置 */
interface CronServiceConfig {
  defaultChannel?: string;
  defaultTo?: string;
}

/** 任务回调类型 */
type CronJobCallback = (job: CronJob) => Promise<string | null>;

/**
 * Cron 服务
 * 
 * 管理定时任务的调度和执行。
 */
export class CronService {
  private timerId: Timer | null = null;
  private _running = false;

  constructor(
    private store: CronStore,
    private onJob: CronJobCallback,
    private config: CronServiceConfig = {}
  ) {}

  /** 启动服务 */
  async start(): Promise<void> {
    this._running = true;
    this.scheduleNextTick();
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

  /** 调度下一次检查 */
  private scheduleNextTick(): void {
    this.timerId = setTimeout(() => {
      if (this._running) {
        this.tick();
        this.scheduleNextTick();
      }
    }, 1000);
  }

  /** 执行检查 */
  private async tick(): Promise<void> {
    const now = Date.now();
    const dueJobs = this.store.getDueJobs(now);

    if (dueJobs.length > 0) {
      await this.executeJobs(dueJobs);
    }
  }

  /** 执行到期任务 */
  private async executeJobs(jobs: CronJob[]): Promise<void> {
    for (const job of jobs) {
      try {
        await this.onJob(job);
        job.lastRunAt = Date.now();
        job.lastStatus = 'ok';
      } catch (error) {
        job.lastStatus = 'error';
        console.error(`Cron 任务执行失败: ${job.name}`, error);
      }

      // 计算下次执行时间
      job.nextRunAt = this.computeNextRun(job);
      this.store.update(job);
    }
  }

  /** 计算下次执行时间 */
  private computeNextRun(job: CronJob): number | undefined {
    const now = Date.now();

    switch (job.scheduleKind) {
      case 'at':
        // 一次性任务，不再执行
        return undefined;
      case 'every':
        const intervalMs = parseInt(job.scheduleValue ?? '3600000');
        return now + intervalMs;
      case 'cron':
        try {
          const cron = parseCronExpression(job.scheduleValue ?? '');
          return cron.getNextDate().getTime();
        } catch {
          return undefined;
        }
    }
  }

  /** 从现在计算下次执行时间 */
  private computeNextRunFromNow(kind: ScheduleKind, value: string): number | undefined {
    return this.computeNextRun({
      scheduleKind: kind,
      scheduleValue: value,
    } as CronJob);
  }

  /** 添加任务 */
  addJob(
    name: string,
    scheduleKind: ScheduleKind,
    scheduleValue: string,
    message: string,
    channel?: string,
    toAddress?: string
  ): CronJob {
    const job: CronJob = {
      id: crypto.randomUUID().slice(0, 8),
      name,
      enabled: true,
      scheduleKind,
      scheduleValue,
      message,
      channel: channel ?? this.config.defaultChannel,
      toAddress: toAddress ?? this.config.defaultTo,
      nextRunAt: this.computeNextRunFromNow(scheduleKind, scheduleValue),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    this.store.add(job);
    return job;
  }

  /** 列出任务 */
  listJobs(includeDisabled: boolean = false): CronJob[] {
    return this.store.list(includeDisabled);
  }

  /** 删除任务 */
  removeJob(id: string): boolean {
    return this.store.delete(id);
  }
}
