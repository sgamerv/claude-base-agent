"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useSocket } from "@/lib/hooks/useSocket";
import { useSessionStore } from "@/lib/store/session-store";
import type { ToolCallInfo, DiffInfo, SelectOption } from "@/lib/types/chat";
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

/**
 * 编辑器入口的提问区域（紧凑版选项卡片）
 */
function AIPanelPendingInput({
  pendingInput,
  onReply,
}: {
  pendingInput: { question: string; toolCallId: string; options?: SelectOption[]; multiple?: boolean };
  onReply: (toolCallId: string, answer: string) => void;
}) {
  const { question, toolCallId, options, multiple } = pendingInput;
  const [selectedValues, setSelectedValues] = useState<string[]>([]);
  const [customReply, setCustomReply] = useState("");

  // 当有结构化选项时，清理 question 中重复的列表文本
  const hasOptions = options && options.length > 0;
  const displayQuestion = hasOptions
    ? question.replace(/\n\s*[-*•]\s+.+(\n\s*[-*•]\s+.+)*/g, "").replace(/\n\s*\d+[.)]\s+.+(\n\s*\d+[.)]\s+.+)*/g, "").replace(/\n\s*例如：\s*/gi, "").trim()
    : question;

  const handleSelect = (value: string) => {
    if (multiple) {
      setSelectedValues((prev) =>
        prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]
      );
    } else {
      setSelectedValues([value]);
    }
  };

  const handleConfirm = () => {
    if (selectedValues.length > 0) {
      onReply(toolCallId, selectedValues.join(", "));
    }
  };

  return (
    <div className="mt-2 mr-4">
      <p className="text-xs text-text-tertiary mb-1.5">{displayQuestion}</p>

      {/* 选项卡片 */}
      {hasOptions && (
        <div className="space-y-1 mb-2">
          {options!.map((opt) => {
            const isSelected = selectedValues.includes(opt.value);
            return (
              <button
                key={opt.value}
                onClick={() => handleSelect(opt.value)}
                className={`w-full text-left rounded border px-2 py-1.5 transition-colors ${
                  isSelected
                    ? "border-accent-brand bg-[rgba(94,106,210,0.08)]"
                    : "border-border-standard hover:bg-[rgba(255,255,255,0.04)]"
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <span className="flex-shrink-0 text-[10px]">
                    {multiple ? (isSelected ? "☑" : "☐") : (isSelected ? "◉" : "○")}
                  </span>
                  <span className={`text-xs ${isSelected ? "text-accent-hover font-[510]" : "text-text-primary"}`}>
                    {opt.label}
                  </span>
                </div>
                {opt.description && (
                  <p className="text-[10px] text-text-muted ml-4 mt-0.5">{opt.description}</p>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* 确认按钮 */}
      {hasOptions && (
        <button
          onClick={handleConfirm}
          disabled={selectedValues.length === 0}
          className="text-xs bg-accent-brand text-white px-2 py-1 rounded hover:bg-accent-hover disabled:opacity-50 mb-1.5"
        >
          {multiple ? `确认 (${selectedValues.length})` : "确认"}
        </button>
      )}

      {/* 文本输入 */}
      <div className="flex gap-1">
        <input
          type="text"
          value={customReply}
          onChange={(e) => setCustomReply(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && customReply.trim()) {
              onReply(toolCallId, customReply.trim());
              setCustomReply("");
            }
          }}
          className="flex-1 text-xs rounded border border-border-standard bg-[rgba(255,255,255,0.03)] px-2 py-1 text-text-primary focus:outline-none focus:ring-1 focus:ring-accent-brand"
          placeholder={hasOptions ? "自定义回复..." : "回复..."}
          autoFocus={!hasOptions}
        />
        <button
          onClick={() => {
            if (customReply.trim()) {
              onReply(toolCallId, customReply.trim());
              setCustomReply("");
            }
          }}
          disabled={!customReply.trim()}
          className="text-xs bg-accent-brand text-white px-2 py-1 rounded hover:bg-accent-hover disabled:opacity-50"
        >
          回复
        </button>
      </div>
    </div>
  );
}

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
      <div className="flex flex-col items-center py-3 px-1 bg-bg-panel border-l border-border-subtle">
        <button
          onClick={() => setIsCollapsed(false)}
          className="text-text-muted hover:text-text-secondary text-lg"
          title="展开 AI 面板"
        >
          🤖
        </button>
        {agentState.status !== "idle" && (
          <div className="w-2 h-2 rounded-full bg-accent-interactive animate-pulse mt-2" />
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full border-l border-border-subtle bg-bg-marketing">
      {/* 面板头部 */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border-subtle bg-bg-panel">
        <div className="flex items-center gap-2">
          <span className="text-sm">🤖</span>
          <span className="text-xs font-medium text-text-tertiary font-[510]">AI 助手</span>
          {statusText && (
            <span className="text-xs text-accent-interactive animate-pulse">{statusText}</span>
          )}
        </div>
        <button
          onClick={() => setIsCollapsed(true)}
          className="text-text-muted hover:text-text-secondary text-xs"
        >
          ▶
        </button>
      </div>

      {/* Diff 预览区域（编辑器入口特有） */}
      {activeDiff && (
        <div className="border-b border-border-subtle">
          <div className="px-3 py-1.5 bg-[rgba(94,106,210,0.06)] border-b border-border-subtle">
            <span className="text-xs font-medium text-accent-hover font-[510]">📝 文件变更预览</span>
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
        <div className="px-3 py-2 border-b border-border-subtle">
          <span className="text-xs text-text-muted block mb-2">快捷指令</span>
          <div className="grid grid-cols-2 gap-1">
            {QUICK_COMMANDS.map((cmd) => (
              <button
                key={cmd.label}
                onClick={() => handleQuickCommand(cmd.label)}
                disabled={isDisabled}
                className="text-left text-xs px-2 py-1.5 rounded border border-border-standard text-text-secondary hover:bg-[rgba(255,255,255,0.04)] disabled:opacity-50 transition-colors"
              >
                <span className="font-mono font-medium">{cmd.label}</span>
                <span className="block text-text-muted text-[10px] mt-0.5">{cmd.description}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 消息列表 */}
      <div className="flex-1 overflow-y-auto px-3 py-2">
        {messages.length === 0 && !activeDiff ? (
          <div className="text-center text-text-muted text-xs py-4">
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
                      ? "bg-accent-brand text-white ml-4"
                      : msg.role === "system"
                      ? "bg-[rgba(245,166,35,0.08)] text-status-warning"
                      : "bg-[rgba(255,255,255,0.03)] text-text-primary mr-4"
                  }`}
                >
                  {msg.content}
                </div>
              )}

              {/* 工具调用 */}
              {msg.toolCalls?.map((tc) => (
                <div key={tc.id} className="text-xs bg-[rgba(255,255,255,0.02)] rounded-lg px-3 py-2 mt-1 mr-4 border border-border-standard">
                  <div className="flex items-center gap-1.5">
                    <span className={`w-1.5 h-1.5 rounded-full ${tc.status === "calling" ? "bg-status-warning animate-pulse" : tc.status === "completed" ? "bg-status-success" : "bg-status-error"}`} />
                    <span className="font-medium text-text-tertiary">{tc.toolName}</span>
                    {tc.input.command && (
                      <code className="text-text-muted text-[10px] truncate max-w-[120px]">{tc.input.command}</code>
                    )}
                    {tc.input.path && (
                      <code className="text-text-muted text-[10px] truncate max-w-[120px]">{tc.input.path}</code>
                    )}
                  </div>
                  {tc.result && (
                    <pre className="text-[10px] text-text-muted mt-1 max-h-20 overflow-y-auto">{tc.result}</pre>
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

              {/* 提问（结构化选项 + 文本输入） */}
              {msg.pendingInput && (
                <AIPanelPendingInput
                  pendingInput={msg.pendingInput}
                  onReply={handleReply}
                />
              )}

              {/* 审批 */}
              {msg.pendingApproval && (
                <div className="mt-2 mr-4 border border-[rgba(229,72,77,0.2)] rounded-lg px-3 py-2">
                  <p className="text-xs text-status-error mb-1">⚠️ 需要审批</p>
                  <code className="text-[10px] block bg-[rgba(229,72,77,0.08)] text-status-error p-1 rounded mb-2 font-mono">
                    $ {msg.pendingApproval.command}
                  </code>
                  <div className="flex gap-1">
                    <button
                      onClick={() => handleApproval(msg.pendingApproval!.toolCallId, true)}
                      className="text-xs bg-status-error text-white px-2 py-1 rounded hover:bg-[#d03d42]"
                    >
                      允许
                    </button>
                    <button
                      onClick={() => handleApproval(msg.pendingApproval!.toolCallId, false)}
                      className="text-xs border border-border-standard px-2 py-1 rounded hover:bg-[rgba(255,255,255,0.04)]"
                    >
                      拒绝
                    </button>
                  </div>
                </div>
              )}

              {/* 思考中 */}
              {msg.isThinking && !msg.content && (
                <div className="flex items-center gap-1 text-xs text-text-muted mr-4">
                  <span className="w-1 h-1 bg-text-muted rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="w-1 h-1 bg-text-muted rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="w-1 h-1 bg-text-muted rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
              )}
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* 输入区 */}
      <div className="border-t border-border-subtle px-3 py-2">
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
            className="flex-1 text-xs rounded-lg border border-border-standard bg-[rgba(255,255,255,0.02)] px-3 py-2 text-text-primary placeholder-text-muted focus:outline-none focus:ring-1 focus:ring-accent-brand disabled:opacity-50"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isDisabled}
            className="rounded-lg bg-accent-brand px-3 py-2 text-xs text-white hover:bg-accent-hover disabled:opacity-50 transition-colors"
          >
            发送
          </button>
        </div>
      </div>
    </div>
  );
}
