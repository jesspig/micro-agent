/**
 * 文件系统工具
 *
 * 提供安全的文件操作能力，限制在 workspace 目录内
 */

import { resolve, relative, join, dirname } from "node:path";
import { existsSync, statSync } from "node:fs";
import { readFile, writeFile, mkdir, readdir, unlink, rename } from "node:fs/promises";
import { BaseTool } from "../../runtime/tool/base.js";
import type { ToolParameterSchema, ToolResult } from "../../runtime/tool/types.js";
import { WORKSPACE_DIR } from "../shared/constants.js";
import { toolsLogger, createTimer, logMethodCall, logMethodReturn, logMethodError, sanitize } from "../shared/logger.js";

const MODULE_NAME = "filesystem";
const logger = toolsLogger();

// ============================================================================
// 类型定义
// ============================================================================

/** 列表项信息 */
interface ListItem {
  /** 名称 */
  name: string;
  /** 类型：file 或 directory */
  type: "file" | "directory";
  /** 大小（字节） */
  size: number | undefined;
  /** 修改时间 */
  modifiedAt: string | undefined;
}

// ============================================================================
// 安全路径工具
// ============================================================================

/**
 * 检查路径是否在指定 workspace 目录内
 * @param targetPath - 目标路径
 * @param workspaceDir - workspace 目录
 * @returns 是否安全
 */
function isPathSafe(targetPath: string, workspaceDir: string): boolean {
  try {
    // 解析绝对路径
    const absolutePath = resolve(targetPath);
    const workspacePath = resolve(workspaceDir);

    // 检查是否在 workspace 目录内
    const relativePath = relative(workspacePath, absolutePath);

    // 相对路径不应该以 .. 开头（表示在 workspace 之外）
    return !relativePath.startsWith("..") && !relativePath.startsWith("/");
  } catch {
    return false;
  }
}

/**
 * 获取安全的绝对路径
 * @param targetPath - 目标路径
 * @param workspaceDir - workspace 目录
 * @returns 安全的绝对路径
 * @throws 如果路径不安全
 */
function getSafePath(targetPath: string, workspaceDir: string): string {
  // 如果是相对路径，相对于 workspace 解析
  const absolutePath = targetPath.startsWith("/")
    ? targetPath
    : join(workspaceDir, targetPath);

  if (!isPathSafe(absolutePath, workspaceDir)) {
    throw new Error(`路径 "${targetPath}" 不在允许的 workspace 目录内`);
  }

  return absolutePath;
}

// ============================================================================
// 文件系统工具实现
// ============================================================================

/**
 * 文件系统工具
 *
 * 提供安全的文件操作能力，包括：
 * - read: 读取文件内容
 * - write: 写入文件
 * - edit: 编辑文件（搜索替换）
 * - list: 列出目录内容
 * - delete: 删除文件
 * - move: 移动/重命名文件
 */
export class FilesystemTool extends BaseTool<Record<string, unknown>> {
  readonly name = "filesystem";
  readonly description = `安全的文件系统操作工具，只能在 workspace 目录内操作。

支持的操作：
- read: 读取文件内容
- write: 写入文件（会自动创建目录）
- edit: 编辑文件（搜索替换）
- list: 列出目录内容
- delete: 删除文件
- move: 移动或重命名文件`;

  readonly parameters: ToolParameterSchema = {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["read", "write", "edit", "list", "delete", "move"],
        description: "操作类型",
      },
      path: {
        type: "string",
        description: "文件或目录路径（相对于 workspace 目录）",
      },
      content: {
        type: "string",
        description: "写入的内容（write 操作必需）",
      },
      search: {
        type: "string",
        description: "要搜索的文本（edit 操作必需）",
      },
      replace: {
        type: "string",
        description: "替换的文本（edit 操作必需）",
      },
      recursive: {
        type: "boolean",
        description: "是否递归列出子目录（list 操作可选，默认 false）",
      },
      destination: {
        type: "string",
        description: "目标路径（move 操作必需）",
      },
    },
    required: ["action", "path"],
  };

  /** 自定义 workspace 目录 */
  private readonly workspaceDir: string;

  /**
   * 创建文件系统工具实例
   * @param workspaceDir - 自定义 workspace 目录（默认为 WORKSPACE_DIR）
   */
  constructor(workspaceDir?: string) {
    super();
    this.workspaceDir = workspaceDir ?? WORKSPACE_DIR;
  }

  async execute(params: Record<string, unknown>): Promise<ToolResult> {
    const timer = createTimer();
    logMethodCall(logger, { method: "execute", module: MODULE_NAME, params: sanitize(params) as Record<string, unknown> });

    try {
      const action = this.readStringParam(params, "action", { required: true });
      const path = this.readStringParam(params, "path", { required: true });

      if (!action || !path) {
        const result = {
          content: "缺少必需参数: action 或 path",
          isError: true,
        };
        logMethodReturn(logger, { method: "execute", module: MODULE_NAME, result: sanitize(result), duration: timer() });
        return result;
      }

      logger.info("工具执行", { toolName: "filesystem", action, path });

      const safePath = getSafePath(path, this.workspaceDir);

      let result: ToolResult;
      switch (action) {
        case "read":
          result = await this.handleRead(safePath);
          break;
        case "write":
          result = await this.handleWrite(safePath, params);
          break;
        case "edit":
          result = await this.handleEdit(safePath, params);
          break;
        case "list":
          result = await this.handleList(safePath, params);
          break;
        case "delete":
          result = await this.handleDelete(safePath);
          break;
        case "move":
          result = await this.handleMove(safePath, params);
          break;
        default:
          result = {
            content: `未知的操作类型: ${action}`,
            isError: true,
          };
      }

      logMethodReturn(logger, { method: "execute", module: "filesystem", result: sanitize(result), duration: timer() });
      return result;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logMethodError(logger, { method: "execute", module: MODULE_NAME, error: { name: err.name, message: err.message, ...(err.stack ? { stack: err.stack } : {}) }, params: sanitize(params) as Record<string, unknown>, duration: timer() });
      return {
        content: `文件系统操作失败: ${err.message}`,
        isError: true,
      };
    }
  }

  // ============================================================================
  // 操作处理方法
  // ============================================================================

  /**
   * 读取文件内容
   */
  private async handleRead(path: string): Promise<ToolResult> {
    if (!existsSync(path)) {
      return {
        content: `文件不存在: ${path}`,
        isError: true,
      };
    }

    const content = await readFile(path, "utf-8");
    return {
      content,
      isError: false,
      metadata: {
        path,
        size: content.length,
      },
    };
  }

  /**
   * 写入文件
   */
  private async handleWrite(
    path: string,
    params: Record<string, unknown>
  ): Promise<ToolResult> {
    const content = this.readStringParam(params, "content");
    if (content === undefined) {
      return {
        content: "写入操作需要提供 content 参数",
        isError: true,
      };
    }

    // 确保目录存在
    const dir = dirname(path);
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true });
    }

    await writeFile(path, content, "utf-8");

    return {
      content: `文件写入成功: ${path}`,
      isError: false,
      metadata: {
        path,
        size: content.length,
      },
    };
  }

  /**
   * 编辑文件（搜索替换）
   */
  private async handleEdit(
    path: string,
    params: Record<string, unknown>
  ): Promise<ToolResult> {
    const search = this.readStringParam(params, "search");
    if (!search) {
      return {
        content: "edit 操作需要提供 search 参数",
        isError: true,
      };
    }

    if (!existsSync(path)) {
      return {
        content: `文件不存在: ${path}`,
        isError: true,
      };
    }

    const content = await readFile(path, "utf-8");

    if (!content.includes(search)) {
      return {
        content: `未找到搜索文本: "${search}"`,
        isError: true,
      };
    }

    // 计算替换次数
    const matches = content.split(search).length - 1;
    const replace = this.readStringParam(params, "replace") ?? "";
    const newContent = content.split(search).join(replace);

    await writeFile(path, newContent, "utf-8");

    return {
      content: `编辑成功: 替换了 ${matches} 处`,
      isError: false,
      metadata: {
        path,
        matches,
      },
    };
  }

  /**
   * 列出目录内容
   */
  private async handleList(
    path: string,
    params: Record<string, unknown>
  ): Promise<ToolResult> {
    if (!existsSync(path)) {
      return {
        content: `目录不存在: ${path}`,
        isError: true,
      };
    }

    const stats = statSync(path);
    if (!stats.isDirectory()) {
      return {
        content: `路径不是目录: ${path}`,
        isError: true,
      };
    }

    const recursive = this.readBooleanParam(params, "recursive");
    const items = await this.listDirectory(path, recursive);

    return {
      content: JSON.stringify(items, null, 2),
      isError: false,
      metadata: {
        path,
        count: items.length,
      },
    };
  }

  /**
   * 递归列出目录内容
   */
  private async listDirectory(dirPath: string, recursive: boolean): Promise<ListItem[]> {
    const entries = await readdir(dirPath, { withFileTypes: true });
    const items: ListItem[] = [];

    for (const entry of entries) {
      const fullPath = join(dirPath, entry.name);
      const isDirectory = entry.isDirectory();

      // 获取文件信息
      let size: number | undefined = undefined;
      let modifiedAt: string | undefined = undefined;

      try {
        const stats = statSync(fullPath);
        if (!isDirectory) {
          size = stats.size;
        }
        modifiedAt = stats.mtime.toISOString();
      } catch {
        // 忽略无法访问的文件
      }

      items.push({
        name: entry.name,
        type: isDirectory ? "directory" : "file",
        size: size,
        modifiedAt: modifiedAt,
      });

      // 递归处理子目录
      if (recursive && isDirectory) {
        const subItems = await this.listDirectory(fullPath, recursive);
        for (const subItem of subItems) {
          items.push({
            name: `${entry.name}/${subItem.name}`,
            type: subItem.type,
            size: subItem.size,
            modifiedAt: subItem.modifiedAt,
          });
        }
      }
    }

    return items;
  }

  /**
   * 删除文件
   */
  private async handleDelete(path: string): Promise<ToolResult> {
    if (!existsSync(path)) {
      return {
        content: `文件不存在: ${path}`,
        isError: true,
      };
    }

    const stats = statSync(path);
    if (stats.isDirectory()) {
      return {
        content: "不能删除目录，请使用文件路径",
        isError: true,
      };
    }

    await unlink(path);

    return {
      content: `文件删除成功: ${path}`,
      isError: false,
      metadata: {
        path,
      },
    };
  }

  /**
   * 移动/重命名文件
   */
  private async handleMove(
    source: string,
    params: Record<string, unknown>
  ): Promise<ToolResult> {
    const destination = this.readStringParam(params, "destination");
    if (!destination) {
      return {
        content: "move 操作需要提供 destination 参数",
        isError: true,
      };
    }

    if (!existsSync(source)) {
      return {
        content: `源文件不存在: ${source}`,
        isError: true,
      };
    }

    const destPath = getSafePath(destination, this.workspaceDir);

    // 确保目标目录存在
    const destDir = dirname(destPath);
    if (!existsSync(destDir)) {
      await mkdir(destDir, { recursive: true });
    }

    await rename(source, destPath);

    return {
      content: `文件移动成功: ${source} -> ${destPath}`,
      isError: false,
      metadata: {
        source,
        destination: destPath,
      },
    };
  }
}