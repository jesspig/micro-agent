/**
 * config 命令实现
 *
 * 生成默认配置文件到 workspace/.agent/
 * 复制模板文件
 */

import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdirSync, existsSync } from "node:fs";
import {
  MICRO_AGENT_DIR,
  WORKSPACE_DIR,
  AGENT_DIR,
  SESSIONS_DIR,
  LOGS_DIR,
  HISTORY_DIR,
  SKILLS_DIR,
} from "../../shared/constants.js";
import { getLogger } from "../../shared/logger.js";

// ============================================================================
// 常量定义
// ============================================================================

/** 模板目录（相对于当前文件） */
const TEMPLATES_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "templates"
);

/** 需要复制的模板文件（源文件 -> 目标文件） */
const TEMPLATE_FILES: Array<{ src: string; dest: string }> = [
  { src: "AGENTS.md", dest: "AGENTS.md" },
  { src: "SOUL.md", dest: "SOUL.md" },
  { src: "USER.md", dest: "USER.md" },
  { src: "TOOLS.md", dest: "TOOLS.md" },
  { src: "HEARTBEAT.md", dest: "HEARTBEAT.md" },
  { src: "MEMORY.md", dest: "MEMORY.md" },
  { src: "settings.example.yaml", dest: "settings.yaml" },
  { src: "mcp.json", dest: "mcp.json" },
];

// ============================================================================
// 辅助函数
// ============================================================================

/**
 * 复制文件
 * @param src - 源文件路径
 * @param dest - 目标文件路径
 * @returns 是否成功复制
 */
async function copyFile(src: string, dest: string): Promise<boolean> {
  const logger = getLogger();

  try {
    const srcFile = Bun.file(src);
    const exists = await srcFile.exists();

    if (!exists) {
      logger.warn(`模板文件不存在: ${src}`);
      return false;
    }

    const destFile = Bun.file(dest);
    const destExists = await destFile.exists();

    if (destExists) {
      logger.debug(`文件已存在，跳过: ${dest}`);
      return false;
    }

    // 读取源文件内容并写入目标
    const content = await srcFile.text();
    await Bun.write(dest, content);

    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`复制文件失败: ${src} -> ${dest}`, message);
    return false;
  }
}

// ============================================================================
// config 命令实现
// ============================================================================

/**
 * config 命令选项
 */
export interface ConfigOptions {
  /** 强制覆盖已存在的文件 */
  force?: boolean;
  /** 仅显示将要创建的文件 */
  dryRun?: boolean;
}

/**
 * config 命令结果
 */
export interface ConfigResult {
  /** 创建的目录列表 */
  directories: string[];
  /** 创建的文件列表 */
  files: string[];
  /** 跳过的文件列表 */
  skipped: string[];
  /** 错误列表 */
  errors: string[];
}

/**
 * 执行 config 命令
 *
 * @param options - 命令选项
 * @returns 执行结果
 */
export async function configCommand(
  options: ConfigOptions = {}
): Promise<ConfigResult> {
  const result: ConfigResult = {
    directories: [],
    files: [],
    skipped: [],
    errors: [],
  };

  console.log("\n🔧 正在初始化 MicroAgent 配置...\n");

  // 1. 创建目录结构
  const directories = [
    MICRO_AGENT_DIR,
    WORKSPACE_DIR,
    AGENT_DIR,
    SESSIONS_DIR,
    LOGS_DIR,
    HISTORY_DIR,
    SKILLS_DIR,
  ];

  console.log("📁 创建目录结构...");
  for (const dir of directories) {
    const exists = existsSync(dir);

    if (!exists) {
      if (options.dryRun) {
        console.log(`   [预览] 将创建目录: ${dir}`);
        result.directories.push(dir);
      } else {
        try {
          mkdirSync(dir, { recursive: true });
          console.log(`   ✓ 创建目录: ${dir}`);
          result.directories.push(dir);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          console.log(`   ✗ 创建目录失败: ${dir} - ${message}`);
          result.errors.push(`目录创建失败: ${dir} - ${message}`);
        }
      }
    } else {
      console.log(`   - 目录已存在: ${dir}`);
    }
  }

  // 2. 复制模板文件
  console.log("\n📄 复制模板文件...");
  for (const { src: srcFile, dest: destFile } of TEMPLATE_FILES) {
    const src = join(TEMPLATES_DIR, srcFile);
    const dest = join(AGENT_DIR, destFile);

    if (options.dryRun) {
      const destExists = await Bun.file(dest).exists();
      if (destExists && !options.force) {
        console.log(`   [预览] 将跳过已存在: ${destFile}`);
        result.skipped.push(destFile);
      } else {
        console.log(`   [预览] 将复制: ${srcFile} -> ${destFile}`);
        result.files.push(destFile);
      }
      continue;
    }

    const destExists = await Bun.file(dest).exists();

    if (destExists && !options.force) {
      console.log(`   - 文件已存在，跳过: ${destFile}`);
      result.skipped.push(destFile);
      continue;
    }

    const copied = await copyFile(src, dest);
    if (copied) {
      console.log(`   ✓ 已复制: ${srcFile} -> ${destFile}`);
      result.files.push(destFile);
    } else {
      result.skipped.push(destFile);
    }
  }

  // 3. 输出摘要
  console.log("\n" + "=".repeat(50));
  console.log("📊 初始化摘要");
  console.log("=".repeat(50));
  console.log(`   目录创建: ${result.directories.length}`);
  console.log(`   文件复制: ${result.files.length}`);
  console.log(`   跳过文件: ${result.skipped.length}`);
  console.log(`   错误数量: ${result.errors.length}`);

  if (result.files.length > 0) {
    console.log("\n✅ 配置初始化完成！");
    console.log(`\n配置目录: ${AGENT_DIR}`);
    console.log(`工作目录: ${WORKSPACE_DIR}`);
    console.log("\n下一步:");
    console.log("   1. 编辑 settings.yaml 配置 API Key");
    console.log("   2. 运行 'micro-agent start' 启动 Agent");
  } else if (result.skipped.length > 0) {
    console.log("\n⚠️  所有文件已存在，跳过创建。");
    console.log("   使用 --force 选项强制覆盖。");
  }

  console.log("");

  return result;
}

/**
 * 显示 config 命令帮助信息
 */
export function showConfigHelp(): void {
  console.log(`
micro-agent config - 生成默认配置文件

用法:
  micro-agent config [选项]

选项:
  --force, -f    强制覆盖已存在的文件
  --dry-run      仅显示将要创建的文件，不实际执行
  --help, -h     显示帮助信息

示例:
  micro-agent config              # 初始化配置
  micro-agent config --force      # 强制覆盖所有文件
  micro-agent config --dry-run    # 预览将要创建的文件
`);
}
