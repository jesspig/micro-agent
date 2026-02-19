import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { Database } from 'bun:sqlite';
import { CronStore, type CronJob } from '../../src/core/storage/cron/store';

describe('CronStore', () => {
  let db: Database;
  let store: CronStore;

  beforeEach(() => {
    db = new Database(':memory:');
    db.run(`
      CREATE TABLE cron_jobs (
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
  });

  afterEach(() => {
    db.close();
  });

  describe('任务 CRUD', () => {
    it('should add and get job', () => {
      const job = createTestJob('job-1', '测试任务');
      store.add(job);
      
      const retrieved = store.get('job-1');
      expect(retrieved).not.toBeNull();
      expect(retrieved?.name).toBe('测试任务');
      expect(retrieved?.enabled).toBe(true);
    });

    it('should return null for non-existent job', () => {
      const job = store.get('nonexistent');
      expect(job).toBeNull();
    });

    it('should list all jobs', () => {
      store.add(createTestJob('job-1', '任务 1'));
      store.add(createTestJob('job-2', '任务 2'));
      
      const jobs = store.list();
      expect(jobs).toHaveLength(2);
    });

    it('should list only enabled jobs by default', () => {
      const job1 = createTestJob('job-1', '启用任务');
      const job2 = createTestJob('job-2', '禁用任务');
      job2.enabled = false;
      
      store.add(job1);
      store.add(job2);
      
      const jobs = store.list();
      expect(jobs).toHaveLength(1);
      expect(jobs[0].id).toBe('job-1');
    });

    it('should list all jobs when includeDisabled is true', () => {
      const job1 = createTestJob('job-1', '启用任务');
      const job2 = createTestJob('job-2', '禁用任务');
      job2.enabled = false;
      
      store.add(job1);
      store.add(job2);
      
      const jobs = store.list(true);
      expect(jobs).toHaveLength(2);
    });

    it('should update job', () => {
      store.add(createTestJob('job-1', '原名称'));
      
      const job = store.get('job-1')!;
      job.name = '新名称';
      job.lastStatus = 'ok';
      store.update(job);
      
      const updated = store.get('job-1');
      expect(updated?.name).toBe('新名称');
      expect(updated?.lastStatus).toBe('ok');
    });

    it('should delete job', () => {
      store.add(createTestJob('job-1', '测试任务'));
      const result = store.delete('job-1');
      
      expect(result).toBe(true);
      expect(store.get('job-1')).toBeNull();
    });

    it('should return false when deleting non-existent job', () => {
      const result = store.delete('nonexistent');
      expect(result).toBe(false);
    });
  });

  describe('到期任务查询', () => {
    it('should get due jobs', () => {
      const now = Date.now();
      const pastJob = createTestJob('job-past', '过去任务');
      pastJob.nextRunAt = now - 1000;
      pastJob.enabled = true;
      
      const futureJob = createTestJob('job-future', '未来任务');
      futureJob.nextRunAt = now + 10000;
      futureJob.enabled = true;
      
      store.add(pastJob);
      store.add(futureJob);
      
      const dueJobs = store.getDueJobs(now);
      expect(dueJobs).toHaveLength(1);
      expect(dueJobs[0].id).toBe('job-past');
    });

    it('should not include disabled jobs in due jobs', () => {
      const now = Date.now();
      const disabledJob = createTestJob('job-disabled', '禁用任务');
      disabledJob.enabled = false;
      disabledJob.nextRunAt = now - 1000;
      
      store.add(disabledJob);
      
      const dueJobs = store.getDueJobs(now);
      expect(dueJobs).toHaveLength(0);
    });
  });

  describe('启用/禁用任务', () => {
    it('should disable job by setting enabled to false', () => {
      store.add(createTestJob('job-1', '测试任务'));
      
      const job = store.get('job-1')!;
      job.enabled = false;
      store.update(job);
      
      const updated = store.get('job-1');
      expect(updated?.enabled).toBe(false);
    });
  });
});

/** 创建测试用 CronJob */
function createTestJob(id: string, name: string): CronJob {
  const now = Date.now();
  return {
    id,
    name,
    enabled: true,
    scheduleKind: 'every',
    scheduleValue: '1h',
    message: '测试消息',
    createdAt: now,
    updatedAt: now,
  };
}
