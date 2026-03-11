// 异步消息队列
interface QueueItem<T> {
  data: T;
  resolve: (value: void) => void;
  reject: (reason: Error) => void;
}

class AsyncQueue<T> {
  private queue: QueueItem<T>[] = [];
  private processing = false;
  private processor?: (item: T) => Promise<void>;

  // 设置处理器
  setProcessor(processor: (item: T) => Promise<void>): void {
    this.processor = processor;
  }

  // 入队
  async enqueue(item: T): Promise<void> {
    return new Promise((resolve, reject) => {
      this.queue.push({ data: item, resolve, reject });
      this.processNext();
    });
  }

  // 处理下一个
  private async processNext(): Promise<void> {
    if (this.processing || this.queue.length === 0 || !this.processor) return;
    
    this.processing = true;
    const item = this.queue.shift()!;
    
    try {
      await this.processor(item.data);
      item.resolve();
    } catch (error) {
      item.reject(error instanceof Error ? error : new Error(String(error)));
    } finally {
      this.processing = false;
      this.processNext();
    }
  }

  // 获取队列长度
  get length(): number {
    return this.queue.length;
  }

  // 清空队列
  clear(): void {
    this.queue = [];
  }
}

// 创建消息队列
function createMessageQueue<T>(): AsyncQueue<T> {
  return new AsyncQueue<T>();
}

export { AsyncQueue, createMessageQueue };
export type { QueueItem };
