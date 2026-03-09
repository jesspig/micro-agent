#!/usr/bin/env bun

/**
 * MicroAgent CLI 入口
 */

import { runCli } from './cli';

// 直接运行时执行
if (import.meta.main) {
  runCli().catch((error) => {
    console.error('CLI 执行失败:', error);
    process.exit(1);
  });
}

export { runCli };
