import type { Database } from 'bun:sqlite';

/** 调度类型 */
export type ScheduleKind = 'at' | 'every' | 'cron';

/** 执行状态 */
export type ExecutionStatus = 'ok' | 'error';

/** Cron 任务 */
export interface CronJob {
  /** 任务 ID */
  id: string;
  /** 任务名称 */
  name: string;
  /** 是否启用 */
  enabled: boolean;
  /** 调度类型 */
  scheduleKind: ScheduleKind;
  /** 调度值 */
  scheduleValue?: string;
  /** 执行消息 */
  message: string;
  /** 目标通道 */
  channel?: string;
  /** 目标地址 */
  toAddress?: string;
  /** 下次执行时间（ms） */
  nextRunAt?: number;
  /** 上次执行时间（ms） */
  lastRunAt?: number;
  /** 上次状态 */
  lastStatus?: ExecutionStatus;
  /** 创建时间（ms） */
  createdAt: number;
  /** 更新时间（ms） */
  updatedAt: number;
}

/**
 * Cron 任务存储
 * 
 * 管理定时任务的 CRUD 操作。
 */
export class CronStore {
  constructor(private db: Database) {}

  /**
   * 列出所有任务
   * @param includeDisabled - 是否包含禁用任务，默认 false
   * @returns 任务列表
   */
  list(includeDisabled: boolean = false): CronJob[] {
    const query = includeDisabled
      ? 'SELECT * FROM cron_jobs ORDER BY next_run_at'
      : 'SELECT * FROM cron_jobs WHERE enabled = 1 ORDER BY next_run_at';
    const rows = this.db.query<{
      id: string;
      name: string;
      enabled: number;
      schedule_kind: string;
      schedule_value: string | null;
      message: string;
      channel: string | null;
      to_address: string | null;
      next_run_at: number | null;
      last_run_at: number | null;
      last_status: string | null;
      created_at: number;
      updated_at: number;
    }, []>(query).all();

    return rows.map(this.mapRowToJob);
  }

  /**
   * 获取单个任务
   * @param id - 任务 ID
   * @returns 任务对象，不存在则返回 null
   */
  get(id: string): CronJob | null {
    const row = this.db.query<{
      id: string;
      name: string;
      enabled: number;
      schedule_kind: string;
      schedule_value: string | null;
      message: string;
      channel: string | null;
      to_address: string | null;
      next_run_at: number | null;
      last_run_at: number | null;
      last_status: string | null;
      created_at: number;
      updated_at: number;
    }, [string]>(
      'SELECT * FROM cron_jobs WHERE id = ?'
    ).get(id);

    return row ? this.mapRowToJob(row) : null;
  }

  /**
   * 添加任务
   * @param job - 任务对象
   */
  add(job: CronJob): void {
    this.db.run(`
      INSERT INTO cron_jobs (
        id, name, enabled, schedule_kind, schedule_value, message,
        channel, to_address, next_run_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      job.id, job.name, job.enabled ? 1 : 0, job.scheduleKind,
      job.scheduleValue ?? null, job.message, job.channel ?? null,
      job.toAddress ?? null, job.nextRunAt ?? null,
      job.createdAt, job.updatedAt
    ]);
  }

  /**
   * 更新任务
   * @param job - 任务对象
   */
  update(job: CronJob): void {
    job.updatedAt = Date.now();
    this.db.run(`
      UPDATE cron_jobs SET
        name = ?, enabled = ?, schedule_kind = ?,
        schedule_value = ?, message = ?,
        channel = ?, to_address = ?,
        next_run_at = ?, last_run_at = ?,
        last_status = ?, updated_at = ?
      WHERE id = ?
    `, [
      job.name, job.enabled ? 1 : 0, job.scheduleKind,
      job.scheduleValue ?? null, job.message,
      job.channel ?? null, job.toAddress ?? null,
      job.nextRunAt ?? null, job.lastRunAt ?? null,
      job.lastStatus ?? null, job.updatedAt, job.id
    ]);
  }

  /**
   * 删除任务
   * @param id - 任务 ID
   * @returns 是否删除成功
   */
  delete(id: string): boolean {
    const result = this.db.run('DELETE FROM cron_jobs WHERE id = ?', [id]);
    return result.changes > 0;
  }

  /**
   * 获取到期任务
   * @param now - 当前时间戳（ms）
   * @returns 到期任务列表
   */
  getDueJobs(now: number): CronJob[] {
    const rows = this.db.query<{
      id: string;
      name: string;
      enabled: number;
      schedule_kind: string;
      schedule_value: string | null;
      message: string;
      channel: string | null;
      to_address: string | null;
      next_run_at: number | null;
      last_run_at: number | null;
      last_status: string | null;
      created_at: number;
      updated_at: number;
    }, [number]>(
      'SELECT * FROM cron_jobs WHERE enabled = 1 AND next_run_at <= ?'
    ).all(now);

    return rows.map(this.mapRowToJob);
  }

  /** 将数据库行映射为 CronJob 对象 */
  private mapRowToJob(row: {
    id: string;
    name: string;
    enabled: number;
    schedule_kind: string;
    schedule_value: string | null;
    message: string;
    channel: string | null;
    to_address: string | null;
    next_run_at: number | null;
    last_run_at: number | null;
    last_status: string | null;
    created_at: number;
    updated_at: number;
  }): CronJob {
    return {
      id: row.id,
      name: row.name,
      enabled: row.enabled === 1,
      scheduleKind: row.schedule_kind as ScheduleKind,
      scheduleValue: row.schedule_value ?? undefined,
      message: row.message,
      channel: row.channel ?? undefined,
      toAddress: row.to_address ?? undefined,
      nextRunAt: row.next_run_at ?? undefined,
      lastRunAt: row.last_run_at ?? undefined,
      lastStatus: row.last_status as ExecutionStatus | undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
