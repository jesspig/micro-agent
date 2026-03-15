/**
 * 异步消息队列
 */

import { 
  busLogger, 
  createTimer, 
  sanitize, 
  logMethodCall, 
  logMethodReturn, 
  logMethodError 
} from "../../applications/shared/logger.js";

const logger = busLogger();

interface QueueItem<T> {
  data: T;
  resolve: (value: void) => void;
  reject: (reason: Error) => void;
}

class AsyncQueue<T> {
  private queue: QueueItem<T>[] = [];
  private processing = false;
  private processor?: (item: T) => Promise<void>;

  /**
   * 设置处理器
   * @param processor - 消息处理函数
   */
  setProcessor(processor: (item: T) => Promise<void>): void {
    const timer = createTimer();
    logMethodCall(logger, { 
      method: "setProcessor", 
      module: "AsyncQueue",
      params: { hasProcessor: !!processor }
    });
    
    this.processor = processor;
    
    logMethodReturn(logger, { 
      method: "setProcessor", 
      module: "AsyncQueue",
      duration: timer() 
    });
  }

  /**
   * 入队
   * @param item - 队列项
   */
  async enqueue(item: T): Promise<void> {
    const timer = createTimer();
    logMethodCall(logger, { 
      method: "enqueue", 
      module: "AsyncQueue",
      params: { queueLength: this.queue.length }
    });
    
    return new Promise((resolve, reject) => {
      this.queue.push({ data: item, resolve, reject });
      
      logger.info("消息入队", { 
        queueLength: this.queue.length,
        data: sanitize(item)
      });
      
      this.processNext();
    }).then(() => {
      logMethodReturn(logger, { 
        method: "enqueue", 
        module: "AsyncQueue",
        duration: timer() 
      });
    }).catch((error) => {
      logMethodError(logger, { 
        method: "enqueue", 
        module: "AsyncQueue",
        error: { name: error.name, message: error.message, stack: error.stack },
        params: { queueLength: this.queue.length },
        duration: timer() 
      });
      throw error;
    });
  }

  /**
   * 处理下一个
   */
  private async processNext(): Promise<void> {
    if (this.processing || this.queue.length === 0 || !this.processor) return;
    
    this.processing = true;
    const item = this.queue.shift()!;
    
    logger.debug("开始处理队列项", { 
      remainingItems: this.queue.length 
    });
    
    try {
      await this.processor(item.data);
      item.resolve();
      
      logger.info("队列项处理成功", { 
        remainingItems: this.queue.length 
      });
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      item.reject(err);
      
      logMethodError(logger, { 
        method: "processNext", 
        module: "AsyncQueue",
        error: { name: err.name, message: err.message, stack: err.stack },
        params: { remainingItems: this.queue.length }
      });
    } finally {
      this.processing = false;
      this.processNext();
    }
  }

  /**
   * 获取队列长度
   */
  get length(): number {
    return this.queue.length;
  }

  /**
   * 清空队列
   */
  clear(): void {
    const timer = createTimer();
    logMethodCall(logger, { 
      method: "clear", 
      module: "AsyncQueue",
      params: { queueLength: this.queue.length }
    });
    
    const clearedCount = this.queue.length;
    this.queue = [];
    
    logger.info("队列已清空", { 
      clearedCount 
    });
    
    logMethodReturn(logger, { 
      method: "clear", 
      module: "AsyncQueue",
      result: { clearedCount },
      duration: timer() 
    });
  }
}

/**
 * 创建消息队列
 */
function createMessageQueue<T>(): AsyncQueue<T> {
  const timer = createTimer();
  logMethodCall(logger, { 
    method: "createMessageQueue", 
    module: "AsyncQueue"
  });
  
  const queue = new AsyncQueue<T>();
  
  logger.info("消息队列已创建");
  
  logMethodReturn(logger, { 
    method: "createMessageQueue", 
    module: "AsyncQueue",
    duration: timer() 
  });
  
  return queue;
}

export { AsyncQueue, createMessageQueue };
export type { QueueItem };