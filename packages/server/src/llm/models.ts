/**
 * 模型列表 API
 *
 * 提供可用模型列表端点。
 */

import { getLogger } from '@logtape/logtape';
import { jsonResponse } from '../http/server';

const log = getLogger(['server', 'llm', 'models']);

/** 模型信息 */
export interface ModelInfo {
  id: string;
  object: 'model';
  created: number;
  owned_by: string;
  permission?: unknown[];
  root?: string;
  parent?: string;
}

/** 模型列表响应 */
export interface ModelsResponse {
  object: 'list';
  data: ModelInfo[];
}

/** 模型提供者 */
export interface ModelProvider {
  id: string;
  name: string;
  models: string[];
}

/** 创建模型列表处理器 */
export function createModelsHandler(providers: ModelProvider[]) {
  return async (_request: Request): Promise<Response> => {
    log.info('获取模型列表');

    const models: ModelInfo[] = [];

    for (const provider of providers) {
      for (const modelId of provider.models) {
        models.push({
          id: `${provider.id}/${modelId}`,
          object: 'model',
          created: Math.floor(Date.now() / 1000),
          owned_by: provider.name,
        });
      }
    }

    const response: ModelsResponse = {
      object: 'list',
      data: models,
    };

    return jsonResponse(response);
  };
}
