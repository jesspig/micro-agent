/**
 * 检索功能模块
 * 
 * 负责向量检索、全文检索、混合检索、双层检索等
 * 
 * @deprecated 请使用 './search' 模块
 */

// 直接从新模块导入并重新导出
import { SearchManager } from './search/manager';
import type { SearchMode } from './search/types';

export { SearchManager, type SearchMode };
