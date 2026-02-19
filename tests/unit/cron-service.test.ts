import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { CronService } from '../../src/core/service/cron/service';
import { CronStore, type CronJob } from '../../src/core/storage/cron/store';
import { Database } from 'bun:sqlite';
import { join } from 'path';
import { tmpdir } from 'os';

describe('CronService', () => {
  let db: Database;
  let store: CronStore;
  let service: CronService;
  let executedJobs: CronJob[] = [];

  beforeEach(() => {
    const dbPath = join(tmpdir(), `cron-test-${Date.now()}.db`);
    db = new Database(dbPath);

    // 创建表
    db.run(`
      CREATE TABLE IF NOT EXISTS cron_jobs (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        enabled INTEGER NOT NULL,
        schedule_kind TEXT NOT NULL,
        schedule_value TEXT,
        message TEXT NOT NULL,
        channel TEXT,
        to_address TEXT,
        next_run_at INTEGER,
        last_run_at INTEGER,
        last_status TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);

    store = new CronStore(db);
    executedJobs = [];

    service = new CronService(
      store,
      async (job) => {
        executedJobs.push(job);
        return '完成';
      },
      { defaultChannel: 'feishu' }
    );
  });

  afterEach(() => {
    service.stop();
    db.close();
  });

  describe('基础功能', () => {
    it('should start and stop', async () => {
      expect(service.isRunning).toBe(false);
      await service.start();
      expect(service.isRunning).toBe(true);
      service.stop();
      expect(service.isRunning).toBe(false);
    });
  });

  describe('任务管理', () => {
    it('should add job', () => {
      const job = service.addJob(
        '测试任务',
        'every',
        '60000',
        '每分钟执行'
      );

      expect(job.id).toBeDefined();
      expect(job.name).toBe('测试任务');
      expect(job.enabled).toBe(true);
      expect(job.nextRunAt).toBeDefined();
    });

    it('should list jobs', () => {
      service.addJob('任务1', 'every', '60000', '消息1');
      service.addJob('任务2', 'every', '120000', '消息2');

      const jobs = service.listJobs();
      expect(jobs.length).toBe(2);
    });

    it('should remove job', () => {
      const job = service.addJob('测试任务', 'every', '60000', '消息');

      expect(service.removeJob(job.id)).toBe(true);
      expect(service.listJobs().length).toBe(0);
    });
  });

  describe('调度执行', () => {
    it('should execute due jobs', async () => {
      // 创建一个立即执行的任务
      const job: CronJob = {
        id: 'test-1',
        name: '立即执行',
        enabled: true,
        scheduleKind: 'at',
        scheduleValue: new Date(Date.now() - 1000).toISOString(),
        message: '测试消息',
        nextRunAt: Date.now() - 1000, // 已到期
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      store.add(job);

      // 启动服务，等待执行
      await service.start();

      // 等待任务执行
      await new Promise(r => setTimeout(r, 1100));

      expect(executedJobs.length).toBeGreaterThanOrEqual(1);
    });
  });
});
