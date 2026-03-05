/**
 * 前端 API 客户端
 */

import type { ChatMessage, ChatSession, AppSettings } from '../views/types';

const API_BASE = '/api';

/**
 * API 客户端
 */
export class ApiClient {
  /**
   * 发送消息
   */
  async sendMessage(message: string): Promise<{ response: string }> {
    const response = await fetch(`${API_BASE}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message }),
    });
    return response.json();
  }

  /**
   * 获取会话列表
   */
  async getSessions(): Promise<{ sessions: ChatSession[] }> {
    const response = await fetch(`${API_BASE}/sessions`);
    return response.json();
  }

  /**
   * 创建会话
   */
  async createSession(): Promise<{ sessionId: string }> {
    const response = await fetch(`${API_BASE}/sessions`, {
      method: 'POST',
    });
    return response.json();
  }

  /**
   * 获取设置
   */
  async getSettings(): Promise<AppSettings> {
    const response = await fetch(`${API_BASE}/settings`);
    return response.json();
  }

  /**
   * 更新设置
   */
  async updateSettings(settings: Partial<AppSettings>): Promise<void> {
    await fetch(`${API_BASE}/settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    });
  }
}

// 导出全局实例
export const apiClient = new ApiClient();