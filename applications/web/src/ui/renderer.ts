/**
 * UI 渲染器
 *
 * 负责前端界面的渲染和更新。
 */

import { renderChatView, renderMessage, renderSettingsView } from '../views';
import { apiClient } from '../api';
import type { ChatMessage, AppSettings } from '../views/types';

/**
 * UI 渲染器
 */
export class UIRenderer {
  private messages: ChatMessage[] = [];
  private settings: AppSettings | null = null;

  /**
   * 初始化
   */
  async initialize(): Promise<void> {
    // 加载设置
    this.settings = await apiClient.getSettings();

    // 渲染聊天界面
    this.renderChat();

    // 绑定事件
    this.bindEvents();
  }

  /**
   * 渲染聊天界面
   */
  private renderChat(): void {
    const container = document.getElementById('app');
    if (!container) return;

    container.innerHTML = renderChatView();
    this.renderMessages();
  }

  /**
   * 渲染消息列表
   */
  private renderMessages(): void {
    const messagesContainer = document.getElementById('chatMessages');
    if (!messagesContainer) return;

    messagesContainer.innerHTML = this.messages
      .map(msg => renderMessage(msg))
      .join('');
  }

  /**
   * 添加消息
   */
  addMessage(message: ChatMessage): void {
    this.messages.push(message);
    this.renderMessages();
  }

  /**
   * 渲染设置界面
   */
  renderSettings(): void {
    const container = document.getElementById('app');
    if (!container) return;

    container.innerHTML = renderSettingsView();

    // 填充当前设置
    if (this.settings) {
      const chatModelInput = document.getElementById('chatModel') as HTMLInputElement;
      const memoryEnabledInput = document.getElementById('memoryEnabled') as HTMLInputElement;

      if (chatModelInput) chatModelInput.value = this.settings.chatModel;
      if (memoryEnabledInput) memoryEnabledInput.checked = this.settings.memoryEnabled;
    }
  }

  /**
   * 绑定事件
   */
  private bindEvents(): void {
    const sendButton = document.getElementById('sendButton');
    const messageInput = document.getElementById('messageInput');

    sendButton?.addEventListener('click', () => this.handleSendMessage());
    messageInput?.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') this.handleSendMessage();
    });
  }

  /**
   * 处理发送消息
   */
  private async handleSendMessage(): Promise<void> {
    const messageInput = document.getElementById('messageInput') as HTMLInputElement;
    const message = messageInput.value.trim();

    if (!message) return;

    // 添加用户消息
    this.addMessage({
      id: crypto.randomUUID(),
      role: 'user',
      content: message,
      timestamp: Date.now(),
    });

    // 清空输入
    messageInput.value = '';

    // 发送消息
    try {
      const response = await apiClient.sendMessage(message);

      // 添加助手消息
      this.addMessage({
        id: crypto.randomUUID(),
        role: 'assistant',
        content: response.response,
        timestamp: Date.now(),
      });
    } catch (error) {
      console.error('发送消息失败:', error);
    }
  }
}

// 导出全局实例
let globalRenderer: UIRenderer | null = null;

/**
 * 获取全局渲染器
 */
export function getRenderer(): UIRenderer {
  if (!globalRenderer) {
    globalRenderer = new UIRenderer();
  }
  return globalRenderer;
}

/**
 * 设置全局渲染器
 */
export function setRenderer(renderer: UIRenderer): void {
  globalRenderer = renderer;
}