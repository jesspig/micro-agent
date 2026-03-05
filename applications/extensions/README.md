# Extensions

扩展模块 - 工具、技能、通道的集合。

## 结构

```
applications/extensions/
├── channel/           # 通道扩展
│   └── feishu/       # 飞书通道
├── skills/            # 技能扩展
│   ├── doc-coauthoring/
│   ├── docx/
│   ├── pdf/
│   ├── pptx/
│   ├── xlsx/
│   └── ...
├── tool/              # 工具扩展
│   ├── filesystem/
│   ├── shell/
│   ├── web/
│   └── message/
└── tests/             # 测试
```

## 扩展类型

| 类型 | 说明 |
|------|------|
| Channel | 消息通道（飞书、钉钉等） |
| Skill | 技能模块（文档处理等） |
| Tool | 工具函数（文件、Shell、Web） |

## 测试

```bash
bun test applications/extensions/tests/
```
