"use client";

/**
 * Socket.io 客户端 Hook
 * 管理 WebSocket 连接和事件监听
 * 支持流式 Agent 响应 + Diff 预览
 * Phase 6: 增加 file_change / diff_response / get_diff_detail
 */

import { useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";
import type { SelectOption } from "@/lib/types/chat";

interface FileChangeEvent {
  sessionId: string;
  diffId: string;
  filePath: string;
  toolCallId: string;
  stats: { added: number; removed: number };
}

interface AskUserData {
  question: string;
  toolCallId: string;
  options?: SelectOption[];
  multiple?: boolean;
}

interface UseSocketOptions {
  sessionId: string;
  onThinkingDelta?: (delta: string) => void;
  onThinkingEnd?: (fullContent: string) => void;
  onToolCall?: (data: { toolCallId: string; toolName: string; input: Record<string, string> }) => void;
  onToolResult?: (data: { toolName: string; success: boolean; content: string }) => void;
  onAskUser?: (data: AskUserData) => void;
  onApprovalRequired?: (data: { command: string; toolCallId: string }) => void;
  onFileChange?: (data: FileChangeEvent) => void;
  onFinalResponse?: (content: string) => void;
  onError?: (error: string) => void;
}

export function useSocket(options: UseSocketOptions) {
  const {
    sessionId,
    onThinkingDelta,
    onThinkingEnd,
    onToolCall,
    onToolResult,
    onAskUser,
    onApprovalRequired,
    onFileChange,
    onFinalResponse,
    onError,
  } = options;

  const socketRef = useRef<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    const socket = io({
      path: "/socket.io",
      transports: ["websocket", "polling"],
    });

    socketRef.current = socket;

    socket.on("connect", () => {
      setIsConnected(true);
      socket.emit("join_session", sessionId);
    });

    socket.on("disconnect", () => {
      setIsConnected(false);
    });

    // Agent 流式事件
    socket.on("agent_thinking_delta", (data) => {
      if (data.sessionId === sessionId) onThinkingDelta?.(data.delta);
    });

    socket.on("agent_thinking_end", (data) => {
      if (data.sessionId === sessionId) onThinkingEnd?.(data.fullContent);
    });

    socket.on("agent_tool_call", (data) => {
      if (data.sessionId === sessionId) onToolCall?.(data);
    });

    socket.on("agent_tool_result", (data) => {
      if (data.sessionId === sessionId) onToolResult?.(data);
    });

    socket.on("agent_needs_input", (data) => {
      if (data.sessionId === sessionId) onAskUser?.(data);
    });

    socket.on("approval_required", (data) => {
      if (data.sessionId === sessionId) onApprovalRequired?.(data);
    });

    // Phase 6: 文件变更通知
    socket.on("file_change", (data: FileChangeEvent) => {
      if (data.sessionId === sessionId) onFileChange?.(data);
    });

    socket.on("agent_response", (data) => {
      if (data.sessionId === sessionId) onFinalResponse?.(data.content);
    });

    socket.on("agent_error", (data) => {
      if (data.sessionId === sessionId) onError?.(data.error);
    });

    return () => {
      socket.emit("leave_session", sessionId);
      socket.disconnect();
    };
  }, [sessionId]); // eslint-disable-line react-hooks/exhaustive-deps

  const sendMessage = (message: string) => {
    socketRef.current?.emit("send_message", { sessionId, message });
  };

  const replyToAgent = (toolCallId: string, answer: string) => {
    socketRef.current?.emit("user_reply", { toolCallId, answer });
  };

  const respondToApproval = (toolCallId: string, approved: boolean) => {
    socketRef.current?.emit("approval_response", { toolCallId, approved });
  };

  const respondToDiff = (diffId: string, accepted: boolean) => {
    socketRef.current?.emit("diff_response", { sessionId, diffId, accepted });
  };

  const getDiffDetail = (diffId: string): Promise<{
    filePath: string;
    originalContent: string;
    newContent: string;
  } | null> => {
    return new Promise((resolve) => {
      socketRef.current?.emit("get_diff_detail", { sessionId, diffId }, (detail: any) => {
        resolve(detail);
      });
    });
  };

  const stopAgent = () => {
    socketRef.current?.emit("stop_agent", { sessionId });
  };

  return {
    isConnected,
    sendMessage,
    replyToAgent,
    respondToApproval,
    respondToDiff,
    getDiffDetail,
    stopAgent,
  };
}
