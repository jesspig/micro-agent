/**
 * ACP 命令
 *
 * 启动 ACP (Agent Client Protocol) 服务器。
 */

import { getLogger } from '@logtape/logtape';
import { ACPServer, createACPServer } from '@microbot/server';
import { ACPAdapter, createACPAdapter } from '@microbot/providers/acp';
import type { ToolRegistryLike } from '@microbot/providers/acp';
import type { LLMProvider, LLMMessage } from '@microbot/providers';
import type { ModelConfig } from '@microbot/config';

const log = getLogger(['cli', 'acp']);

/** ACP 命令配置 */
export interface ACPCommandConfig {
  /** 工作目录 */
  cwd: string;
  /** LLM Provider */
  provider: LLMProvider;
  /** 工具注册表 */
  toolRegistry: ToolRegistryLike;
  /** 默认模型 */
  defaultModel?: {
    providerId: string;
    modelId: string;
  };
}

/**
 * 运行 ACP 命令
 */
export async function runACPCommand(config: ACPCommandConfig): Promise<void> {
  log.info('启动 ACP 服务器: cwd={cwd}', { cwd: config.cwd });

  // 创建 ACP 连接（通过 stdin/stdout）
  const connection = {
    sendText: async (sessionId: string, text: string) => {
      log.debug('发送文本: session={sessionId}', { sessionId });
    },
    sendReasoning: async (sessionId: string, reasoning: string) => {
      log.debug('发送推理: session={sessionId}', { sessionId });
    },
    sendToolPending: async () => {},
    sendToolInProgress: async () => {},
    sendToolCompleted: async () => {},
    sendToolError: async () => {},
    sendUsage: async () => {},
    sendComplete: async () => {},
    requestPermission: async () => 'accept',
    sendImage: async () => {},
    sendResourceLink: async () => {},
    sendResource: async () => {},
  };

  // 创建 ACP 适配器
  const adapter = createACPAdapter({
    serverVersion: 'microbot-0.2.0',
    protocolVersion: '0.1.0',
    connection,
    provider: config.provider,
    toolRegistry: config.toolRegistry,
    workspace: config.cwd,
  });

  // 创建 ACP 服务器
  const server = createACPServer({
    agent: adapter,
    serverVersion: 'microbot-0.2.0',
  });

  // 启动服务器
  await server.start();
}

/** Yargs 命令定义类型 */
interface YargsCommand {
  command: string;
  describe: string;
  builder: (yargs: unknown) => unknown;
  handler: (args: unknown) => Promise<void>;
}

/** Yargs 链式接口 */
interface YargsLike {
  option: (name: string, config: unknown) => YargsLike;
}

/**
 * ACP 命令定义
 */
export const acpCommand: YargsCommand = {
  command: 'acp',
  describe: '启动 ACP (Agent Client Protocol) 服务器',
  builder: (yargs: unknown) => {
    return (yargs as YargsLike).option('cwd', {
      describe: '工作目录',
      type: 'string',
      default: process.cwd(),
    });
  },
  handler: async (args: unknown) => {
    console.log('ACP 命令需要 LLM Provider 和工具注册表配置');
    console.log('请通过程序化方式调用 runACPCommand');
  },
};
