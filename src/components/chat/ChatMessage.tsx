"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ChatMessage as ChatMessageType, ToolCallInfo, DiffInfo, SelectOption } from "@/lib/types/chat";
import DiffViewer from "@/components/common/DiffViewer";

interface ChatMessageProps {
  message: ChatMessageType;
  onReply: (toolCallId: string, answer: string) => void;
  onApproval: (toolCallId: string, approved: boolean) => void;
  onDiffAccept: (diffId: string) => void;
  onDiffReject: (diffId: string) => void;
  onJumpToEditor?: (sessionId: string, diffId: string) => void;
  sessionId: string;
}

// 工具名称友好映射
const TOOL_LABELS: Record<string, { icon: string; label: string }> = {
  read_directory: { icon: "📁", label: "读取目录" },
  read_file: { icon: "📄", label: "读取文件" },
  write_file: { icon: "✏️", label: "写入文件" },
  execute_bash: { icon: "⚡", label: "执行命令" },
  ask_user: { icon: "❓", label: "向你提问" },
  git_status: { icon: "🔀", label: "Git 状态" },
  git_diff: { icon: "🔀", label: "Git 差异" },
  web_search: { icon: "🔍", label: "Web 搜索" },
  http_request: { icon: "🌐", label: "HTTP 请求" },
  review_file: { icon: "👀", label: "代码审查" },
};

function ToolCallCard({ tc }: { tc: ToolCallInfo }) {
  const [expanded, setExpanded] = useState(tc.status !== "completed");
  const toolMeta = TOOL_LABELS[tc.toolName] || { icon: "🔧", label: tc.toolName };

  return (
    <div className="rounded-lg border border-border-standard bg-[rgba(255,255,255,0.02)] overflow-hidden">
      {/* 工具头部 */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-3 py-2 hover:bg-[rgba(255,255,255,0.04)] transition-colors"
      >
        <div className="flex items-center gap-2">
          <span
            className={`inline-block w-2 h-2 rounded-full ${
              tc.status === "calling"
                ? "bg-status-warning animate-pulse"
                : tc.status === "completed"
                ? "bg-status-success"
                : "bg-status-error"
            }`}
          />
          <span className="text-sm">{toolMeta.icon}</span>
          <span className="text-sm font-medium text-text-secondary">
            {toolMeta.label}
          </span>
          {tc.toolName === "execute_bash" && tc.input.command && (
            <code className="text-xs font-mono text-text-muted truncate max-w-[200px]">
              {tc.input.command}
            </code>
          )}
          {tc.toolName === "read_file" && tc.input.path && (
            <code className="text-xs font-mono text-text-muted truncate max-w-[200px]">
              {tc.input.path}
            </code>
          )}
          {tc.toolName === "read_directory" && tc.input.path && (
            <code className="text-xs font-mono text-text-muted truncate max-w-[200px]">
              {tc.input.path}
            </code>
          )}
          {tc.toolName === "write_file" && tc.input.path && (
            <code className="text-xs font-mono text-text-muted truncate max-w-[200px]">
              {tc.input.path}
            </code>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-text-muted">
            {tc.status === "calling" ? "执行中..." : tc.status === "completed" ? "完成" : "错误"}
          </span>
          <span className="text-text-muted text-xs">{expanded ? "▼" : "▶"}</span>
        </div>
      </button>

      {/* 展开详情 */}
      {expanded && (
        <div className="border-t border-border-subtle px-3 py-2">
          {/* 工具输入 */}
          <div className="mb-2">
            <span className="text-xs text-text-muted block mb-1">输入参数</span>
            <pre className="text-xs font-mono text-text-muted bg-[rgba(255,255,255,0.03)] rounded p-2 overflow-x-auto max-h-32 overflow-y-auto">
              {JSON.stringify(tc.input, null, 2)}
            </pre>
          </div>

          {/* 工具结果 */}
          {tc.result && (
            <div>
              <span className="text-xs text-text-muted block mb-1">
                {tc.status === "completed" ? "执行结果" : "错误信息"}
              </span>
              <pre
                className={`text-xs font-mono rounded p-2 overflow-x-auto max-h-48 overflow-y-auto ${
                  tc.status === "completed"
                    ? "text-status-success bg-[rgba(39,166,68,0.08)]"
                    : "text-status-error bg-[rgba(229,72,77,0.08)]"
                }`}
              >
                {tc.result}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Agent 提问区域（结构化选项 + 文本输入）
 */
function PendingInputArea({
  pendingInput,
  replyText,
  setReplyText,
  onReply,
}: {
  pendingInput: NonNullable<ChatMessageType["pendingInput"]>;
  replyText: string;
  setReplyText: (v: string) => void;
  onReply: (toolCallId: string, answer: string) => void;
}) {
  const { question, toolCallId, options, multiple } = pendingInput;
  const [selectedValues, setSelectedValues] = useState<string[]>([]);

  // 当有结构化选项时，清理 question 中重复的列表文本
  const displayQuestion = options && options.length > 0
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

  const hasOptions = options && options.length > 0;

  return (
    <div className="mt-3 border-t border-border-subtle pt-3">
      {/* 问题 */}
      <div className="flex items-start gap-2 mb-3">
        <span className="text-base">❓</span>
        <p className="text-sm flex-1">{displayQuestion}</p>
      </div>

      {/* 选项卡片 */}
      {hasOptions && (
        <div className="space-y-2 mb-3">
          {options!.map((opt) => {
            const isSelected = selectedValues.includes(opt.value);
            return (
              <button
                key={opt.value}
                onClick={() => handleSelect(opt.value)}
                className={`w-full text-left rounded-lg border px-3 py-2.5 transition-colors ${
                  isSelected
                    ? "border-accent-brand bg-[rgba(94,106,210,0.08)]"
                    : "border-border-standard hover:bg-[rgba(255,255,255,0.04)]"
                }`}
              >
                <div className="flex items-start gap-2.5">
                  {/* 选择指示器 */}
                  <span className="mt-0.5 flex-shrink-0">
                    {multiple ? (
                      <span className={`inline-block w-4 h-4 rounded border ${
                        isSelected
                          ? "bg-accent-brand border-accent-brand text-white text-[10px] flex items-center justify-center"
                          : "border-[#3e3e44]"
                      }`}>
                        {isSelected && "✓"}
                      </span>
                    ) : (
                      <span className={`inline-block w-4 h-4 rounded-full border-2 ${
                        isSelected
                          ? "border-accent-brand"
                          : "border-[#3e3e44]"
                      }`}>
                        {isSelected && (
                          <span className="block w-2 h-2 rounded-full bg-accent-brand m-auto mt-[3px]" />
                        )}
                      </span>
                    )}
                  </span>
                  {/* 选项内容 */}
                  <div className="flex-1 min-w-0">
                    <span className={`text-sm font-medium ${
                      isSelected ? "text-accent-hover" : "text-text-primary"
                    }`}>
                      {opt.label}
                    </span>
                    {opt.description && (
                      <p className="text-xs text-text-muted mt-0.5">
                        {opt.description}
                      </p>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* 确认按钮（有选项时显示） */}
      {hasOptions && (
        <div className="flex gap-2 mb-2">
          <button
            onClick={handleConfirm}
            disabled={selectedValues.length === 0}
            className="rounded-lg bg-accent-brand px-4 py-1.5 text-sm text-white hover:bg-accent-hover disabled:opacity-50 transition-colors"
          >
            {multiple
              ? `确认选择 (${selectedValues.length})`
              : "确认选择"}
          </button>
        </div>
      )}

      {/* 文本输入（始终可用，允许自定义回复） */}
      <div className="flex gap-2">
        <input
          type="text"
          value={replyText}
          onChange={(e) => setReplyText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && replyText.trim()) {
              onReply(toolCallId, replyText.trim());
              setReplyText("");
            }
          }}
          placeholder={hasOptions ? "或输入自定义回复..." : "输入回复..."}
          className="flex-1 rounded-lg border border-border-standard bg-[rgba(255,255,255,0.03)] px-3 py-1.5 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-brand"
        />
        <button
          onClick={() => {
            if (replyText.trim()) {
              onReply(toolCallId, replyText.trim());
              setReplyText("");
            }
          }}
          disabled={!replyText.trim()}
          className="rounded-lg bg-accent-brand px-3 py-1.5 text-sm text-white disabled:opacity-50 hover:bg-accent-hover transition-colors"
        >
          回复
        </button>
      </div>
    </div>
  );
}

export default function ChatMessage({
  message,
  onReply,
  onApproval,
  onDiffAccept,
  onDiffReject,
  onJumpToEditor,
  sessionId,
}: ChatMessageProps) {
  const [replyText, setReplyText] = useState("");

  const isUser = message.role === "user";
  const isSystem = message.role === "system";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} mb-4`}>
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-3 ${
          isUser
            ? "bg-accent-brand text-white"
            : isSystem
            ? "bg-[rgba(245,166,35,0.08)] text-status-warning"
            : "bg-[rgba(255,255,255,0.03)] text-text-primary border border-[rgba(255,255,255,0.06)]"
        }`}
      >
        {/* 角色标签 */}
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs font-medium opacity-70">
            {isUser ? "你" : isSystem ? "系统" : "🤖 AI Agent"}
          </span>
          <span className="text-xs opacity-50">
            {new Date(message.timestamp).toLocaleTimeString("zh-CN", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        </div>

        {/* 消息内容 — Markdown 渲染 */}
        {message.content && (
          <div className="text-sm leading-relaxed prose prose-sm dark:prose-invert max-w-none prose-p:my-1 prose-pre:my-2 prose-code:text-xs prose-code:text-text-muted prose-pre:p-2 prose-pre:text-text-muted">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
          </div>
        )}

        {/* 工具调用信息 — 可折叠卡片 */}
        {message.toolCalls && message.toolCalls.length > 0 && (
          <div className="mt-3 space-y-2">
            {message.toolCalls.map((tc) => (
              <ToolCallCard key={tc.id} tc={tc} />
            ))}
          </div>
        )}

        {/* Diff 预览卡片 */}
        {message.pendingDiffs && message.pendingDiffs.length > 0 && (
          <div className="mt-3 space-y-3">
            {message.pendingDiffs.map((diff) => (
              <DiffViewer
                key={diff.diffId}
                diff={diff}
                compact
                onAccept={onDiffAccept}
                onReject={onDiffReject}
              />
            ))}
            {/* 跳转到编辑器查看完整 Diff */}
            {onJumpToEditor && message.pendingDiffs.length > 0 && (
              <button
                onClick={() => onJumpToEditor(sessionId, message.pendingDiffs![0].diffId)}
                className="text-xs text-accent-link hover:underline flex items-center gap-1"
              >
                📝 在编辑器中查看完整 Diff →
              </button>
            )}
          </div>
        )}

        {/* Agent 提问（结构化选项 + 文本输入） */}
        {message.pendingInput && (
          <PendingInputArea
            pendingInput={message.pendingInput}
            replyText={replyText}
            setReplyText={setReplyText}
            onReply={onReply}
          />
        )}

        {/* 审批请求 */}
        {message.pendingApproval && (
          <div className="mt-3 border-t border-[rgba(229,72,77,0.2)] pt-3">
            <div className="flex items-start gap-2 mb-2">
              <span className="text-base">⚠️</span>
              <p className="text-sm text-status-error">需要审批以下命令</p>
            </div>
            <code className="block text-xs bg-[rgba(229,72,77,0.08)] text-status-error p-2 rounded mb-3 font-mono overflow-x-auto">
              $ {message.pendingApproval.command}
            </code>
            <div className="flex gap-2">
              <button
                onClick={() => onApproval(message.pendingApproval!.toolCallId, true)}
                className="rounded-lg bg-status-error hover:bg-[#d03d42] px-3 py-1.5 text-sm text-white transition-colors"
              >
                允许执行
              </button>
              <button
                onClick={() => onApproval(message.pendingApproval!.toolCallId, false)}
                className="rounded-lg border border-border-standard px-3 py-1.5 text-sm text-text-secondary hover:bg-[rgba(255,255,255,0.04)] transition-colors"
              >
                拒绝
              </button>
            </div>
          </div>
        )}

        {/* 思考中指示 */}
        {message.isThinking && !message.content && (
          <div className="flex items-center gap-2 text-sm text-text-muted">
            <div className="flex gap-1">
              <span className="w-1.5 h-1.5 bg-text-muted rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
              <span className="w-1.5 h-1.5 bg-text-muted rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
              <span className="w-1.5 h-1.5 bg-text-muted rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
            </div>
            <span>思考中...</span>
          </div>
        )}
      </div>
    </div>
  );
}
