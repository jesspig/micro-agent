# API 参考

## Core 模块

### Container

```typescript
import { Container, container } from '@microbot/sdk';

// 注册瞬态依赖
container.register('service', () => new Service());

// 注册单例
container.singleton('db', () => new Database());

// 解析依赖
const service = container.resolve<Service>('service');
```

### EventBus

```typescript
import { EventBus, eventBus } from '@microbot/sdk';

// 订阅事件
eventBus.on('message:received', (msg) => {
  console.log(msg);
});

// 发布事件
eventBus.emit('message:received', { content: 'hello' });
```

### HookSystem

```typescript
import { HookSystem, hookSystem } from '@microbot/sdk';

// 注册钩子
hookSystem.register('pre:chat', async (ctx) => {
  console.log('Before chat');
  return ctx;
});
```

## Provider 模块

```typescript
import { OpenAICompatibleProvider } from '@microbot/sdk/providers';

const provider = new OpenAICompatibleProvider({
  baseUrl: 'https://api.deepseek.com/v1',
  apiKey: 'your-key',
  model: 'deepseek-chat',
});

// 聊天
const response = await provider.chat([
  { role: 'user', content: 'Hello' }
]);
```

## Storage 模块

### SessionStore

```typescript
import { SessionStore } from '@microbot/sdk/storage';

const store = new SessionStore('~/.microbot/data');

// 添加消息
store.addMessage('channel:chatId', 'user', 'Hello');
store.addMessage('channel:chatId', 'assistant', 'Hi');

// 获取会话
const session = store.get('channel:chatId');
```

### MemoryStore

```typescript
import { MemoryStore } from '@microbot/sdk/storage';

const store = new MemoryStore('~/.microbot/data');

// 保存记忆
await store.save('key', '内容');

// 读取记忆
const content = await store.load('key');
```

### CronStore

```typescript
import { CronStore } from '@microbot/sdk/storage';

const store = new CronStore('~/.microbot/data');

// 添加任务
await store.add({
  id: 'task1',
  schedule: '0 9 * * *',
  enabled: true,
  action: 'notify',
});
```
