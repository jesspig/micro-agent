/**
 * Channel 模块单元测试
 * 
 * 测试 BaseChannel、ChannelManager 的核心功能
 */

import { test, expect, describe, beforeEach, mock } from "bun:test";
import { BaseChannel } from "../../microagent/runtime/src/channel/base.js";
import { ChannelManager } from "../../microagent/runtime/src/channel/manager.js";
import { RegistryError } from "../../microagent/runtime/src/errors.js";
import type { 
  ChannelType, 
  ChannelConfig, 
  ChannelStatus,
  InboundMessage,
  OutboundMessage,
  SendResult 
} from "../../microagent/runtime/src/channel/types.js";
import type { ChannelCapabilities, MessageHandler } from "../../microagent/runtime/src/channel/contract.js";

// ============================================================================
// 测试辅助类
// ============================================================================

/**
 * Mock Channel 实现
 * 用于测试 BaseChannel 抽象类的功能
 */
class MockChannel extends BaseChannel {
  readonly id: string;
  readonly type: ChannelType;
  readonly config: ChannelConfig;
  readonly capabilities: ChannelCapabilities;
  
  private started = false;

  constructor(config: ChannelConfig, capabilities?: Partial<ChannelCapabilities>) {
    super(config);
    this.id = config.id;
    this.type = config.type;
    this.config = config;
    this.capabilities = {
      text: capabilities?.text ?? true,
      media: capabilities?.media ?? false,
      reply: capabilities?.reply ?? false,
      edit: capabilities?.edit ?? false,
      delete: capabilities?.delete ?? false,
    };
  }

  async start(_config: ChannelConfig): Promise<void> {
    this.started = true;
    this.setConnected(true);
  }

  async stop(): Promise<void> {
    this.started = false;
    this.setConnected(false);
  }

  async send(message: OutboundMessage): Promise<SendResult> {
    if (!this.started) {
      return { success: false, error: "Channel not started" };
    }
    return { success: true, messageId: `msg-${Date.now()}` };
  }

  /** 暴露 emitMessage 供测试使用 */
  testEmitMessage(message: InboundMessage): void {
    this.emitMessage(message);
  }

  /** 暴露 setConnected 供测试使用 */
  testSetConnected(connected: boolean, error?: string): void {
    this.setConnected(connected, error);
  }
}

/**
 * 创建测试用的 Channel 配置
 */
function createTestConfig(id: string, type: ChannelType = "qq"): ChannelConfig {
  return {
    id,
    type,
    enabled: true,
    token: "test-token",
    webhookUrl: "https://example.com/webhook",
    webhookSecret: "test-secret",
  };
}

/**
 * 创建测试用的入站消息
 */
function createTestMessage(overrides?: Partial<InboundMessage>): InboundMessage {
  return {
    from: "user-1",
    to: "bot-1",
    text: "Hello",
    timestamp: Date.now(),
    channelId: "test-channel",
    ...overrides,
  };
}

// ============================================================================
// BaseChannel 测试
// ============================================================================

describe("BaseChannel", () => {
  let channel: MockChannel;
  let config: ChannelConfig;

  beforeEach(() => {
    config = createTestConfig("test-channel");
    channel = new MockChannel(config);
  });

  describe("构造函数", () => {
    test("应该正确初始化 Channel 属性", () => {
      expect(channel.id).toBe("test-channel");
      expect(channel.type).toBe("qq");
      expect(channel.config).toBe(config);
    });

    test("应该初始化默认状态为未连接", () => {
      const status = channel.getStatus();
      expect(status.connected).toBe(false);
      expect(status.messageCount).toBe(0);
    });

    test("应该正确设置默认能力", () => {
      expect(channel.capabilities.text).toBe(true);
      expect(channel.capabilities.media).toBe(false);
      expect(channel.capabilities.reply).toBe(false);
    });

    test("应该允许自定义能力", () => {
      const customChannel = new MockChannel(config, {
        text: true,
        media: true,
        reply: true,
        edit: true,
        delete: true,
      });

      expect(customChannel.capabilities.text).toBe(true);
      expect(customChannel.capabilities.media).toBe(true);
      expect(customChannel.capabilities.reply).toBe(true);
      expect(customChannel.capabilities.edit).toBe(true);
      expect(customChannel.capabilities.delete).toBe(true);
    });
  });

  describe("消息处理器管理", () => {
    test("应该能够注册消息处理器", () => {
      // 安排
      const handler = mock(() => {});

      // 执行
      channel.onMessage(handler);
      channel.testEmitMessage(createTestMessage());

      // 断言
      expect(handler).toHaveBeenCalledTimes(1);
    });

    test("应该能够注册多个消息处理器", () => {
      // 安排
      const handler1 = mock(() => {});
      const handler2 = mock(() => {});

      // 执行
      channel.onMessage(handler1);
      channel.onMessage(handler2);
      channel.testEmitMessage(createTestMessage());

      // 断言
      expect(handler1).toHaveBeenCalledTimes(1);
      expect(handler2).toHaveBeenCalledTimes(1);
    });

    test("应该能够移除消息处理器", () => {
      // 安排
      const handler = mock(() => {});
      channel.onMessage(handler);

      // 执行
      channel.offMessage(handler);
      channel.testEmitMessage(createTestMessage());

      // 断言
      expect(handler).not.toHaveBeenCalled();
    });

    test("移除未注册的处理器应该是安全操作", () => {
      // 安排
      const handler1 = mock(() => {});
      const handler2 = mock(() => {});

      // 执行
      channel.onMessage(handler1);
      channel.offMessage(handler2); // 移除未注册的处理器
      channel.testEmitMessage(createTestMessage());

      // 断言 - handler1 仍然应该工作
      expect(handler1).toHaveBeenCalledTimes(1);
    });

    test("同一个处理器多次注册应该只触发一次", () => {
      // 安排
      const handler = mock(() => {});

      // 执行
      channel.onMessage(handler);
      channel.onMessage(handler); // 再次注册同一个处理器
      channel.testEmitMessage(createTestMessage());

      // 断言 - Set 会自动去重，所以只触发一次
      expect(handler).toHaveBeenCalledTimes(1);
    });
  });

  describe("消息发射 (emitMessage)", () => {
    test("应该将正确的消息传递给处理器", () => {
      // 安排
      const handler = mock(() => {});
      channel.onMessage(handler);
      const message = createTestMessage({ text: "Test message" });

      // 执行
      channel.testEmitMessage(message);

      // 断言
      expect(handler).toHaveBeenCalledWith(message);
    });

    test("应该更新消息计数", () => {
      // 安排
      const handler = mock(() => {});
      channel.onMessage(handler);

      // 执行
      channel.testEmitMessage(createTestMessage());
      channel.testEmitMessage(createTestMessage());
      channel.testEmitMessage(createTestMessage());

      // 断言
      const status = channel.getStatus();
      expect(status.messageCount).toBe(3);
    });

    test("应该更新最后活动时间", () => {
      // 安排
      const beforeTime = Date.now();
      const handler = mock(() => {});
      channel.onMessage(handler);

      // 执行
      channel.testEmitMessage(createTestMessage());

      // 断言
      const status = channel.getStatus();
      expect(status.lastActivity).toBeDefined();
      expect(status.lastActivity!).toBeGreaterThanOrEqual(beforeTime);
    });

    test("处理器抛出错误时应该捕获并继续执行其他处理器", () => {
      // 安排
      const errorHandler = mock(() => {
        throw new Error("Handler error");
      });
      const normalHandler = mock(() => {});

      // 执行
      channel.onMessage(errorHandler);
      channel.onMessage(normalHandler);

      // Mock console.error 避免测试输出噪音
      const consoleSpy = mock(() => {});
      const originalConsoleError = console.error;
      console.error = consoleSpy;

      channel.testEmitMessage(createTestMessage());

      // 恢复 console.error
      console.error = originalConsoleError;

      // 断言 - 即使第一个处理器抛错，第二个也应该执行
      expect(normalHandler).toHaveBeenCalledTimes(1);
      expect(consoleSpy).toHaveBeenCalled();
    });

    test("应该支持异步处理器", async () => {
      // 安排
      const results: string[] = [];
      const asyncHandler: MessageHandler = async (message) => {
        await new Promise((r) => setTimeout(r, 10));
        results.push(message.text);
      };
      channel.onMessage(asyncHandler);

      // 执行
      channel.testEmitMessage(createTestMessage({ text: "async-test" }));

      // 等待异步处理完成
      await new Promise((r) => setTimeout(r, 20));

      // 断言
      expect(results).toEqual(["async-test"]);
    });
  });

  describe("状态管理", () => {
    test("getStatus 应该返回状态快照", () => {
      // 执行
      const status1 = channel.getStatus();
      const status2 = channel.getStatus();

      // 断言 - 应该是不同的对象
      expect(status1).not.toBe(status2);
      expect(status1).toEqual(status2);
    });

    test("setConnected 应该更新连接状态", () => {
      // 执行
      channel.testSetConnected(true);

      // 断言
      const status = channel.getStatus();
      expect(status.connected).toBe(true);
    });

    test("setConnected 应该记录错误信息", () => {
      // 执行
      channel.testSetConnected(false, "Connection failed");

      // 断言
      const status = channel.getStatus();
      expect(status.connected).toBe(false);
      expect(status.lastError).toBe("Connection failed");
    });

    test("状态应该包含正确的 Channel 信息", () => {
      // 执行
      const status = channel.getStatus();

      // 断言
      expect(status.id).toBe("test-channel");
      expect(status.type).toBe("qq");
    });
  });

  describe("生命周期", () => {
    test("start 应该设置连接状态为 true", async () => {
      // 执行
      await channel.start(config);

      // 断言
      const status = channel.getStatus();
      expect(status.connected).toBe(true);
    });

    test("stop 应该设置连接状态为 false", async () => {
      // 安排
      await channel.start(config);

      // 执行
      await channel.stop();

      // 断言
      const status = channel.getStatus();
      expect(status.connected).toBe(false);
    });

    test("未启动时发送消息应该失败", async () => {
      // 执行
      const result = await channel.send({ to: "user-1", text: "Hello" });

      // 断言
      expect(result.success).toBe(false);
      expect(result.error).toBe("Channel not started");
    });

    test("启动后发送消息应该成功", async () => {
      // 安排
      await channel.start(config);

      // 执行
      const result = await channel.send({ to: "user-1", text: "Hello" });

      // 断言
      expect(result.success).toBe(true);
      expect(result.messageId).toBeDefined();
    });
  });
});

// ============================================================================
// ChannelManager 测试
// ============================================================================

describe("ChannelManager", () => {
  let manager: ChannelManager;

  beforeEach(() => {
    manager = new ChannelManager();
  });

  describe("注册操作", () => {
    test("应该能够注册 Channel", () => {
      // 安排
      const channel = new MockChannel(createTestConfig("ch-1"));

      // 执行
      manager.register(channel);

      // 断言
      expect(manager.has("ch-1")).toBe(true);
    });

    test("注册重复 Channel 应该抛出 RegistryError", () => {
      // 安排
      const channel1 = new MockChannel(createTestConfig("ch-1"));
      const channel2 = new MockChannel(createTestConfig("ch-1"));
      manager.register(channel1);

      // 执行 & 断言
      expect(() => manager.register(channel2)).toThrow(RegistryError);
      expect(() => manager.register(channel2)).toThrow(`Channel "ch-1" 已存在`);
    });

    test("RegistryError 应该包含正确的错误信息", () => {
      // 安排
      const channel1 = new MockChannel(createTestConfig("ch-1"));
      const channel2 = new MockChannel(createTestConfig("ch-1"));
      manager.register(channel1);

      // 执行 & 断言
      try {
        manager.register(channel2);
        expect.fail("应该抛出错误");
      } catch (error) {
        expect(error).toBeInstanceOf(RegistryError);
        const registryError = error as RegistryError;
        expect(registryError.itemType).toBe("Channel");
        expect(registryError.itemName).toBe("ch-1");
      }
    });
  });

  describe("获取操作", () => {
    test("get 应该返回已注册的 Channel", () => {
      // 安排
      const channel = new MockChannel(createTestConfig("ch-1"));
      manager.register(channel);

      // 执行
      const result = manager.get("ch-1");

      // 断言
      expect(result).toBe(channel);
    });

    test("get 不存在的 Channel 应该返回 undefined", () => {
      // 执行
      const result = manager.get("non-existent");

      // 断言
      expect(result).toBeUndefined();
    });

    test("has 应该正确判断 Channel 是否存在", () => {
      // 安排
      const channel = new MockChannel(createTestConfig("ch-1"));
      manager.register(channel);

      // 断言
      expect(manager.has("ch-1")).toBe(true);
      expect(manager.has("non-existent")).toBe(false);
    });

    test("list 应该返回所有 Channel", () => {
      // 安排
      const channel1 = new MockChannel(createTestConfig("ch-1"));
      const channel2 = new MockChannel(createTestConfig("ch-2"));
      manager.register(channel1);
      manager.register(channel2);

      // 执行
      const result = manager.list();

      // 断言
      expect(result).toHaveLength(2);
      expect(result).toContain(channel1);
      expect(result).toContain(channel2);
    });

    test("list 空管理器应该返回空数组", () => {
      // 执行
      const result = manager.list();

      // 断言
      expect(result).toEqual([]);
    });
  });

  describe("生命周期管理", () => {
    test("startAll 应该启动所有 Channel", async () => {
      // 安排
      const channel1 = new MockChannel(createTestConfig("ch-1"));
      const channel2 = new MockChannel(createTestConfig("ch-2"));
      manager.register(channel1);
      manager.register(channel2);

      // 执行
      await manager.startAll();

      // 断言
      expect(channel1.getStatus().connected).toBe(true);
      expect(channel2.getStatus().connected).toBe(true);
    });

    test("stopAll 应该停止所有 Channel", async () => {
      // 安排
      const channel1 = new MockChannel(createTestConfig("ch-1"));
      const channel2 = new MockChannel(createTestConfig("ch-2"));
      manager.register(channel1);
      manager.register(channel2);
      await manager.startAll();

      // 执行
      await manager.stopAll();

      // 断言
      expect(channel1.getStatus().connected).toBe(false);
      expect(channel2.getStatus().connected).toBe(false);
    });

    test("startAll 应该忽略单个 Channel 的启动失败", async () => {
      // 安排
      class FailingChannel extends MockChannel {
        async start(): Promise<void> {
          throw new Error("Start failed");
        }
      }

      const failingChannel = new FailingChannel(createTestConfig("failing"));
      const normalChannel = new MockChannel(createTestConfig("normal"));
      manager.register(failingChannel);
      manager.register(normalChannel);

      // Mock console.error 避免测试输出噪音
      const consoleSpy = mock(() => {});
      const originalConsoleError = console.error;
      console.error = consoleSpy;

      // 执行
      await manager.startAll();

      // 恢复 console.error
      console.error = originalConsoleError;

      // 断言 - 正常 Channel 仍然应该启动
      expect(normalChannel.getStatus().connected).toBe(true);
      expect(consoleSpy).toHaveBeenCalled();
    });
  });

  describe("全局消息处理器", () => {
    test("onMessage 应该注册到所有已存在的 Channel", () => {
      // 安排
      const channel1 = new MockChannel(createTestConfig("ch-1"));
      const channel2 = new MockChannel(createTestConfig("ch-2"));
      manager.register(channel1);
      manager.register(channel2);

      const handler = mock(() => {});

      // 执行
      manager.onMessage(handler);
      channel1.testEmitMessage(createTestMessage());
      channel2.testEmitMessage(createTestMessage());

      // 断言
      expect(handler).toHaveBeenCalledTimes(2);
    });

    test("onMessage 只注册到已存在的 Channel，新 Channel 需要手动注册", () => {
      // 安排
      const handler = mock(() => {});
      manager.onMessage(handler);

      // 注册新 Channel（此时不会自动获得已存在的全局处理器）
      const channel = new MockChannel(createTestConfig("ch-1"));
      manager.register(channel);

      // 执行 - 新 Channel 的消息不会触发 handler
      channel.testEmitMessage(createTestMessage());

      // 断言 - handler 不会被调用（因为 register 时没有自动注册全局处理器）
      expect(handler).toHaveBeenCalledTimes(0);

      // 验证：手动再次调用 onMessage 会注册到新 Channel
      manager.onMessage(handler);
      channel.testEmitMessage(createTestMessage());
      expect(handler).toHaveBeenCalledTimes(1);
    });

    test("offMessage 应该从所有 Channel 移除处理器", () => {
      // 安排
      const channel1 = new MockChannel(createTestConfig("ch-1"));
      const channel2 = new MockChannel(createTestConfig("ch-2"));
      manager.register(channel1);
      manager.register(channel2);

      const handler = mock(() => {});
      manager.onMessage(handler);

      // 执行
      manager.offMessage(handler);
      channel1.testEmitMessage(createTestMessage());
      channel2.testEmitMessage(createTestMessage());

      // 断言
      expect(handler).not.toHaveBeenCalled();
    });

    test("可以注册多个全局消息处理器", () => {
      // 安排
      const channel = new MockChannel(createTestConfig("ch-1"));
      manager.register(channel);

      const handler1 = mock(() => {});
      const handler2 = mock(() => {});

      // 执行
      manager.onMessage(handler1);
      manager.onMessage(handler2);
      channel.testEmitMessage(createTestMessage());

      // 断言
      expect(handler1).toHaveBeenCalledTimes(1);
      expect(handler2).toHaveBeenCalledTimes(1);
    });
  });
});

// ============================================================================
// 通道能力检测测试
// ============================================================================

describe("通道能力检测", () => {
  test("应该正确识别文本能力", () => {
    const channel = new MockChannel(createTestConfig("ch-1"), { text: true });
    expect(channel.capabilities.text).toBe(true);
  });

  test("应该正确识别媒体能力", () => {
    const channel = new MockChannel(createTestConfig("ch-1"), { media: true });
    expect(channel.capabilities.media).toBe(true);
  });

  test("应该正确识别回复能力", () => {
    const channel = new MockChannel(createTestConfig("ch-1"), { reply: true });
    expect(channel.capabilities.reply).toBe(true);
  });

  test("应该正确识别编辑能力", () => {
    const channel = new MockChannel(createTestConfig("ch-1"), { edit: true });
    expect(channel.capabilities.edit).toBe(true);
  });

  test("应该正确识别删除能力", () => {
    const channel = new MockChannel(createTestConfig("ch-1"), { delete: true });
    expect(channel.capabilities.delete).toBe(true);
  });

  test("不同类型的 Channel 可以有不同的能力", () => {
    // QQ Channel - 基础能力
    const qqChannel = new MockChannel(createTestConfig("qq-ch", "qq"), {
      text: true,
      media: false,
      reply: true,
    });

    // 飞书 Channel - 完整能力
    const feishuChannel = new MockChannel(createTestConfig("feishu-ch", "feishu"), {
      text: true,
      media: true,
      reply: true,
      edit: true,
      delete: true,
    });

    // 企业微信 Channel - 文本和回复
    const wechatChannel = new MockChannel(createTestConfig("wechat-ch", "wechat-work"), {
      text: true,
      media: false,
      reply: true,
    });

    // 钉钉 Channel - 文本和媒体
    const dingtalkChannel = new MockChannel(createTestConfig("dingtalk-ch", "dingtalk"), {
      text: true,
      media: true,
      reply: false,
    });

    // 断言
    expect(qqChannel.type).toBe("qq");
    expect(qqChannel.capabilities.text).toBe(true);
    expect(qqChannel.capabilities.media).toBe(false);

    expect(feishuChannel.type).toBe("feishu");
    expect(feishuChannel.capabilities.edit).toBe(true);
    expect(feishuChannel.capabilities.delete).toBe(true);

    expect(wechatChannel.type).toBe("wechat-work");
    expect(wechatChannel.capabilities.reply).toBe(true);

    expect(dingtalkChannel.type).toBe("dingtalk");
    expect(dingtalkChannel.capabilities.media).toBe(true);
  });
});

// ============================================================================
// 错误处理测试
// ============================================================================

describe("错误处理", () => {
  test("注册重复 Channel 应该抛出正确的错误类型", () => {
    const manager = new ChannelManager();
    const channel1 = new MockChannel(createTestConfig("duplicate"));
    const channel2 = new MockChannel(createTestConfig("duplicate"));

    manager.register(channel1);

    expect(() => manager.register(channel2)).toThrow(RegistryError);
  });

  test("Channel 发送失败应该返回包含错误的 SendResult", async () => {
    const channel = new MockChannel(createTestConfig("ch-1"));
    // 未启动就发送，应该失败

    const result = await channel.send({ to: "user", text: "test" });

    expect(result.success).toBe(false);
    expect(result.error).toBe("Channel not started");
  });

  test("消息处理器错误应该被捕获并记录", () => {
    const channel = new MockChannel(createTestConfig("ch-1"));
    const errorHandler = () => {
      throw new Error("Handler crashed");
    };
    const normalHandler = mock(() => {});

    channel.onMessage(errorHandler);
    channel.onMessage(normalHandler);

    // Mock console.error
    const consoleSpy = mock(() => {});
    const originalConsoleError = console.error;
    console.error = consoleSpy;

    // 不应该抛出错误
    expect(() => channel.testEmitMessage(createTestMessage())).not.toThrow();

    console.error = originalConsoleError;

    // 正常处理器应该被调用
    expect(normalHandler).toHaveBeenCalled();
    // 错误应该被记录
    expect(consoleSpy).toHaveBeenCalled();
  });
});

// ============================================================================
// 边界情况测试
// ============================================================================

describe("边界情况", () => {
  test("空 ChannelManager 应该正常工作", async () => {
    const manager = new ChannelManager();

    expect(manager.list()).toEqual([]);
    expect(manager.get("any")).toBeUndefined();
    expect(manager.has("any")).toBe(false);

    // 启动和停止空管理器应该是安全的
    await manager.startAll();
    await manager.stopAll();
  });

  test("Channel 可以有多个相同消息处理器引用", () => {
    const channel = new MockChannel(createTestConfig("ch-1"));
    const handler = mock(() => {});

    channel.onMessage(handler);
    channel.onMessage(handler);
    channel.onMessage(handler);

    channel.testEmitMessage(createTestMessage());

    // Set 应该去重，只调用一次
    expect(handler).toHaveBeenCalledTimes(1);
  });

  test("ChannelManager 可以处理多个 Channel 同时发送消息", async () => {
    const manager = new ChannelManager();

    const channels = Array.from({ length: 5 }, (_, i) => 
      new MockChannel(createTestConfig(`ch-${i}`))
    );

    channels.forEach((ch) => manager.register(ch));
    await manager.startAll();

    const results = await Promise.all(
      channels.map((ch) => ch.send({ to: "user", text: "test" }))
    );

    results.forEach((result) => {
      expect(result.success).toBe(true);
    });
  });
});
