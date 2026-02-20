# 快速开始

## 安装

```bash
# 克隆项目
git clone https://github.com/jesspig/microbot.git
cd microbot

# 安装依赖
bun install
```

## 配置

### 1. 创建配置文件

```bash
mkdir -p ~/.microbot
cp workspace/settings.yaml ~/.microbot/settings.yaml
```

### 2. 配置 LLM

编辑 `~/.microbot/settings.yaml`：

```yaml
providers:
  deepseek:
    baseUrl: https://api.deepseek.com/v1
    apiKey: ${DEEPSEEK_API_KEY}
    models:
      - deepseek-chat
```

或使用本地 Ollama：

```yaml
providers:
  ollama:
    baseUrl: http://localhost:11434/v1
    models:
      - qwen3
```

### 3. 配置飞书通道

#### 3.1 创建飞书应用

1. 访问 [飞书开放平台](https://open.feishu.cn/) 并登录
2. 进入「开发者后台」→「创建企业自建应用」
3. 填写应用名称和描述

#### 3.2 配置权限

在「权限管理」中添加以下权限：

| 权限 | 用途 |
|------|------|
| `im:message` | 接收和发送消息 |
| `im:message:send_as_bot` | 以应用身份发消息 |
| `im:resource` | 处理图片和文件 |

#### 3.3 配置事件订阅

1. 进入「事件订阅」
2. 选择「使用长连接接收事件」
3. 添加事件：`im.message.receive_v1`

#### 3.4 获取凭证

在「凭证与基础信息」获取 App ID 和 App Secret。

#### 3.5 更新配置

```yaml
channels:
  feishu:
    enabled: true
    appId: cli_xxxxxxxxxxxx
    appSecret: xxxxxxxxxxxxxxxxxxxxxxxx
    allowFrom: []  # 空数组允许所有人
```

#### 3.6 发布应用

在「版本管理与发布」创建版本并发布，通过审核后即可使用。

## 运行

```bash
bun run start
```

启动后向飞书机器人发送消息测试。

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
│           └── skill/           # 技能系统
├── extensions/          # 扩展实现
│   ├── tool/           # 工具扩展
│   └── channel/        # 通道扩展
├── skills/             # 技能目录
│   ├── sysinfo/        # 系统信息
│   └── time/           # 时间处理
└── workspace/          # 工作空间配置
```
