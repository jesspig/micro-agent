/**
 * 记忆系统指标收集器
 * 
 * 记录检索延迟、记忆数量、错误率、迁移进度等关键指标。
 * 支持通过 API 查询、Prometheus 格式导出和指标聚合。
 */

import { z } from 'zod';

// ============================================================
// 类型定义
// ============================================================

/** 指标类型 */
export type MetricType = 'counter' | 'gauge' | 'histogram';

/** 指标标签 */
export interface MetricLabels {
  /** 操作类型 */
  operation?: string;
  /** 记忆类型 */
  memoryType?: 'short_term' | 'long_term' | 'episodic';
  /** 搜索模式 */
  searchMode?: 'vector' | 'fulltext' | 'hybrid' | 'auto';
  /** 状态 */
  status?: 'success' | 'error';
  /** 模型 ID */
  modelId?: string;
  /** 错误类型 */
  errorType?: string;
}

/** 指标点 */
export interface MetricPoint {
  /** 时间戳 */
  timestamp: number;
  /** 值 */
  value: number;
  /** 标签 */
  labels: MetricLabels;
}

/** 直方图桶 */
export interface HistogramBucket {
  /** 上界 */
  upperBound: number;
  /** 计数 */
  count: number;
}

/** 直方图统计 */
export interface HistogramStats {
  /** 总数 */
  count: number;
  /** 总和 */
  sum: number;
  /** 最小值 */
  min: number;
  /** 最大值 */
  max: number;
  /** 平均值 */
  avg: number;
  /** 百分位数 */
  percentiles: {
    p50: number;
    p90: number;
    p95: number;
    p99: number;
  };
  /** 桶 */
  buckets: HistogramBucket[];
}

/** 指标定义 */
export interface MetricDefinition {
  /** 名称 */
  name: string;
  /** 类型 */
  type: MetricType;
  /** 描述 */
  description: string;
  /** 单位 */
  unit?: string;
  /** 标签名列表 */
  labelNames: string[];
}

/** 指标快照 */
export interface MetricsSnapshot {
  /** 采集时间 */
  timestamp: number;
  /** 计数器指标 */
  counters: Record<string, number>;
  /** 仪表指标 */
  gauges: Record<string, number>;
  /** 直方图指标 */
  histograms: Record<string, HistogramStats>;
}

/** 记忆系统指标配置 */
export interface MetricsCollectorConfig {
  /** 是否启用 */
  enabled: boolean;
  /** 直方图桶边界 */
  histogramBuckets: number[];
  /** 指标保留时间（毫秒） */
  retentionMs: number;
  /** 聚合间隔（毫秒） */
  aggregateInterval: number;
}

/** 默认配置 */
const DEFAULT_CONFIG: MetricsCollectorConfig = {
  enabled: true,
  histogramBuckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30, 60, 120],
  retentionMs: 24 * 60 * 60 * 1000, // 24 小时
  aggregateInterval: 60000, // 1 分钟
};

// ============================================================
// 预定义指标
// ============================================================

/** 记忆系统核心指标定义 */
export const MEMORY_METRICS: Record<string, MetricDefinition> = {
  // 操作计数
  memory_operations_total: {
    name: 'memory_operations_total',
    type: 'counter',
    description: '记忆操作总次数',
    unit: '次',
    labelNames: ['operation', 'memoryType', 'status'],
  },
  
  // 检索延迟
  memory_retrieval_latency_seconds: {
    name: 'memory_retrieval_latency_seconds',
    type: 'histogram',
    description: '记忆检索延迟分布',
    unit: '秒',
    labelNames: ['memoryType', 'searchMode'],
  },
  
  // 存储延迟
  memory_storage_latency_seconds: {
    name: 'memory_storage_latency_seconds',
    type: 'histogram',
    description: '记忆存储延迟分布',
    unit: '秒',
    labelNames: ['memoryType'],
  },
  
  // 记忆总数
  memory_records_total: {
    name: 'memory_records_total',
    type: 'gauge',
    description: '当前记忆记录总数',
    unit: '条',
    labelNames: ['memoryType'],
  },
  
  // 搜索结果数量
  memory_search_results_count: {
    name: 'memory_search_results_count',
    type: 'histogram',
    description: '搜索返回结果数量分布',
    unit: '条',
    labelNames: ['searchMode'],
  },
  
  // 错误计数
  memory_errors_total: {
    name: 'memory_errors_total',
    type: 'counter',
    description: '记忆操作错误次数',
    unit: '次',
    labelNames: ['operation', 'errorType'],
  },
  
  // 迁移进度
  memory_migration_progress: {
    name: 'memory_migration_progress',
    type: 'gauge',
    description: '记忆迁移进度百分比',
    unit: '%',
    labelNames: ['modelId'],
  },
  
  // 迁移记录数
  memory_migration_records_total: {
    name: 'memory_migration_records_total',
    type: 'counter',
    description: '已迁移记忆记录数',
    unit: '条',
    labelNames: ['modelId'],
  },
  
  // 嵌入向量生成延迟
  memory_embedding_latency_seconds: {
    name: 'memory_embedding_latency_seconds',
    type: 'histogram',
    description: '嵌入向量生成延迟分布',
    unit: '秒',
    labelNames: ['modelId'],
  },
};

// ============================================================
// 指标收集器
// ============================================================

/**
 * 记忆系统指标收集器
 */
export class MetricsCollector {
  private config: MetricsCollectorConfig;
  private counters = new Map<string, number>();
  private gauges = new Map<string, number>();
  private histograms = new Map<string, number[]>();
  private histogramPoints = new Map<string, MetricPoint[]>();
  private aggregateTimer?: ReturnType<typeof setInterval>;
  private startTime = Date.now();

  constructor(config: Partial<MetricsCollectorConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    
    if (this.config.enabled) {
      this.startAggregation();
    }
  }

  /**
   * 生成指标键
   */
  private generateKey(name: string, labels: MetricLabels = {}): string {
    const labelParts: string[] = [];
    
    // 按固定顺序排序标签
    const sortedLabels = Object.entries(labels)
      .filter(([_, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b));
    
    for (const [key, value] of sortedLabels) {
      labelParts.push(`${key}="${value}"`);
    }
    
    if (labelParts.length === 0) {
      return name;
    }
    
    return `${name}{${labelParts.join(',')}}`;
  }

  /**
   * 递增计数器
   */
  incrementCounter(name: string, labels: MetricLabels = {}, value = 1): void {
    if (!this.config.enabled) return;
    
    const key = this.generateKey(name, labels);
    const current = this.counters.get(key) ?? 0;
    this.counters.set(key, current + value);
  }

  /**
   * 设置仪表值
   */
  setGauge(name: string, value: number, labels: MetricLabels = {}): void {
    if (!this.config.enabled) return;
    
    const key = this.generateKey(name, labels);
    this.gauges.set(key, value);
  }

  /**
   * 记录直方图值
   */
  recordHistogram(name: string, value: number, labels: MetricLabels = {}): void {
    if (!this.config.enabled) return;
    
    const key = this.generateKey(name, labels);
    
    // 添加到直方图数组
    if (!this.histograms.has(key)) {
      this.histograms.set(key, []);
    }
    this.histograms.get(key)!.push(value);
    
    // 添加到带时间戳的点
    if (!this.histogramPoints.has(key)) {
      this.histogramPoints.set(key, []);
    }
    this.histogramPoints.get(key)!.push({
      timestamp: Date.now(),
      value,
      labels,
    });
  }

  /**
   * 开始计时
   */
  startTimer(name: string, labels: MetricLabels = {}): () => number {
    const startTime = Date.now();
    
    return () => {
      const duration = (Date.now() - startTime) / 1000; // 转换为秒
      this.recordHistogram(name, duration, labels);
      return duration;
    };
  }

  /**
   * 计算直方图统计
   */
  private calculateHistogramStats(values: number[]): HistogramStats {
    if (values.length === 0) {
      return {
        count: 0,
        sum: 0,
        min: 0,
        max: 0,
        avg: 0,
        percentiles: { p50: 0, p90: 0, p95: 0, p99: 0 },
        buckets: [],
      };
    }
    
    const sorted = [...values].sort((a, b) => a - b);
    const sum = values.reduce((a, b) => a + b, 0);
    
    // 计算百分位数
    const percentile = (p: number): number => {
      const index = Math.ceil((p / 100) * sorted.length) - 1;
      return sorted[Math.max(0, index)] ?? 0;
    };
    
    // 计算桶
    const buckets: HistogramBucket[] = this.config.histogramBuckets.map(upperBound => ({
      upperBound,
      count: sorted.filter(v => v <= upperBound).length,
    }));
    
    return {
      count: values.length,
      sum,
      min: sorted[0] ?? 0,
      max: sorted[sorted.length - 1] ?? 0,
      avg: sum / values.length,
      percentiles: {
        p50: percentile(50),
        p90: percentile(90),
        p95: percentile(95),
        p99: percentile(99),
      },
      buckets,
    };
  }

  /**
   * 获取计数器值
   */
  getCounter(name: string, labels: MetricLabels = {}): number {
    const key = this.generateKey(name, labels);
    return this.counters.get(key) ?? 0;
  }

  /**
   * 获取仪表值
   */
  getGauge(name: string, labels: MetricLabels = {}): number | undefined {
    const key = this.generateKey(name, labels);
    return this.gauges.get(key);
  }

  /**
   * 获取直方图统计
   */
  getHistogramStats(name: string, labels: MetricLabels = {}): HistogramStats | undefined {
    const key = this.generateKey(name, labels);
    const values = this.histograms.get(key);
    
    if (!values || values.length === 0) {
      return undefined;
    }
    
    return this.calculateHistogramStats(values);
  }

  /**
   * 获取所有指标快照
   */
  getSnapshot(): MetricsSnapshot {
    const histograms: Record<string, HistogramStats> = {};
    
    for (const [key, values] of this.histograms) {
      histograms[key] = this.calculateHistogramStats(values);
    }
    
    return {
      timestamp: Date.now(),
      counters: Object.fromEntries(this.counters),
      gauges: Object.fromEntries(this.gauges),
      histograms,
    };
  }

  /**
   * 开始聚合定时器
   */
  private startAggregation(): void {
    this.aggregateTimer = setInterval(() => {
      this.cleanOldPoints();
    }, this.config.aggregateInterval);
  }

  /**
   * 清理过期数据点
   */
  private cleanOldPoints(): void {
    const cutoff = Date.now() - this.config.retentionMs;
    
    for (const [key, points] of this.histogramPoints) {
      const filtered = points.filter(p => p.timestamp >= cutoff);
      
      if (filtered.length === 0) {
        this.histogramPoints.delete(key);
        this.histograms.delete(key);
      } else {
        this.histogramPoints.set(key, filtered);
        this.histograms.set(key, filtered.map(p => p.value));
      }
    }
  }

  /**
   * 停止收集器
   */
  stop(): void {
    if (this.aggregateTimer) {
      clearInterval(this.aggregateTimer);
      this.aggregateTimer = undefined;
    }
  }

  /**
   * 重置所有指标
   */
  reset(): void {
    this.counters.clear();
    this.gauges.clear();
    this.histograms.clear();
    this.histogramPoints.clear();
    this.startTime = Date.now();
  }

  // ============================================================
  // 便捷方法：记忆系统专用
  // ============================================================

  /**
   * 记录存储操作
   */
  recordStore(memoryType: 'short_term' | 'long_term' | 'episodic', durationMs: number, success: boolean): void {
    this.incrementCounter('memory_operations_total', {
      operation: 'store',
      memoryType,
      status: success ? 'success' : 'error',
    });
    
    this.recordHistogram('memory_storage_latency_seconds', durationMs / 1000, { memoryType });
    
    if (!success) {
      this.incrementCounter('memory_errors_total', {
        operation: 'store',
        errorType: 'storage_error',
      });
    }
  }

  /**
   * 记录检索操作
   */
  recordRetrieval(
    memoryType: 'short_term' | 'long_term' | 'episodic',
    searchMode: 'vector' | 'fulltext' | 'hybrid' | 'auto',
    durationMs: number,
    resultCount: number,
    success: boolean
  ): void {
    this.incrementCounter('memory_operations_total', {
      operation: 'retrieve',
      memoryType,
      status: success ? 'success' : 'error',
    });
    
    this.recordHistogram('memory_retrieval_latency_seconds', durationMs / 1000, {
      memoryType,
      searchMode,
    });
    
    this.recordHistogram('memory_search_results_count', resultCount, { searchMode });
    
    if (!success) {
      this.incrementCounter('memory_errors_total', {
        operation: 'retrieve',
        errorType: 'retrieval_error',
      });
    }
  }

  /**
   * 更新记忆总数
   */
  updateRecordCount(memoryType: 'short_term' | 'long_term' | 'episodic', count: number): void {
    this.setGauge('memory_records_total', count, { memoryType });
  }

  /**
   * 记录迁移进度
   */
  recordMigrationProgress(modelId: string, migratedCount: number, totalCount: number): void {
    const progress = totalCount > 0 ? Math.round((migratedCount / totalCount) * 100) : 0;
    
    this.setGauge('memory_migration_progress', progress, { modelId });
    this.incrementCounter('memory_migration_records_total', { modelId }, migratedCount);
  }

  /**
   * 记录嵌入延迟
   */
  recordEmbeddingLatency(modelId: string, durationMs: number): void {
    this.recordHistogram('memory_embedding_latency_seconds', durationMs / 1000, { modelId });
  }

  // ============================================================
  // 导出方法
  // ============================================================

  /**
   * 导出为 Prometheus 格式
   */
  exportPrometheus(): string {
    const lines: string[] = [];
    const processedNames = new Set<string>();
    
    // 辅助函数：从键中提取指标名
    const extractName = (key: string): string => {
      const braceIndex = key.indexOf('{');
      return braceIndex > 0 ? key.slice(0, braceIndex) : key;
    };
    
    // 辅助函数：从键中提取标签
    const extractLabels = (key: string): string => {
      const braceIndex = key.indexOf('{');
      return braceIndex > 0 ? key.slice(braceIndex) : '';
    };
    
    // 计数器
    for (const [key, value] of this.counters) {
      const name = extractName(key);
      const definition = MEMORY_METRICS[name];
      
      if (definition && !processedNames.has(name)) {
        lines.push(`# HELP ${name} ${definition.description}`);
        lines.push(`# TYPE ${name} counter`);
        processedNames.add(name);
      }
      
      lines.push(`${key} ${value}`);
    }
    
    processedNames.clear();
    
    // 仪表
    for (const [key, value] of this.gauges) {
      const name = extractName(key);
      const definition = MEMORY_METRICS[name];
      
      if (definition && !processedNames.has(name)) {
        lines.push(`# HELP ${name} ${definition.description}`);
        lines.push(`# TYPE ${name} gauge`);
        processedNames.add(name);
      }
      
      lines.push(`${key} ${value}`);
    }
    
    processedNames.clear();
    
    // 直方图
    for (const [key, stats] of Object.entries(this.getSnapshot().histograms)) {
      const name = extractName(key);
      const labels = extractLabels(key);
      const definition = MEMORY_METRICS[name];
      
      if (definition && !processedNames.has(name)) {
        lines.push(`# HELP ${name} ${definition.description}`);
        lines.push(`# TYPE ${name} histogram`);
        processedNames.add(name);
      }
      
      // 输出直方图指标
      lines.push(`${name}_count${labels} ${stats.count}`);
      lines.push(`${name}_sum${labels} ${stats.sum}`);
      
      // 桶
      for (const bucket of stats.buckets) {
        lines.push(`${name}_bucket${labels.replace('}', `,le="${bucket.upperBound}"`)} ${bucket.count}`);
      }
      // +Inf 桶
      lines.push(`${name}_bucket${labels.replace('}', ',le="+Inf"')} ${stats.count}`);
    }
    
    return lines.join('\n');
  }

  /**
   * 导出为 JSON 格式
   */
  exportJSON(): Record<string, unknown> {
    const result: Record<string, unknown> = {
      timestamp: Date.now(),
      uptime: Date.now() - this.startTime,
      counters: Object.fromEntries(this.counters),
      gauges: Object.fromEntries(this.gauges),
      histograms: {},
    };
    
    for (const [key, values] of this.histograms) {
      (result.histograms as Record<string, unknown>)[key] = this.calculateHistogramStats(values);
    }
    
    return result;
  }

  /**
   * 获取指标定义
   */
  getMetricDefinitions(): MetricDefinition[] {
    return Object.values(MEMORY_METRICS);
  }

  /**
   * 获取运行时间（秒）
   */
  getUptime(): number {
    return (Date.now() - this.startTime) / 1000;
  }
}

// ============================================================
// 全局实例
// ============================================================

/** 全局指标收集器实例 */
let globalMetricsCollector: MetricsCollector | null = null;

/**
 * 获取全局指标收集器
 */
export function getMetricsCollector(config?: Partial<MetricsCollectorConfig>): MetricsCollector {
  if (!globalMetricsCollector) {
    globalMetricsCollector = new MetricsCollector(config);
  }
  return globalMetricsCollector;
}

/**
 * 重置全局指标收集器
 */
export function resetMetricsCollector(): void {
  if (globalMetricsCollector) {
    globalMetricsCollector.stop();
    globalMetricsCollector = null;
  }
}
