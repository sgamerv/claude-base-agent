"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useSocket } from "@/lib/hooks/useSocket";
import { useSessionStore } from "@/lib/store/session-store";
import type { ToolCallInfo, DiffInfo } from "@/lib/types/chat";
import DiffViewer from "@/components/common/DiffViewer";

interface AIPanelProps {
  sessionId: string;
  onFileOpen?: (path: string) => void;
  /** 编辑器入口的 Diff ID（从 URL 参数加载） */
  diffId?: string | null;
}

const QUICK_COMMANDS = [
  { label: "/fix", description: "修复当前文件的问题" },
  { label: "/refactor", description: "重构选中的代码" },
  { label: "/test", description: "为当前文件生成测试" },
  { label: "/explain", description: "解释当前文件逻辑" },
];

export default function AIPanel({ sessionId, onFileOpen, diffId }: AIPanelProps) {
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

  const [input, setInput] = useState("");
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [activeDiff, setActiveDiff] = useState<DiffInfo | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const { isConnected, sendMessage, replyToAgent, respondToApproval, respondToDiff, getDiffDetail } = useSocket({
    sessionId,
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
          { id: genId(), role: "assistant", content: delta, timestamp: Date.now(), isThinking: true },
        ];
      });
    },
    onThinkingEnd: () => {
      updateLastAssistantMessage((msg) => ({ ...msg, isThinking: false }));
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
      syncMessages((prev) => {
        const lastMsg = prev[prev.length - 1];
        if (lastMsg?.role === "assistant") {
          return [
            ...prev.slice(0, -1),
            { ...lastMsg, isThinking: false, toolCalls: [...(lastMsg.toolCalls || []), toolCall] },
          ];
        }
        return [
          ...prev,
          { id: genId(), role: "assistant", content: "", timestamp: Date.now(), toolCalls: [toolCall] },
        ];
      });
    },
    onToolResult: (data) => {
      syncMessages((prev) =>
        prev.map((msg) => {
          if (msg.role !== "assistant" || !msg.toolCalls) return msg;
          return {
            ...msg,
            toolCalls: msg.toolCalls.map((t) =>
              t.toolName === data.toolName
                ? { ...t, status: data.success ? "completed" as const : "error" as const, result: data.content }
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
        pendingInput: { question: data.question, toolCallId: data.toolCallId },
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
    onFileChange: (data) => {
      // 编辑器入口：加载完整 Diff 详情
      syncAgentState({ status: "waiting_diff" });
      getDiffDetail(data.diffId).then((detail) => {
        const diff: DiffInfo = {
          diffId: data.diffId,
          filePath: detail?.filePath ?? data.filePath,
          originalContent: detail?.originalContent ?? "",
          newContent: detail?.newContent ?? "",
          toolCallId: data.toolCallId,
        };
        setActiveDiff(diff);
        updateLastAssistantMessage((msg) => ({
          ...msg,
          isThinking: false,
          pendingDiffs: [...(msg.pendingDiffs || []), diff],
        }));
      });
    },
    onFinalResponse: (content) => {
      syncAgentState({ status: "idle" });
      syncMessages((prev) => {
        const lastMsg = prev[prev.length - 1];
        if (lastMsg?.role === "assistant") {
          return [...prev.slice(0, -1), { ...lastMsg, content: lastMsg.content || content, isThinking: false }];
        }
        return [...prev, { id: genId(), role: "assistant", content, timestamp: Date.now() }];
      });
    },
    onError: (error) => {
      syncAgentState({ status: "error" });
      addMessage(createMessage("system", `❌ ${error}`));
    },
  });

  const handleSend = () => {
    if (!input.trim()) return;
    addMessage(createMessage("user", input.trim()));
    syncAgentState({ status: "thinking" });
    sendMessage(input.trim());
    setInput("");
  };

  const handleQuickCommand = (cmd: string) => {
    addMessage(createMessage("user", cmd));
    syncAgentState({ status: "thinking" });
    sendMessage(cmd);
  };

  const handleReply = (toolCallId: string, answer: string) => {
    addMessage(createMessage("user", answer));
    syncAgentState({ status: "thinking" });
    updateLastAssistantMessage((msg) => ({ ...msg, pendingInput: undefined }));
    replyToAgent(toolCallId, answer);
  };

  const handleApproval = (toolCallId: string, approved: boolean) => {
    addMessage(createMessage("user", approved ? "✅ 已允许执行" : "❌ 已拒绝执行"));
    syncAgentState({ status: "thinking" });
    updateLastAssistantMessage((msg) => ({ ...msg, pendingApproval: undefined }));
    respondToApproval(toolCallId, approved);
  };

  const handleDiffAccept = (diffId: string) => {
    addMessage(createMessage("user", "✅ 已接受文件变更"));
    // 不立即设置 thinking 状态，等 Agent 下一个事件自然触发
    syncAgentState({ status: "executing", currentAction: "processing" });
    setActiveDiff(null);
    updateLastAssistantMessage((msg) => ({
      ...msg,
      pendingDiffs: msg.pendingDiffs?.filter((d) => d.diffId !== diffId),
    }));
    respondToDiff(diffId, true);
  };

  const handleDiffReject = (diffId: string) => {
    addMessage(createMessage("user", "❌ 已拒绝文件变更"));
    // 不立即设置 thinking 状态，等 Agent 下一个事件自然触发
    syncAgentState({ status: "executing", currentAction: "processing" });
    setActiveDiff(null);
    updateLastAssistantMessage((msg) => ({
      ...msg,
      pendingDiffs: msg.pendingDiffs?.filter((d) => d.diffId !== diffId),
    }));
    respondToDiff(diffId, false);
  };

  const isDisabled =
    agentState.status !== "idle" &&
    agentState.status !== "error" &&
    agentState.status !== "waiting_input" &&
    agentState.status !== "waiting_approval" &&
    agentState.status !== "waiting_diff";

  const statusText = {
    idle: "",
    thinking: "思考中...",
    executing: `执行中${agentState.currentAction ? `: ${agentState.currentAction}` : ""}...`,
    waiting_input: "等待回复...",
    waiting_approval: "等待审批...",
    waiting_diff: "确认变更...",
    error: "出错",
  }[agentState.status];

  if (isCollapsed) {
    return (
      <div className="flex flex-col items-center py-3 px-1 bg-zinc-50 dark:bg-zinc-900 border-l border-zinc-200 dark:border-zinc-700">
        <button
          onClick={() => setIsCollapsed(false)}
          className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 text-lg"
          title="展开 AI 面板"
        >
          🤖
        </button>
        {agentState.status !== "idle" && (
          <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse mt-2" />
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full border-l border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950">
      {/* 面板头部 */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900">
        <div className="flex items-center gap-2">
          <span className="text-sm">🤖</span>
          <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">AI 助手</span>
          {statusText && (
            <span className="text-xs text-blue-500 animate-pulse">{statusText}</span>
          )}
        </div>
        <button
          onClick={() => setIsCollapsed(true)}
          className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 text-xs"
        >
          ▶
        </button>
      </div>

      {/* Diff 预览区域（编辑器入口特有） */}
      {activeDiff && (
        <div className="border-b border-zinc-200 dark:border-zinc-700">
          <div className="px-3 py-1.5 bg-blue-50 dark:bg-blue-950/30 border-b border-zinc-200 dark:border-zinc-700">
            <span className="text-xs font-medium text-blue-700 dark:text-blue-300">📝 文件变更预览</span>
          </div>
          <div className="max-h-[50vh] overflow-auto">
            <DiffViewer
              diff={activeDiff}
              onAccept={handleDiffAccept}
              onReject={handleDiffReject}
            />
          </div>
        </div>
      )}

      {/* 快捷指令 */}
      {messages.length === 0 && !activeDiff && (
        <div className="px-3 py-2 border-b border-zinc-200 dark:border-zinc-700">
          <span className="text-xs text-zinc-400 block mb-2">快捷指令</span>
          <div className="grid grid-cols-2 gap-1">
            {QUICK_COMMANDS.map((cmd) => (
              <button
                key={cmd.label}
                onClick={() => handleQuickCommand(cmd.label)}
                disabled={isDisabled}
                className="text-left text-xs px-2 py-1.5 rounded border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-50 transition-colors"
              >
                <span className="font-mono font-medium">{cmd.label}</span>
                <span className="block text-zinc-400 text-[10px] mt-0.5">{cmd.description}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 消息列表 */}
      <div className="flex-1 overflow-y-auto px-3 py-2">
        {messages.length === 0 && !activeDiff ? (
          <div className="text-center text-zinc-400 text-xs py-4">
            输入消息或使用快捷指令与 AI 交互
          </div>
        ) : (
          messages.map((msg) => (
            <div key={msg.id} className="mb-3">
              {/* 消息内容 */}
              {msg.content && (
                <div
                  className={`text-xs rounded-lg px-3 py-2 ${
                    msg.role === "user"
                      ? "bg-blue-600 text-white ml-4"
                      : msg.role === "system"
                      ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200"
                      : "bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100 mr-4"
                  }`}
                >
                  {msg.content}
                </div>
              )}

              {/* 工具调用 */}
              {msg.toolCalls?.map((tc) => (
                <div key={tc.id} className="text-xs bg-zinc-50 dark:bg-zinc-800/50 rounded-lg px-3 py-2 mt-1 mr-4 border border-zinc-200 dark:border-zinc-700">
                  <div className="flex items-center gap-1.5">
                    <span className={`w-1.5 h-1.5 rounded-full ${tc.status === "calling" ? "bg-yellow-500 animate-pulse" : tc.status === "completed" ? "bg-green-500" : "bg-red-500"}`} />
                    <span className="font-medium text-zinc-600 dark:text-zinc-400">{tc.toolName}</span>
                    {tc.input.command && (
                      <code className="text-zinc-500 text-[10px] truncate max-w-[120px]">{tc.input.command}</code>
                    )}
                    {tc.input.path && (
                      <code className="text-zinc-500 text-[10px] truncate max-w-[120px]">{tc.input.path}</code>
                    )}
                  </div>
                  {tc.result && (
                    <pre className="text-[10px] text-zinc-500 mt-1 max-h-20 overflow-y-auto">{tc.result}</pre>
                  )}
                </div>
              ))}

              {/* Diff 卡片（编辑器入口的紧凑展示） */}
              {msg.pendingDiffs && msg.pendingDiffs.length > 0 && !activeDiff && msg.pendingDiffs.map((diff) => (
                <div key={diff.diffId} className="mt-2 mr-4">
                  <DiffViewer
                    diff={diff}
                    compact
                    onAccept={handleDiffAccept}
                    onReject={handleDiffReject}
                  />
                </div>
              ))}

              {/* 提问 */}
              {msg.pendingInput && (
                <div className="mt-2 mr-4">
                  <p className="text-xs text-zinc-600 dark:text-zinc-400 mb-1">{msg.pendingInput.question}</p>
                  <div className="flex gap-1">
                    <input
                      type="text"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          const target = e.target as HTMLInputElement;
                          if (target.value.trim()) {
                            handleReply(msg.pendingInput!.toolCallId, target.value.trim());
                          }
                        }
                      }}
                      className="flex-1 text-xs rounded border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 px-2 py-1 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      placeholder="回复..."
                      autoFocus
                    />
                    <button
                      onClick={() => {
                        const inputEl = document.querySelector<HTMLInputElement>(`[data-pending="${msg.pendingInput!.toolCallId}"]`);
                        if (inputEl?.value.trim()) {
                          handleReply(msg.pendingInput!.toolCallId, inputEl.value.trim());
                        }
                      }}
                      className="text-xs bg-blue-600 text-white px-2 py-1 rounded hover:bg-blue-700"
                    >
                      回复
                    </button>
                  </div>
                </div>
              )}

              {/* 审批 */}
              {msg.pendingApproval && (
                <div className="mt-2 mr-4 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2">
                  <p className="text-xs text-red-600 dark:text-red-400 mb-1">⚠️ 需要审批</p>
                  <code className="text-[10px] block bg-red-50 dark:bg-red-950 text-red-800 dark:text-red-200 p-1 rounded mb-2 font-mono">
                    $ {msg.pendingApproval.command}
                  </code>
                  <div className="flex gap-1">
                    <button
                      onClick={() => handleApproval(msg.pendingApproval!.toolCallId, true)}
                      className="text-xs bg-red-600 text-white px-2 py-1 rounded hover:bg-red-700"
                    >
                      允许
                    </button>
                    <button
                      onClick={() => handleApproval(msg.pendingApproval!.toolCallId, false)}
                      className="text-xs border border-zinc-300 dark:border-zinc-600 px-2 py-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800"
                    >
                      拒绝
                    </button>
                  </div>
                </div>
              )}

              {/* 思考中 */}
              {msg.isThinking && !msg.content && (
                <div className="flex items-center gap-1 text-xs text-zinc-400 mr-4">
                  <span className="w-1 h-1 bg-zinc-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="w-1 h-1 bg-zinc-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="w-1 h-1 bg-zinc-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
              )}
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* 输入区 */}
      <div className="border-t border-zinc-200 dark:border-zinc-700 px-3 py-2">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            disabled={isDisabled}
            placeholder="输入消息或 / 指令..."
            className="flex-1 text-xs rounded-lg border border-zinc-300 dark:border-zinc-600 bg-zinc-50 dark:bg-zinc-800 px-3 py-2 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isDisabled}
            className="rounded-lg bg-blue-600 px-3 py-2 text-xs text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            发送
          </button>
        </div>
      </div>
    </div>
  );
}
