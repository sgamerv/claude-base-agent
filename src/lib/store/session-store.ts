/**
 * 全局 Session Store
 * 共享聊天消息状态，确保聊天页面和编辑器页面切换时对话历史不丢失
 * 
 * 注意：纯数据导出在 session-data.ts 中，本文件只包含 React hooks
 */

// 从纯数据层重新导出（供客户端组件使用）
export {
  sessionMessagesMap,
  sessionAgentStateMap,
  getSessionMessages,
  getSessionAgentState,
  clearSessionStore,
} from "./session-data";

import { useState, useCallback, useRef } from "react";
import { sessionMessagesMap, sessionAgentStateMap } from "./session-data";
import type { ChatMessage, AgentState, ToolCallInfo } from "@/lib/types/chat";

let idCounter = 0;
function genId() {
  return `msg-${Date.now()}-${++idCounter}`;
}

/**
 * React Hook: 使用全局 session store
 * 多个组件使用同一 sessionId 会共享同一份数据
 */
export function useSessionStore(sessionId: string) {
  // 初始化：从全局 store 读取
  const [messages, setMessages] = useState<ChatMessage[]>(
    () => sessionMessagesMap.get(sessionId) || []
  );
  const [agentState, setAgentState] = useState<AgentState>(
    () => sessionAgentStateMap.get(sessionId) || { status: "idle" }
  );
  const currentToolCallsRef = useRef<Map<string, ToolCallInfo>>(new Map());

  // 同步到全局 store
  const syncMessages = useCallback(
    (updater: (prev: ChatMessage[]) => ChatMessage[]) => {
      setMessages((prev) => {
        const next = updater(prev);
        sessionMessagesMap.set(sessionId, next);
        return next;
      });
    },
    [sessionId]
  );

  const syncAgentState = useCallback(
    (state: AgentState) => {
      setAgentState(state);
      sessionAgentStateMap.set(sessionId, state);
    },
    [sessionId]
  );

  const addMessage = useCallback(
    (msg: ChatMessage) => {
      syncMessages((prev) => [...prev, msg]);
    },
    [syncMessages]
  );

  const updateLastAssistantMessage = useCallback(
    (updater: (msg: ChatMessage) => ChatMessage) => {
      syncMessages((prev) => {
        const idx = prev.findLastIndex((m) => m.role === "assistant");
        if (idx === -1) return prev;
        const updated = [...prev];
        updated[idx] = updater(prev[idx]);
        return updated;
      });
    },
    [syncMessages]
  );

  const createMessage = useCallback(
    (role: ChatMessage["role"], content: string, extra?: Partial<ChatMessage>): ChatMessage => {
      return {
        id: genId(),
        role,
        content,
        timestamp: Date.now(),
        ...extra,
      };
    },
    []
  );

  return {
    messages,
    agentState,
    currentToolCallsRef,
    addMessage,
    syncMessages,
    syncAgentState,
    updateLastAssistantMessage,
    createMessage,
    genId,
  };
}
