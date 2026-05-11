"use client";

import { useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useSocket } from "@/lib/hooks/useSocket";
import { useSessionStore } from "@/lib/store/session-store";
import type { ToolCallInfo, DiffInfo } from "@/lib/types/chat";
import ChatMessageComponent from "./ChatMessage";
import ChatInput from "./ChatInput";

interface ChatPanelProps {
  sessionId: string;
}

export default function ChatPanel({ sessionId }: ChatPanelProps) {
  const router = useRouter();
  const {
    messages,
    agentState,
    currentToolCallsRef,
    addMessage,
    syncMessages,
    syncAgentState,
    updateLastAssistantMessage,
    createMessage,
    genId,
  } = useSessionStore(sessionId);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 自动滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const { isConnected, sendMessage, replyToAgent, respondToApproval, respondToDiff, getDiffDetail, stopAgent } = useSocket({
    sessionId,
    // 流式文本增量
    onThinkingDelta: (delta) => {
      syncAgentState({ status: "thinking" });
      syncMessages((prev) => {
        const lastMsg = prev[prev.length - 1];
        if (lastMsg?.role === "assistant" && lastMsg.isThinking) {
          return [
            ...prev.slice(0, -1),
            { ...lastMsg, content: lastMsg.content + delta, isThinking: true },
          ];
        }
        return [
          ...prev,
          {
            id: genId(),
            role: "assistant",
            content: delta,
            timestamp: Date.now(),
            isThinking: true,
          },
        ];
      });
    },
    // 思考段结束
    onThinkingEnd: () => {
      updateLastAssistantMessage((msg) => ({
        ...msg,
        isThinking: false,
      }));
    },
    onToolCall: (data) => {
      syncAgentState({ status: "executing", currentAction: data.toolName });

      const toolCall: ToolCallInfo = {
        id: data.toolCallId,
        toolName: data.toolName,
        input: data.input,
        status: "calling",
      };
      currentToolCallsRef.current.set(data.toolCallId, toolCall);

      // 在当前或新的助手消息中添加工具调用
      syncMessages((prev) => {
        const lastMsg = prev[prev.length - 1];
        if (lastMsg?.role === "assistant") {
          return [
            ...prev.slice(0, -1),
            {
              ...lastMsg,
              isThinking: false,
              toolCalls: [...(lastMsg.toolCalls || []), toolCall],
            },
          ];
        }
        return [
          ...prev,
          {
            id: genId(),
            role: "assistant",
            content: "",
            timestamp: Date.now(),
            toolCalls: [toolCall],
          },
        ];
      });
    },
    onToolResult: (data) => {
      // 更新工具调用状态
      syncMessages((prev) =>
        prev.map((msg) => {
          if (msg.role !== "assistant" || !msg.toolCalls) return msg;
          return {
            ...msg,
            toolCalls: msg.toolCalls.map((t) =>
              t.id === data.toolName || t.toolName === data.toolName
                ? { ...t, status: data.success ? "completed" : "error" as const, result: data.content }
                : t
            ),
          };
        })
      );
    },
    onAskUser: (data) => {
      syncAgentState({ status: "waiting_input" });
      updateLastAssistantMessage((msg) => ({
        ...msg,
        isThinking: false,
        pendingInput: {
          question: data.question,
          toolCallId: data.toolCallId,
          options: data.options,
          multiple: data.multiple,
        },
      }));
    },
    onApprovalRequired: (data) => {
      syncAgentState({ status: "waiting_approval" });
      updateLastAssistantMessage((msg) => ({
        ...msg,
        isThinking: false,
        pendingApproval: { command: data.command, toolCallId: data.toolCallId },
      }));
    },
    // Phase 6: 文件变更通知 → 加载完整 Diff 并展示
    onFileChange: (data) => {
      syncAgentState({ status: "waiting_diff" });

      // 请求完整 Diff 详情
      getDiffDetail(data.diffId).then((detail) => {
        const diff: DiffInfo = {
          diffId: data.diffId,
          filePath: data.filePath,
          originalContent: detail?.originalContent ?? "",
          newContent: detail?.newContent ?? "",
          toolCallId: data.toolCallId,
        };

        updateLastAssistantMessage((msg) => ({
          ...msg,
          isThinking: false,
          pendingDiffs: [...(msg.pendingDiffs || []), diff],
        }));
      });
    },
    onFinalResponse: (content) => {
      syncAgentState({ status: "idle" });
      // 如果已有助手消息，更新内容；否则创建新的
      syncMessages((prev) => {
        const lastMsg = prev[prev.length - 1];
        if (lastMsg?.role === "assistant") {
          return [
            ...prev.slice(0, -1),
            { ...lastMsg, content: lastMsg.content || content, isThinking: false },
          ];
        }
        return [
          ...prev,
          {
            id: genId(),
            role: "assistant",
            content,
            timestamp: Date.now(),
          },
        ];
      });
    },
    onError: (error) => {
      syncAgentState({ status: "error" });
      addMessage(createMessage("system", `❌ ${error}`));
    },
  });

  const handleSend = useCallback((message: string) => {
    addMessage(createMessage("user", message));
    syncAgentState({ status: "thinking" });
    sendMessage(message);
  }, [addMessage, createMessage, syncAgentState, sendMessage]);

  const handleReply = useCallback((toolCallId: string, answer: string) => {
    addMessage(createMessage("user", answer));
    syncAgentState({ status: "thinking" });
    updateLastAssistantMessage((msg) => ({
      ...msg,
      pendingInput: undefined,
    }));
    replyToAgent(toolCallId, answer);
  }, [addMessage, createMessage, syncAgentState, updateLastAssistantMessage, replyToAgent]);

  const handleApproval = useCallback((toolCallId: string, approved: boolean) => {
    addMessage(createMessage("user", approved ? "✅ 已允许执行" : "❌ 已拒绝执行"));
    syncAgentState({ status: "thinking" });
    updateLastAssistantMessage((msg) => ({
      ...msg,
      pendingApproval: undefined,
    }));
    respondToApproval(toolCallId, approved);
  }, [addMessage, createMessage, syncAgentState, updateLastAssistantMessage, respondToApproval]);

  // Phase 6: Diff Accept/Reject
  const handleDiffAccept = useCallback((diffId: string) => {
    addMessage(createMessage("user", "✅ 已接受文件变更"));
    // 不立即设置 thinking 状态，等 Agent 下一个事件自然触发
    syncAgentState({ status: "executing", currentAction: "processing" });
    updateLastAssistantMessage((msg) => ({
      ...msg,
      pendingDiffs: msg.pendingDiffs?.filter((d) => d.diffId !== diffId),
    }));
    respondToDiff(diffId, true);
  }, [addMessage, createMessage, syncAgentState, updateLastAssistantMessage, respondToDiff]);

  const handleDiffReject = useCallback((diffId: string) => {
    addMessage(createMessage("user", "❌ 已拒绝文件变更"));
    // 不立即设置 thinking 状态，等 Agent 下一个事件自然触发
    syncAgentState({ status: "executing", currentAction: "processing" });
    updateLastAssistantMessage((msg) => ({
      ...msg,
      pendingDiffs: msg.pendingDiffs?.filter((d) => d.diffId !== diffId),
    }));
    respondToDiff(diffId, false);
  }, [addMessage, createMessage, syncAgentState, updateLastAssistantMessage, respondToDiff]);

  // Phase 6: 跳转到编辑器查看完整 Diff
  const handleJumpToEditor = useCallback((_sid: string, diffId: string) => {
    // 通过 URL 参数传递 diffId，编辑器页面可据此加载 Diff
    router.push(`/editor/${sessionId}?diff=${diffId}`);
  }, [router, sessionId]);

  const isDisabled =
    (agentState.status !== "idle" &&
     agentState.status !== "error" &&
     agentState.status !== "waiting_input" &&
     agentState.status !== "waiting_approval" &&
     agentState.status !== "waiting_diff");

  const isRunning =
    agentState.status === "thinking" || agentState.status === "executing";

  const handleStop = useCallback(() => {
    stopAgent();
    syncAgentState({ status: "idle" });
    addMessage(createMessage("system", "⏹ Agent 已停止"));
  }, [stopAgent, syncAgentState, addMessage, createMessage]);

  const statusText = {
    idle: "",
    thinking: "Agent 思考中...",
    executing: `Agent 执行中${agentState.currentAction ? `: ${agentState.currentAction}` : ""}...`,
    waiting_input: "等待你的回复...",
    waiting_approval: "等待审批...",
    waiting_diff: "等待确认文件变更...",
    error: "出错",
  }[agentState.status];

  return (
    <div className="flex flex-col h-full relative min-h-0">
      {/* 连接状态 */}
      {!isConnected && (
        <div className="bg-status-error text-white text-center text-xs py-1 z-10">
          连接断开，尝试重连中...
        </div>
      )}

      {/* 消息列表 */}
      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-6">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-text-muted">
            <div className="text-4xl mb-4">🤖</div>
            <h2 className="text-lg font-[510] text-text-primary mb-2">Cloud CDE Agent</h2>
            <p className="text-sm text-center max-w-md">
              你好！我是你的 AI 编程助手。你可以让我帮你分析代码、修复 Bug、重构项目等。
              <br />
              试试发送消息开始吧！
            </p>
            <div className="mt-6 grid grid-cols-2 gap-2 text-xs">
              {[
                "帮我看看当前目录下有哪些文件",
                "读取 package.json 的内容",
                "运行 npm test",
                "解释一下项目结构",
              ].map((suggestion) => (
                <button
                  key={suggestion}
                  onClick={() => handleSend(suggestion)}
                  className="rounded-lg border border-border-standard px-3 py-2 text-left text-text-secondary hover:bg-[rgba(255,255,255,0.04)] transition-colors"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((msg) => (
          <ChatMessageComponent
            key={msg.id}
            message={msg}
            onReply={handleReply}
            onApproval={handleApproval}
            onDiffAccept={handleDiffAccept}
            onDiffReject={handleDiffReject}
            onJumpToEditor={handleJumpToEditor}
            sessionId={sessionId}
          />
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* 输入区 */}
      <ChatInput onSend={handleSend} disabled={isDisabled} agentStatus={statusText} onStop={handleStop} isRunning={isRunning} />
    </div>
  );
}
