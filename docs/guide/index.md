# 快速开始

## 安装

```bash
# 克隆项目
git clone https://github.com/jesspig/microbot.git
cd microbot

# 安装依赖
bun install

# 创建配置文件
cp workspace/USER.md ~/.microbot/settings.yaml
```

## 配置

编辑 `~/.microbot/settings.yaml`：

```yaml
agents:
  workspace: ~/.microbot/workspace
  models:
    chat: deepseek-chat
    check: deepseek-chat

providers:
  deepseek:
    baseUrl: https://api.deepseek.com/v1
    apiKey: ${DEEPSEEK_API_KEY}
    models:
      - deepseek-chat
      - deepseek-reasoner

channels:
  feishu:
    enabled: true
    appId: ${APP_ID}
    appSecret: ${APP_SECRET}
```

## 运行

```bash
# 开发模式
bun run dev

# 生产模式
bun run start
```

## 项目结构

```
microbot/
├── packages/
│   └── core/           # 核心 SDK
│       └── src/
│           ├── container.ts     # 依赖注入容器
│           ├── agent/           # Agent 循环
│           ├── providers/       # LLM 提供商
│           ├── tool/            # 工具系统
│           ├── channel/         # 消息通道
│           ├── storage/         # 存储层
│           ├── skill/            # 技能系统
│           └── service/         # 服务（定时任务、心跳）
├── extensions/          # 扩展实现
│   ├── tool/           # 工具扩展
│   ├── skill/          # 技能扩展
│   └── channel/        # 通道扩展
└── workspace/         # 工作空间配置
```
