# Service - 服务

## 概述

服务是后台运行的组件，包括定时任务和心跳。

## 定时任务服务

基于 cron-schedule 的定时任务执行。

```typescript
import { CronService } from '@microbot/sdk/services';

const cronService = new CronService(store, eventBus);

// 启动服务
await cronService.start();

// 添加任务
await cronService.addTask({
  id: 'daily-report',
  schedule: '0 9 * * *',
  action: 'send_report',
});

// 手动触发
await cronService.trigger('daily-report');

// 停止服务
await cronService.stop();
```

### 任务定义

```typescript
interface CronTask {
  id: string;
  schedule: string;      // cron 表达式
  enabled: boolean;
  action: string;
  params?: Record<string, unknown>;
  lastRun?: Date;
  nextRun?: Date;
}
```

## 心跳服务

定期执行健康检查。

```typescript
import { HeartbeatService } from '@microbot/sdk/services';

const heartbeat = new HeartbeatService(eventBus, {
  interval: 60000,  // 1 分钟
});

// 启动
await heartbeat.start();

// 停止
await heartbeat.stop();
```

## 源码位置

- 定时任务: `packages/core/src/service/cron/service.ts`
- 心跳: `packages/core/src/service/heartbeat/service.ts`
