/**
 * Session 清理模块
 * 删除 session 时清理内存中的对话历史和前端消息缓存
 * 供 API Route 调用（纯 Node.js，不含 React 依赖）
 */

import { clearSessionStore } from "@/lib/store/session-data";
import { clearServerSessionHistory } from "./server-cleanup";

/**
 * 清理指定 session 的所有内存状态
 */
export function clearSessionHistory(sessionId: string): void {
  // 清理前端消息缓存
  clearSessionStore(sessionId);

  // 清理后端 LLM 对话历史
  clearServerSessionHistory(sessionId);

  console.log(`[Session] Cleared memory state for: ${sessionId}`);
}
