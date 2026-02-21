/**
 * 意图识别提示词
 */

/** 模型信息（用于提示词） */
export interface ModelInfo {
  id: string;
  level: string;
  vision: boolean;
  think: boolean;
  tool: boolean;
}

/**
 * 构建意图识别系统提示词
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
- fast: 简单问候、确认、简单问答
- low: 基础翻译、格式化、简单摘要、简单查询
- medium: 一般对话、代码解释、简单修改、常规问答
- high: 代码重构、复杂分析、多步推理
- ultra: 架构设计、复杂系统分析、高难度推理

## 选择规则
1. 工具调用优先：需要执行系统命令、查看系统状态、读写文件等操作，必须选择带 [工具调用] 标记的模型
2. 代码相关任务至少选择 medium 级别
3. 涉及修改、重构至少选择 high 级别
4. 架构、设计模式、优化分析选择 ultra 级别
5. 简单问答、问候选择 fast 或 low 级别
6. 如果消息包含图片，必须选择带 [视觉] 标记的模型
7. 复杂推理任务优先选择带 [深度思考] 标记的模型

请以 JSON 格式返回分析结果：
{
  "model": "provider/model-id",
  "reason": "简短说明选择原因"
}`;
}

/**
 * 构建意图识别用户提示词
 */
export function buildIntentUserPrompt(content: string, hasImage: boolean): string {
  return `请分析以下用户请求${hasImage ? '（包含图片）' : ''}，选择最合适的模型：

${content}`;
}

/** 意图识别结果 */
export interface IntentResult {
  model: string;
  reason: string;
}
