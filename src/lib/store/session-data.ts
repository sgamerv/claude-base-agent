/**
 * 全局 Session 数据存储（纯数据层，不含 React hooks）
 * 供 Server Component (API Route) 和 Client Component 共同使用
 */

import type { ChatMessage, AgentState } from "@/lib/types/chat";

// 全局内存存储 — 跨页面/组件共享
export const sessionMessagesMap = new Map<string, ChatMessage[]>();
export const sessionAgentStateMap = new Map<string, AgentState>();

/**
 * 获取 session 的历史消息（只读快照）
 */
export function getSessionMessages(sessionId: string): ChatMessage[] {
  return sessionMessagesMap.get(sessionId) || [];
}

/**
 * 获取 session 的 agent 状态
 */
export function getSessionAgentState(sessionId: string): AgentState {
  return sessionAgentStateMap.get(sessionId) || { status: "idle" };
}

/**
 * 清理指定 session 的前端内存状态
 */
export function clearSessionStore(sessionId: string): void {
  sessionMessagesMap.delete(sessionId);
  sessionAgentStateMap.delete(sessionId);
}
