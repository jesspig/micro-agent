/**
 * 意图识别提示词
 * 
 * 用于分析用户请求，直接推荐合适的模型
 */

/** 模型信息（用于提示词） */
export interface ModelInfo {
  /** 模型 ID（provider/model 格式） */
  id: string;
  /** 性能级别 */
  level: string;
  /** 是否支持视觉 */
  vision: boolean;
  /** 是否支持思考链 */
  think: boolean;
  /** 是否支持工具调用 */
  tool: boolean;
}

/**
 * 构建意图识别系统提示词
 * @param models - 可用模型列表
 */
export function buildIntentSystemPrompt(models: ModelInfo[]): string {
  const modelList = models.map(m => {
    const caps = [];
    if (m.vision) caps.push('视觉');
    if (m.think) caps.push('深度思考');
    if (m.tool) caps.push('工具调用');
    const capStr = caps.length > 0 ? ` [${caps.join(', ')}]` : '';
    return `- ${m.id} (${m.level})${capStr}`;
  }).join('\n');

  return `你是一个任务分析助手。根据用户的请求，从可用模型中选择最合适的模型。

## 可用模型列表
${modelList}

## 性能级别说明
- fast: 简单问候、确认、简单问答（如"你好"、"谢谢"、"是的"）
- low: 基础翻译、格式化、简单摘要、简单查询
- medium: 一般对话、代码解释、简单修改、常规问答
- high: 代码重构、复杂分析、多步推理、需要仔细思考的问题
- ultra: 架构设计、复杂系统分析、高难度推理、需要深度思考的问题

## 选择规则
1. **工具调用优先**：如果任务需要执行系统命令、查看系统状态、读写文件、网络请求等操作，必须选择带 [工具调用] 标记的模型
2. 代码相关任务至少选择 medium 级别
3. 涉及修改、重构至少选择 high 级别
4. 架构、设计模式、优化分析选择 ultra 级别
5. 简单问答、问候选择 fast 或 low 级别
6. 如果消息包含图片，必须选择带 [视觉] 标记的模型
7. 复杂推理任务优先选择带 [深度思考] 标记的模型
8. 从可用模型列表中选择，不要推荐不存在的模型

请以 JSON 格式返回分析结果：
{
  "model": "provider/model-id",
  "reason": "简短说明选择原因"
}

只返回 JSON，不要其他内容。`;
}

/**
 * 构建意图识别用户提示词
 * @param content - 用户消息内容
 * @param hasImage - 是否包含图片
 */
export function buildIntentUserPrompt(content: string, hasImage: boolean): string {
  return `请分析以下用户请求${hasImage ? '（包含图片）' : ''}，选择最合适的模型：

${content}`;
}

/** 意图识别结果 */
export interface IntentResult {
  /** 推荐的模型（provider/model 格式） */
  model: string;
  /** 选择原因 */
  reason: string;
}

