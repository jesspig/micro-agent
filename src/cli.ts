#!/usr/bin/env bun

/**
 * microbot CLI 入口
 */

export async function runCli(): Promise<void> {
  console.log('microbot CLI - 开发中...');
}

// 直接运行时执行
if (import.meta.main) {
  runCli();
}
