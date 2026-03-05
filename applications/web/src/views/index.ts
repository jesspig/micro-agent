/**
 * 前端视图
 *
 * 前端视图组件（占位符）
 */

import type { ChatMessage } from './types';

/**
 * 渲染聊天界面
 */
export function renderChatView(): string {
  return `
    <div class="chat-container">
      <div class="chat-header">
        <h1>MicroAgent</h1>
      </div>
      <div class="chat-messages" id="chatMessages"></div>
      <div class="chat-input">
        <input type="text" id="messageInput" placeholder="输入消息..." />
        <button id="sendButton">发送</button>
      </div>
    </div>
  `;
}

/**
 * 渲染消息
 */
export function renderMessage(message: ChatMessage): string {
  const isUser = message.role === 'user';
  return `
    <div class="message ${message.role}">
      <div class="message-content">${escapeHtml(message.content)}</div>
      <div class="message-time">${formatTime(message.timestamp)}</div>
    </div>
  `;
}

/**
 * 渲染设置界面
 */
export function renderSettingsView(): string {
  return `
    <div class="settings-container">
      <h1>设置</h1>
      <div class="settings-section">
        <h2>模型配置</h2>
        <label>
          Chat Model:
          <input type="text" id="chatModel" placeholder="gpt-4" />
        </label>
      </div>
      <div class="settings-section">
        <h2>记忆配置</h2>
        <label>
          <input type="checkbox" id="memoryEnabled" />
          启用记忆系统
        </label>
      </div>
    </div>
  `;
}

/**
 * 转义 HTML
 */
function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * 格式化时间
 */
function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString('zh-CN');
}