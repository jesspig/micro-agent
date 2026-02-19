# Container - 依赖注入容器

## 概述

Container 是 Microbot 的核心，提供轻量级依赖注入能力。支持瞬态和单例两种模式。

## 使用方法

```typescript
import { Container, container } from '@microbot/sdk';

// 方式 1：使用全局容器
container.register('Service', () => new Service());
const service = container.resolve<Service>('Service');

// 方式 2：创建独立容器
const myContainer = new Container();
myContainer.register('Provider', () => new OpenAIProvider());
```

## API

### register

注册瞬态工厂，每次解析创建新实例：

```typescript
container.register<T>(token: string, factory: Factory<T>): void
```

### singleton

注册单例工厂，全局共享实例：

```typescript
container.singleton<T>(token: string, factory: Factory<T>): void
```

### resolve

解析依赖：

```typescript
container.resolve<T>(token: string): T
```

### has

检查依赖是否已注册：

```typescript
container.has(token: string): boolean
```

## 源码位置

`packages/core/src/container.ts`
