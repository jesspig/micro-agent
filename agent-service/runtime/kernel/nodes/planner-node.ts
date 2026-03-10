/**
 * Planner 节点
 *
 * 职责：
 * 1. 分析任务复杂度，判断是否需要分解
 * 2. 调用 LLM 分解任务为子任务
 * 3. 生成执行计划（拓扑排序 + 并行优化）
 * 4. 检测资源冲突
 */

import type { RunnableConfig } from "@langchain/core/runnables";
import type { AgentState, AgentStateUpdate } from "../state";
import type { LangGraphAgentConfig } from "../types";
import type { LLMProvider } from "../../../types/provider";
import { getLogger } from "@logtape/logtape";

const log = getLogger(["kernel", "planner-node"]);

// ============================================================================
// 类型定义
// ============================================================================

/** 子任务状态 */
export type SubTaskStatus = "pending" | "running" | "completed" | "failed" | "skipped";

/** 子任务定义（扩展版） */
export interface SubTask {
  /** 子任务 ID */
  id: string;
  /** 任务描述 */
  description: string;
  /** 依赖的任务 ID 列表 */
  dependencies: string[];
  /** 预估步骤数 */
  estimatedSteps: number;
  /** 是否可并行执行 */
  parallelizable: boolean;
  /** 所需资源列表 */
  resources: string[];
  /** 任务状态 */
  status: SubTaskStatus;
}

/** 执行计划 */
export interface ExecutionPlan {
  /** 计划 ID */
  id: string;
  /** 目标任务 */
  goal: string;
  /** 子任务列表 */
  subTasks: SubTask[];
  /** 执行顺序（每层可并行） */
  executionOrder: string[][];
  /** 当前执行层级 */
  currentLevel: number;
  /** 当前批次索引 */
  currentBatchIndex: number;
}

/** Planner 配置 */
export interface PlannerConfig {
  /** LLM Provider */
  llmProvider: LLMProvider;
  /** 默认模型 */
  defaultModel: string;
  /** 是否启用任务分解 */
  enableDecomposition: boolean;
  /** 最大子任务数 */
  maxSubTasks: number;
  /** 复杂度阈值（超过则分解） */
  complexityThreshold: number;
}

/** 分解评分结果 */
interface DecompositionScore {
  /** 总分 (0-100) */
  total: number;
  /** 关键词得分 */
  keywords: number;
  /** 长度得分 */
  length: number;
  /** 句子得分 */
  sentences: number;
}

// ============================================================================
// 任务分解器
// ============================================================================

/**
 * 任务分解器
 * 使用 LLM 将复杂任务分解为子任务
 */
export class TaskDecomposer {
  private readonly maxSubTasks: number;

  constructor(
    private llmProvider: LLMProvider,
    private model: string,
    config?: { maxSubTasks?: number }
  ) {
    this.maxSubTasks = config?.maxSubTasks ?? 10;
  }

  /**
   * 分解任务
   */
  async decompose(task: string, context?: string): Promise<SubTask[]> {
    const prompt = this.buildPrompt(task, context);
    
    const response = await this.llmProvider.chat(
      [{ role: "user", content: prompt }],
      undefined,
      this.model,
      { maxTokens: 2048, temperature: 0.3 }
    );

    return this.parseResponse(response.content, task);
  }

  /**
   * 构建分解提示词
   */
  private buildPrompt(task: string, context?: string): string {
    const contextSection = context ? `上下文：${context}\n\n` : "";
    
    return `${contextSection}你是任务分解专家。请将以下任务分解为可执行的子任务。

任务：${task}

分解要求：
1. 每个子任务独立、可执行
2. 标识子任务间的依赖关系
3. 每个子任务生成唯一 ID (task-1, task-2, ...)
4. 估计每个子任务所需步骤数
5. 标注是否可并行执行
6. 列出所需资源（如文件、工具等）
7. 最多 ${this.maxSubTasks} 个子任务

JSON 格式输出：
\`\`\`json
{
  "reasoning": "分解理由",
  "subTasks": [
    {
      "id": "task-1",
      "description": "任务描述",
      "dependencies": [],
      "estimatedSteps": 2,
      "parallelizable": true,
      "resources": ["file.txt"]
    }
  ]
}
\`\`\``;
  }

  /**
   * 解析 LLM 响应
   */
  private parseResponse(content: string, originalTask: string): SubTask[] {
    try {
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
      const jsonStr = jsonMatch ? jsonMatch[1] : content;
      const parsed = JSON.parse(jsonStr.trim());

      if (parsed.subTasks && Array.isArray(parsed.subTasks)) {
        return parsed.subTasks.slice(0, this.maxSubTasks).map((t: Record<string, unknown>, i: number) => ({
          id: (t.id as string) || `task-${i + 1}`,
          description: (t.description as string) || "",
          dependencies: (t.dependencies as string[]) || [],
          estimatedSteps: (t.estimatedSteps as number) ?? 1,
          parallelizable: (t.parallelizable as boolean) ?? true,
          resources: (t.resources as string[]) || [],
          status: "pending" as SubTaskStatus,
        }));
      }
    } catch (error) {
      log.warn("[TaskDecomposer] JSON 解析失败，使用简单分解", { error: String(error) });
    }

    return this.simpleDecompose(originalTask);
  }

  /**
   * 简单分解（回退方案）
   */
  private simpleDecompose(task: string): SubTask[] {
    const sentences = task.split(/[。；\n]/).filter((s) => s.trim().length > 5);
    
    if (sentences.length <= 1) {
      return [{
        id: "task-1",
        description: task,
        dependencies: [],
        estimatedSteps: 1,
        parallelizable: false,
        resources: [],
        status: "pending" as SubTaskStatus,
      }];
    }

    return sentences.slice(0, this.maxSubTasks).map((s, i) => ({
      id: `task-${i + 1}`,
      description: s.trim(),
      dependencies: i > 0 ? [`task-${i}`] : [],
      estimatedSteps: 1,
      parallelizable: false,
      resources: [],
      status: "pending" as SubTaskStatus,
    }));
  }
}

// ============================================================================
// 计划生成器
// ============================================================================

/**
 * 计划生成器
 * 使用拓扑排序生成执行顺序，检测资源冲突
 */
export class PlanGenerator {
  /**
   * 生成执行计划
   * 使用 Kahn 算法进行拓扑排序
   */
  async generate(subTasks: SubTask[]): Promise<string[][]> {
    if (subTasks.length === 0) return [];

    // 构建入度表
    const inDegree = new Map<string, number>();
    const adjacency = new Map<string, string[]>();

    for (const task of subTasks) {
      inDegree.set(task.id, 0);
      adjacency.set(task.id, []);
    }

    // 构建邻接表和入度
    for (const task of subTasks) {
      for (const depId of task.dependencies) {
        const adj = adjacency.get(depId) || [];
        adj.push(task.id);
        adjacency.set(depId, adj);
        inDegree.set(task.id, (inDegree.get(task.id) || 0) + 1);
      }
    }

    // Kahn 算法：按层级拓扑排序
    const levels: string[][] = [];
    const queue: string[] = [];

    // 入度为 0 的任务入队
    for (const [id, degree] of inDegree) {
      if (degree === 0) queue.push(id);
    }

    while (queue.length > 0) {
      const currentLevel: string[] = [];
      const nextQueue: string[] = [];

      for (const taskId of queue) {
        currentLevel.push(taskId);

        // 更新后继任务的入度
        const adj = adjacency.get(taskId) || [];
        for (const nextId of adj) {
          const newDegree = (inDegree.get(nextId) || 1) - 1;
          inDegree.set(nextId, newDegree);
          if (newDegree === 0) nextQueue.push(nextId);
        }
      }

      levels.push(this.optimizeLevel(currentLevel, subTasks));
      queue.length = 0;
      queue.push(...nextQueue);
    }

    return levels;
  }

  /**
   * 优化单层任务顺序
   * 检测资源冲突，将冲突任务分离
   */
  private optimizeLevel(taskIds: string[], subTasks: SubTask[]): string[] {
    if (taskIds.length <= 1) return taskIds;

    // 检测资源冲突
    const resourceMap = new Map<string, string[]>();
    
    for (const taskId of taskIds) {
      const task = subTasks.find((t) => t.id === taskId);
      if (!task) continue;

      for (const resource of task.resources) {
        const existing = resourceMap.get(resource) || [];
        existing.push(taskId);
        resourceMap.set(resource, existing);
      }
    }

    // 如果有资源冲突，返回顺序执行（每次只执行一个）
    for (const [, tasks] of resourceMap) {
      if (tasks.length > 1) {
        log.debug("[PlanGenerator] 检测到资源冲突", { tasks });
        // 标记冲突任务为不可并行
        for (const t of subTasks) {
          if (tasks.includes(t.id)) {
            t.parallelizable = false;
          }
        }
      }
    }

    return taskIds;
  }
}

// ============================================================================
// 复杂度评估
// ============================================================================

/** 复杂度关键词 */
const COMPLEXITY_KEYWORDS = [
  "然后", "接着", "最后", "首先", "其次",
  "同时", "并行", "依次", "分别", "多个",
  "步骤", "流程", "阶段", "任务", "分解",
  "完成后", "之前", "之后", "等待", "依赖",
  "then", "after", "before", "next", "finally",
  "first", "second", "parallel", "sequential",
];

/**
 * 计算任务复杂度评分
 * 多维度评分：关键词40% + 长度30% + 句子30%
 */
export function checkNeedsDecomposition(task: string, threshold: number = 50): DecompositionScore {
  // 关键词得分 (0-40)
  const keywordCount = COMPLEXITY_KEYWORDS.filter((k) => 
    task.toLowerCase().includes(k.toLowerCase())
  ).length;
  const keywordsScore = Math.min(40, keywordCount * 8);

  // 长度得分 (0-30)
  const lengthScore = Math.min(30, Math.floor(task.length / 10));

  // 句子得分 (0-30)
  const sentenceCount = task.split(/[。；！？\n.!?]/).filter((s) => s.trim()).length;
  const sentencesScore = Math.min(30, sentenceCount * 6);

  const total = keywordsScore + lengthScore + sentencesScore;

  const result: DecompositionScore = {
    total,
    keywords: keywordsScore,
    length: lengthScore,
    sentences: sentencesScore,
  };

  log.debug("[checkNeedsDecomposition] 评分结果", {
    task: task.slice(0, 50),
    ...result,
    needsDecomposition: total >= threshold,
  });

  return result;
}

// ============================================================================
// Planner 节点工厂
// ============================================================================

/**
 * 创建 Planner 节点
 */
export function createPlannerNode(config: LangGraphAgentConfig) {
  const plannerConfig: PlannerConfig = {
    llmProvider: config.llmProvider,
    defaultModel: config.defaultModel,
    enableDecomposition: true,
    maxSubTasks: 10,
    complexityThreshold: 50,
  };

  const decomposer = new TaskDecomposer(
    plannerConfig.llmProvider,
    plannerConfig.defaultModel,
    { maxSubTasks: plannerConfig.maxSubTasks }
  );

  const generator = new PlanGenerator();

  return async (state: AgentState, _runConfig?: RunnableConfig): Promise<AgentStateUpdate> => {
    // 获取最新用户消息
    const lastMessage = state.messages[state.messages.length - 1];
    const task = typeof lastMessage?.content === "string" 
      ? lastMessage.content 
      : JSON.stringify(lastMessage?.content);

    if (!task) {
      return { reactState: "thinking" };
    }

    // 检查是否需要分解
    const score = checkNeedsDecomposition(task, plannerConfig.complexityThreshold);

    if (score.total < plannerConfig.complexityThreshold || !plannerConfig.enableDecomposition) {
      log.info("[Planner] 任务简单，无需分解", { score });
      return { reactState: "thinking" };
    }

    log.info("[Planner] 任务复杂，开始分解", { score });

    try {
      // 分解任务
      const subTasks = await decomposer.decompose(task);
      
      if (subTasks.length <= 1) {
        log.info("[Planner] 分解结果为单一任务，无需规划");
        return { reactState: "thinking" };
      }

      // 生成执行计划
      const executionOrder = await generator.generate(subTasks);

      // 创建执行计划
      const plan: ExecutionPlan = {
        id: `plan-${Date.now()}`,
        goal: task,
        subTasks,
        executionOrder,
        currentLevel: 0,
        currentBatchIndex: 0,
      };

      log.info("[Planner] 计划生成完成", {
        planId: plan.id,
        subTaskCount: subTasks.length,
        levels: executionOrder.length,
      });

      // 返回状态更新（添加到 metadata）
      return {
        metadata: { executionPlan: plan },
        reactState: "thinking",
      };
    } catch (error) {
      log.error("[Planner] 规划失败", { error: String(error) });
      return {
        lastError: `任务规划失败: ${(error as Error).message}`,
        reactState: "thinking",
      };
    }
  };
}

// 导出类型
export type { ExecutionPlan as ExecutionPlanType };
