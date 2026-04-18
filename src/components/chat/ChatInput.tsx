"use client";

import { useState, useRef, useEffect } from "react";

interface ChatInputProps {
  onSend: (message: string) => void;
  disabled?: boolean;
  agentStatus?: string;
}

export default function ChatInput({ onSend, disabled, agentStatus }: ChatInputProps) {
  const [input, setInput] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 自动调整高度
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  }, [input]);

  const handleSend = () => {
    if (input.trim() && !disabled) {
      onSend(input.trim());
      setInput("");
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="border-t border-border-subtle bg-bg-panel p-4">
      {/* Agent 状态指示 */}
      {agentStatus && agentStatus !== "idle" && (
        <div className="flex items-center gap-2 mb-2 text-xs text-text-muted">
          <span className="w-2 h-2 rounded-full bg-accent-interactive animate-pulse" />
          <span>{agentStatus === "thinking" ? "Agent 思考中..." : agentStatus === "executing" ? "Agent 执行中..." : agentStatus}</span>
        </div>
      )}

      <div className="flex gap-3 items-end">
        <div className="flex-1 relative">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="输入消息，按 Enter 发送，Shift+Enter 换行..."
            disabled={disabled}
            rows={1}
            className="w-full resize-none rounded-xl border border-border-standard bg-[rgba(255,255,255,0.02)] px-4 py-3 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-accent-brand focus:border-transparent disabled:opacity-50"
          />
        </div>
        <button
          onClick={handleSend}
          disabled={!input.trim() || disabled}
          className="flex-shrink-0 rounded-xl bg-accent-brand px-4 py-3 text-sm font-[510] text-white hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          发送
        </button>
      </div>
    </div>
  );
}
