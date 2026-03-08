/**
 * 黑板测试
 */

import { describe, it, expect } from 'bun:test';
import { BlackboardImpl, createBlackboard } from '../runtime/kernel/orchestrator/blackboard';
import type { ToolResult } from '../types/tool';
import type { BlackboardSnapshot } from '../types/blackboard';

describe('Blackboard', () => {
  describe('基础操作', () => {
    it('应该正确创建黑板实例', () => {
      const blackboard = createBlackboard(10);
      
      expect(blackboard.id).toBeDefined();
      expect(blackboard.sessionState.maxIterations).toBe(10);
      expect(blackboard.sessionState.iterations).toBe(0);
      expect(blackboard.reasoningChain).toEqual([]);
      expect(blackboard.actionHistory).toEqual([]);
      expect(blackboard.observations).toEqual([]);
    });

    it('应该正确添加推理步骤', () => {
      const blackboard = new BlackboardImpl(5);
      
      const id = blackboard.addReasoningStep('我需要先搜索用户信息', 0.9);
      
      expect(id).toBeDefined();
      expect(blackboard.reasoningChain.length).toBe(1);
      
      const lastThought = blackboard.getLastThought();
      expect(lastThought?.thought).toBe('我需要先搜索用户信息');
      expect(lastThought?.confidence).toBe(0.9);
      expect(lastThought?.state).toBe('thinking');
    });

    it('应该正确添加行动记录', () => {
      const blackboard = new BlackboardImpl();
      
      const actionId = blackboard.addAction({
        id: 'tc-1',
        name: 'search',
        arguments: { query: 'user info' },
      });
      
      expect(actionId).toBeDefined();
      expect(blackboard.actionHistory.length).toBe(1);
      
      const lastAction = blackboard.getLastAction();
      expect(lastAction?.toolName).toBe('search');
      expect(lastAction?.toolCallId).toBe('tc-1');
      expect(lastAction?.state).toBe('pending');
    });

    it('应该正确添加观察结果', () => {
      const blackboard = new BlackboardImpl();
      
      // 先添加行动
      const actionId = blackboard.addAction({
        id: 'tc-1',
        name: 'search',
        arguments: { query: 'user info' },
      });
      
      // 添加观察
      const result: ToolResult = {
        content: [{ type: 'text', text: 'Found: user@example.com' }],
        isError: false,
      };
      
      const obsId = blackboard.addObservation(actionId, result, '找到用户信息');
      
      expect(obsId).toBeDefined();
      expect(blackboard.observations.length).toBe(1);
      
      const lastObs = blackboard.getLastObservation();
      expect(lastObs?.summary).toBe('找到用户信息');
      expect(lastObs?.result.isError).toBe(false);
      
      // 验证行动状态已更新
      const action = blackboard.getLastAction();
      expect(action?.state).toBe('completed');
    });

    it('应该正确处理错误结果', () => {
      const blackboard = new BlackboardImpl();
      
      const actionId = blackboard.addAction({
        id: 'tc-1',
        name: 'search',
        arguments: { query: 'user info' },
      });
      
      const errorResult: ToolResult = {
        content: [{ type: 'text', text: '搜索失败' }],
        isError: true,
      };
      
      blackboard.addObservation(actionId, errorResult);
      
      const action = blackboard.getLastAction();
      expect(action?.state).toBe('failed');
    });
  });

  describe('查询操作', () => {
    it('应该正确查找相似观察', () => {
      const blackboard = new BlackboardImpl();
      
      const actionId = blackboard.addAction({
        id: 'tc-1',
        name: 'search',
        arguments: { query: 'test' },
      });
      
      blackboard.addObservation(actionId, {
        content: [{ type: 'text', text: 'user@example.com' }],
      }, '用户邮箱');
      
      const similar = blackboard.findSimilarObservations('user');
      expect(similar.length).toBe(1);
      
      const noMatch = blackboard.findSimilarObservations('xyz');
      expect(noMatch.length).toBe(0);
    });

    it('应该正确按工具名获取行动记录', () => {
      const blackboard = new BlackboardImpl();
      
      blackboard.addAction({ id: 'tc-1', name: 'search', arguments: {} });
      blackboard.addAction({ id: 'tc-2', name: 'read', arguments: {} });
      blackboard.addAction({ id: 'tc-3', name: 'search', arguments: {} });
      
      const searchActions = blackboard.getActionsByTool('search');
      expect(searchActions.length).toBe(2);
      
      const readActions = blackboard.getActionsByTool('read');
      expect(readActions.length).toBe(1);
    });
  });

  describe('状态管理', () => {
    it('应该正确增加迭代次数', () => {
      const blackboard = new BlackboardImpl(3);
      
      expect(blackboard.sessionState.iterations).toBe(0);
      
      const iter1 = blackboard.incrementIteration();
      expect(iter1).toBe(1);
      expect(blackboard.sessionState.iterations).toBe(1);
      
      const iter2 = blackboard.incrementIteration();
      expect(iter2).toBe(2);
    });

    it('应该正确检查最大迭代', () => {
      const blackboard = new BlackboardImpl(2);
      
      expect(blackboard.isMaxIterations()).toBe(false);
      
      blackboard.incrementIteration();
      expect(blackboard.isMaxIterations()).toBe(false);
      
      blackboard.incrementIteration();
      expect(blackboard.isMaxIterations()).toBe(true);
    });

    it('应该正确记录错误', () => {
      const blackboard = new BlackboardImpl();
      
      const errorId = blackboard.recordError(new Error('测试错误'), '执行工具时');
      
      expect(errorId).toBeDefined();
      expect(blackboard.getErrorCount()).toBe(1);
      
      const errors = blackboard.errors;
      expect(errors[0].error.message).toBe('测试错误');
      expect(errors[0].context).toBe('执行工具时');
    });
  });

  describe('快照操作', () => {
    it('应该正确创建和恢复快照', () => {
      const blackboard = new BlackboardImpl(5);
      
      // 添加一些数据
      blackboard.addReasoningStep('思考中...');
      blackboard.addAction({ id: 'tc-1', name: 'search', arguments: {} });
      blackboard.incrementIteration();
      
      // 创建快照
      const snapshot = blackboard.createSnapshot();
      
      expect(snapshot.reasoningChain.length).toBe(1);
      expect(snapshot.actionHistory.length).toBe(1);
      expect(snapshot.sessionState.iterations).toBe(1);
      
      // 修改黑板
      blackboard.addReasoningStep('更多思考');
      blackboard.incrementIteration();
      
      expect(blackboard.reasoningChain.length).toBe(2);
      expect(blackboard.sessionState.iterations).toBe(2);
      
      // 从快照恢复
      blackboard.restoreFromSnapshot(snapshot);
      
      expect(blackboard.reasoningChain.length).toBe(1);
      expect(blackboard.sessionState.iterations).toBe(1);
    });
  });

  describe('工具结果缓存', () => {
    it('应该正确缓存和获取工具结果', () => {
      const blackboard = new BlackboardImpl();
      
      const result: ToolResult = {
        content: [{ type: 'text', text: 'cached result' }],
      };
      
      blackboard.cacheToolResult('tc-1', result);
      
      const cached = blackboard.getCachedToolResult('tc-1');
      expect(cached).toEqual(result);
      
      const notFound = blackboard.getCachedToolResult('tc-999');
      expect(notFound).toBeUndefined();
    });
  });

  describe('重置操作', () => {
    it('应该正确重置黑板', () => {
      const blackboard = new BlackboardImpl(5);
      
      blackboard.addReasoningStep('思考');
      blackboard.addAction({ id: 'tc-1', name: 'search', arguments: {} });
      blackboard.incrementIteration();
      blackboard.recordError(new Error('错误'));
      
      expect(blackboard.reasoningChain.length).toBe(1);
      expect(blackboard.actionHistory.length).toBe(1);
      expect(blackboard.sessionState.iterations).toBe(1);
      expect(blackboard.errors.length).toBe(1);
      
      blackboard.reset();
      
      expect(blackboard.reasoningChain.length).toBe(0);
      expect(blackboard.actionHistory.length).toBe(0);
      expect(blackboard.sessionState.iterations).toBe(0);
      expect(blackboard.errors.length).toBe(0);
      // 保留最大迭代次数设置
      expect(blackboard.sessionState.maxIterations).toBe(5);
    });
  });
});
