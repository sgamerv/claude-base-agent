/**
 * 服务端 session 历史清理
 * 导出 sessionHistories 的清理函数，供 API Route 调用
 * 
 * 注意：sessionHistories 定义在 server.ts 中，
 * 为避免循环依赖，将清理逻辑提取到独立模块
 */

// 与 server.ts 中的 sessionHistories 共享同一引用
// 通过 setter 注入
let sessionHistoriesRef: Map<string, any> | null = null;

export function setSessionHistoriesRef(ref: Map<string, any>): void {
  sessionHistoriesRef = ref;
}

export function clearServerSessionHistory(sessionId: string): void {
  if (sessionHistoriesRef) {
    sessionHistoriesRef.delete(sessionId);
    console.log(`[Session] Cleared server LLM history for: ${sessionId}`);
  }
}

export function getSessionHistoriesRef(): Map<string, any> | null {
  return sessionHistoriesRef;
}
