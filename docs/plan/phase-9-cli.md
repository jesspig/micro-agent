# 阶段 9：入口 & CLI

**依赖**: 阶段 8（服务层）  
**预计文件数**: 3  
**预计代码行数**: ~200 行

## 目标

实现 CLI 命令和入口文件，完成模块组装。

## 宪法合规

| 原则 | 状态 | 说明 |
|------|------|------|
| II. 组合优于继承 | ✅ | 通过 DI 组装所有模块 |

## 文件清单

### 1. src/cli.ts

**职责**: CLI 命令定义

```typescript
import { parseArgs } from 'util';
import { logger } from './utils/logger';

/**
 * CLI 命令入口
 */
export async function runCli(): Promise<void> {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      config: { type: 'string', short: 'c' },
      help: { type: 'boolean', short: 'h' },
      version: { type: 'boolean', short: 'v' },
    },
  });

  const [command] = positionals;

  if (values.help) {
    printHelp();
    return;
  }

  if (values.version) {
    console.log('microbot v1.0.0');
    return;
  }

  switch (command) {
    case 'start':
      await startServer(values.config);
      break;
    case 'status':
      await showStatus(values.config);
      break;
    case 'cron':
      await handleCron(positionals.slice(1), values.config);
      break;
    default:
      printHelp();
  }
}

/** 启动服务器 */
async function startServer(configPath?: string): Promise<void> {
  const { createApp } = await import('./index');
  const app = await createApp(configPath);
  
  logger.info('microbot 启动中...');
  await app.start();
  
  // 处理退出信号
  process.on('SIGINT', async () => {
    logger.info('正在停止...');
    await app.stop();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    logger.info('正在停止...');
    await app.stop();
    process.exit(0);
  });
}

/** 显示状态 */
async function showStatus(configPath?: string): Promise<void> {
  const { createApp } = await import('./index');
  const app = await createApp(configPath);
  
  console.log('\nmicrobot 状态\n');
  console.log('运行中的通道:', app.getRunningChannels().join(', ') || '无');
  console.log('Provider:', app.getProviderStatus());
  console.log('Cron 任务:', app.getCronCount());
}

/** 处理 Cron 命令 */
async function handleCron(args: string[], configPath?: string): Promise<void> {
  const { createApp } = await import('./index');
  const app = await createApp(configPath);
  
  const [subCommand] = args;

  switch (subCommand) {
    case 'list':
      const jobs = app.listCronJobs();
      console.log('\n定时任务列表\n');
      for (const job of jobs) {
        console.log(`[${job.id}] ${job.name} - ${job.scheduleKind}: ${job.scheduleValue}`);
      }
      break;
    case 'add':
      // 添加任务
      break;
    case 'remove':
      // 删除任务
      break;
    default:
      console.log('用法: microbot cron [list|add|remove]');
  }
}

/** 打印帮助 */
function printHelp(): void {
  console.log(`
microbot - 轻量级 AI 助手框架

用法:
  microbot [命令] [选项]

命令:
  start       启动服务
  status      显示状态
  cron        管理定时任务

选项:
  -c, --config <path>   配置文件路径
  -h, --help            显示帮助
  -v, --version         显示版本

示例:
  microbot start
  microbot start -c ./config.yaml
  microbot status
  microbot cron list
`);
}
```

**行数**: ~100 行

---

### 2. src/index.ts

**职责**: 应用入口和模块组装

```typescript
import { Container } from './container';
import { EventBus, eventBus } from './event-bus';
import { MessageBus } from './bus/queue';
import { DatabaseManager } from './db/manager';
import { SessionStore } from './session/store';
import { MemoryStore } from './memory/store';
import { CronStore } from './cron/store';
import { CronService } from './cron/service';
import { HeartbeatService } from './heartbeat/service';
import { SkillsLoader } from './skills/loader';
import { ToolRegistry } from './tools/registry';
import { ReadFileTool, WriteFileTool, ListDirTool } from './tools/filesystem';
import { ExecTool } from './tools/shell';
import { WebSearchTool, WebFetchTool } from './tools/web';
import { MessageTool } from './tools/message';
import { createProviderRegistry } from './providers/registry';
import { AgentLoop } from './agent/loop';
import { ChannelManager } from './channels/manager';
import { FeishuChannel } from './channels/feishu';
import { QQChannel } from './channels/qq';
import { EmailChannel } from './channels/email';
import { loadConfig, expandPath } from './config/loader';
import { logger } from './utils/logger';

/** 应用实例 */
export interface App {
  start(): Promise<void>;
  stop(): Promise<void>;
  getRunningChannels(): string[];
  getProviderStatus(): string;
  getCronCount(): number;
  listCronJobs(): Array<{ id: string; name: string; scheduleKind: string; scheduleValue?: string }>;
}

/**
 * 创建应用实例
 */
export async function createApp(configPath?: string): Promise<App> {
  // 加载配置
  const config = loadConfig(configPath);
  const workspace = expandPath(config.agents.defaults.workspace);

  // 初始化容器
  const container = new Container();

  // 注册基础设施
  container.singleton('config', () => config);
  container.singleton('eventBus', () => eventBus);
  container.singleton('messageBus', () => new MessageBus());

  // 初始化数据库
  const dbManager = new DatabaseManager();
  dbManager.init();
  container.singleton('dbManager', () => dbManager);

  // 注册存储
  container.singleton('sessionStore', () => new SessionStore(dbManager.getSessionsDb()));
  container.singleton('memoryStore', () => new MemoryStore(dbManager.getMemoryDb(), workspace));
  container.singleton('cronStore', () => new CronStore(dbManager.getCronDb()));

  // 注册 Provider
  const provider = createProviderRegistry(config.providers);
  container.singleton('provider', () => provider);

  // 注册工具
  container.singleton('toolRegistry', () => {
    const registry = new ToolRegistry();
    registry.register(new ReadFileTool());
    registry.register(new WriteFileTool());
    registry.register(new ListDirTool());
    registry.register(new ExecTool(workspace));
    registry.register(new WebSearchTool());
    registry.register(new WebFetchTool());
    registry.register(new MessageTool());
    return registry;
  });

  // 注册服务
  const messageBus = container.resolve('messageBus') as MessageBus;
  const cronStore = container.resolve('cronStore') as CronStore;

  container.singleton('cronService', () => new CronService(cronStore, async (job) => {
    // 执行 Cron 任务
    logger.info(`执行 Cron 任务: ${job.name}`);
    return null;
  }));

  container.singleton('heartbeatService', () => new HeartbeatService(
    async (prompt) => {
      // 调用 Agent
      return 'HEARTBEAT_OK';
    },
    { intervalMs: 30 * 60 * 1000, workspace }
  ));

  // 注册通道
  const channelManager = new ChannelManager();
  
  if (config.channels.feishu?.enabled) {
    channelManager.register(new FeishuChannel(messageBus, config.channels.feishu));
  }
  // ... 其他通道

  container.singleton('channelManager', () => channelManager);

  // 注册 Agent
  const sessionStore = container.resolve('sessionStore') as SessionStore;
  const memoryStore = container.resolve('memoryStore') as MemoryStore;
  const toolRegistry = container.resolve('toolRegistry') as ToolRegistry;

  container.singleton('agent', () => new AgentLoop(
    messageBus,
    provider,
    sessionStore,
    memoryStore,
    toolRegistry,
    {
      workspace,
      model: config.agents.defaults.model,
      maxIterations: config.agents.defaults.maxToolIterations,
    }
  ));

  // 返回应用接口
  const agent = container.resolve('agent') as AgentLoop;
  const cronService = container.resolve('cronService') as CronService;
  const heartbeatService = container.resolve('heartbeatService') as HeartbeatService;

  return {
    async start(): Promise<void> {
      await channelManager.startAll();
      cronService.start();
      heartbeatService.start();
      agent.run();
      logger.info('microbot 已启动');
    },

    async stop(): Promise<void> {
      agent.stop();
      cronService.stop();
      heartbeatService.stop();
      await channelManager.stopAll();
      dbManager.close();
      logger.info('microbot 已停止');
    },

    getRunningChannels(): string[] {
      return channelManager.getRunningChannels();
    },

    getProviderStatus(): string {
      return provider.getDefaultModel();
    },

    getCronCount(): number {
      return cronService.listJobs().length;
    },

    listCronJobs() {
      return cronService.listJobs().map(j => ({
        id: j.id,
        name: j.name,
        scheduleKind: j.scheduleKind,
        scheduleValue: j.scheduleValue,
      }));
    },
  };
}
```

**行数**: ~130 行

---

### 3. package.json

**职责**: 包配置

```json
{
  "name": "microbot",
  "version": "1.0.0",
  "type": "module",
  "bin": {
    "microbot": "./src/cli.ts"
  },
  "scripts": {
    "dev": "bun run src/cli.ts start",
    "start": "bun run src/cli.ts start",
    "test": "bun test",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "ai": "^6.0.86",
    "js-yaml": "^4.1.1",
    "mitt": "^3.0.1",
    "pino": "^10.3.1",
    "zod": "^4.3.6",
    "@larksuiteoapi/node-sdk": "^1.59.0",
    "imapflow": "^1.2.9",
    "nodemailer": "^8.0.1",
    "cron-schedule": "^6.0.0",
    "gray-matter": "^4.0.3"
  },
  "devDependencies": {
    "@types/bun": "latest",
    "typescript": "^5.9.3"
  }
}
```

---

## 任务清单

| # | 任务 | 文件 | 行数 |
|---|------|------|------|
| 1 | 实现 CLI 命令 | `src/cli.ts` | ~100 |
| 2 | 实现入口和模块组装 | `src/index.ts` | ~130 |
| 3 | 配置 package.json | `package.json` | - |

## 验收标准

- [ ] `microbot start` 可以启动服务
- [ ] `microbot status` 显示状态
- [ ] `microbot cron list` 列出任务
- [ ] 所有模块正确组装
- [ ] 信号处理正常（SIGINT/SIGTERM）

## 完成标志

完成本阶段后，microbot 项目实施完毕，可以进行集成测试。
