---
name: skill-creator
description: 创建或更新 Agent Skills。当需要设计、构建或打包技能时使用，包括编写 SKILL.md、创建脚本和资源文件。
---

# Skill Creator

本技能提供创建有效技能的指南和工具。

## 关于 Skills

Skills 是模块化、自包含的包，通过提供专业知识、工作流和工具来扩展 Agent 的能力。可以将其视为特定领域或任务的"入职指南"——它们将通用 Agent 转变为具备特定领域知识的专业 Agent。

### Skills 提供什么

1. **专业工作流** - 特定领域的多步骤流程
2. **工具集成** - 处理特定文件格式或 API 的指南
3. **领域知识** - 公司特定知识、数据结构、业务逻辑
4. **捆绑资源** - 用于复杂和重复任务的脚本、参考文档和资源

## 核心原则

### 简洁至上

上下文窗口是公共资源。Skills 与其他内容共享上下文：系统提示词、对话历史、其他 Skills 的元数据和实际用户请求。

**默认假设：Agent 已经很聪明。** 只添加 Agent 不具备的知识。挑战每条信息："Agent 真的需要这个解释吗？"和"这段文字值得它的 token 成本吗？"

优先使用简洁示例而非冗长解释。

### 设置适当的自由度

根据任务的脆弱性和可变性匹配具体程度：

**高自由度（文本指令）**：当多种方法有效、决策依赖上下文或启发式方法指导时使用。

**中自由度（伪代码或带参数的脚本）**：当存在首选模式、允许一些变化或配置影响行为时使用。

**低自由度（具体脚本、少量参数）**：当操作脆弱易出错、一致性关键或必须遵循特定顺序时使用。

### Skill 结构

每个 Skill 由必需的 SKILL.md 文件和可选的捆绑资源组成：

```
skill-name/
├── SKILL.md (必需)
│   ├── YAML frontmatter 元数据 (必需)
│   │   ├── name: (必需)
│   │   └── description: (必需)
│   └── Markdown 指令 (必需)
└── 捆绑资源 (可选)
    ├── scripts/          - 可执行代码 (Python/Bash/TypeScript 等)
    ├── references/       - 文档，按需加载到上下文
    └── assets/           - 输出中使用的文件（模板、图标、字体等）
```

#### SKILL.md (必需)

每个 SKILL.md 包含：

- **Frontmatter** (YAML)：包含 `name` 和 `description` 字段。这是 Agent 判断何时使用技能的唯一依据，因此清晰全面地描述技能是什么、何时使用非常重要。
- **Body** (Markdown)：使用技能及其捆绑资源的指令。仅在技能触发后加载。

#### 捆绑资源 (可选)

##### scripts/

可执行代码，用于需要确定性可靠性或重复编写的任务。

- **何时包含**：当相同代码被重复编写或需要确定性可靠性时
- **示例**：`scripts/rotate_pdf.ts` 用于 PDF 旋转任务
- **好处**：节省 token、确定性高、无需加载到上下文即可执行
- **运行方式**：`bun scripts/xxx.ts`

##### references/

文档和参考材料，按需加载到上下文中。

- **何时包含**：Agent 工作时应参考的文档
- **示例**：`references/schema.md` 数据结构文档、`references/api_docs.md` API 规范
- **最佳实践**：如果文件较大（>10k 词），在 SKILL.md 中包含 grep 搜索模式

##### assets/

不加载到上下文，而是用于 Agent 产出输出的文件。

- **何时包含**：技能需要用于最终输出的文件时
- **示例**：`assets/logo.png` 品牌资产、`assets/template.pptx` 演示模板

### 渐进式披露设计原则

Skills 使用三级加载系统高效管理上下文：

1. **元数据 (name + description)** - 始终在上下文中 (~100 词)
2. **SKILL.md 正文** - 技能触发时加载 (<5k 词)
3. **捆绑资源** - Agent 按需使用（无限制，因为脚本可无需加载到上下文执行）

## Skill 存放位置

用户创建的技能存放在 `~/.micro-agent/skills/` 目录：

```
~/.micro-agent/skills/
├── my-skill/
│   ├── SKILL.md
│   └── scripts/
└── another-skill/
    ├── SKILL.md
    └── references/
```

内置技能位于项目 `extensions/skills/` 目录，用户技能优先级高于内置技能。

## Skill 创建流程

### 命名规范

- 仅使用小写字母、数字和连字符
- 名称长度不超过 64 个字符
- 优先使用简短、动词引导的短语描述动作
- 技能文件夹名称与技能名称完全一致

### 步骤

1. **理解技能** - 通过具体用例理解技能如何使用
2. **规划资源** - 分析需要哪些 scripts、references、assets
3. **初始化技能** - 运行初始化脚本
4. **编辑技能** - 实现资源并编写 SKILL.md
5. **验证技能** - 运行验证脚本检查结构
6. **迭代改进** - 基于实际使用反馈优化

## 脚本工具

### 初始化技能

```bash
# 基础用法
bun <skill-dir>/scripts/init_skill.ts <skill-name> --path <output-directory>

# 创建到用户技能目录
bun <skill-dir>/scripts/init_skill.ts my-skill --path ~/.micro-agent/skills

# 创建带脚本的技能
bun <skill-dir>/scripts/init_skill.ts my-skill --path ~/.micro-agent/skills --resources scripts

# 创建完整资源的技能
bun <skill-dir>/scripts/init_skill.ts my-skill --path ~/.micro-agent/skills --resources scripts,references,assets --examples
```

### 打包技能

```bash
# 打包技能为 .skill 文件
bun <skill-dir>/scripts/package_skill.ts ~/.micro-agent/skills/my-skill

# 指定输出目录
bun <skill-dir>/scripts/package_skill.ts ~/.micro-agent/skills/my-skill ./dist
```

### 验证技能

```bash
bun <skill-dir>/scripts/quick_validate.ts ~/.micro-agent/skills/my-skill
```

## Frontmatter 规范

```yaml
---
name: skill-name
description: 技能描述，包含何时使用。这是触发技能的主要机制。
---
```

**description 要点**：
- 包含技能做什么以及具体触发场景
- 所有"何时使用"信息放在这里，而非正文
- 示例：`系统信息工具 - 获取 CPU/内存/磁盘等信息。当用户询问系统状态、性能监控或资源使用情况时使用。`

## microAgent 扩展字段

microAgent 字段支持额外的 frontmatter：

```yaml
---
name: my-skill
description: 技能描述
always: true                    # 自动加载完整内容到 prompt
dependencies:                   # 依赖列表
  - bun>=1.0
compatibility: bun              # 兼容性要求
allowed-tools: []               # 预批准工具列表
metadata:                       # 元数据
  requires:
    bins: [gh, git]             # 需要的 CLI 工具
    env: [GITHUB_TOKEN]         # 需要的环境变量
---
```
