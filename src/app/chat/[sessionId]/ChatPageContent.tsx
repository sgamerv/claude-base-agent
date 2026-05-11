"use client";

import { use, useState, useEffect } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";

// 动态导入以避免 SSR 问题（Socket.io 依赖浏览器 API）
const ChatPanel = dynamic(() => import("@/components/chat/ChatPanel"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full text-text-muted">
      加载中...
    </div>
  ),
});

export default function ChatPageContent({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = use(params);
  const [mcpStatus, setMcpStatus] = useState<"checking" | "connected" | "local">("checking");

  useEffect(() => {
    // 检查 MCP Server 状态
    fetch("http://localhost:3001", { signal: AbortSignal.timeout(2000) })
      .then((res) => res.json())
      .then(() => setMcpStatus("connected"))
      .catch(() => setMcpStatus("local"));
  }, []);

  return (
    <div className="flex flex-col h-screen bg-bg-marketing">
      {/* 顶部栏 */}
      <header className="flex-shrink-0 flex items-center justify-between border-b border-border-subtle px-4 py-3 bg-bg-panel">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="text-text-muted hover:text-text-secondary transition-colors"
          >
            ← 返回
          </Link>
          <div className="flex items-center gap-2">
            <span className="text-lg">🤖</span>
            <h1 className="text-sm font-[510] text-text-primary">
              Cloud CDE Agent
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href={`/editor/${sessionId}`}
            className="text-xs text-accent-link hover:text-accent-link-hover transition-colors"
          >
            📝 编辑器入口 →
          </Link>
          {/* MCP 状态指示 */}
          <span className="inline-flex items-center gap-1.5 text-xs">
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                mcpStatus === "checking"
                  ? "bg-status-warning animate-pulse"
                  : mcpStatus === "connected"
                  ? "bg-status-success"
                  : "bg-[#3e3e44]"
              }`}
            />
            <span className="text-text-muted">
              {mcpStatus === "checking"
                ? "检测 MCP..."
                : mcpStatus === "connected"
                ? "MCP 已连接"
                : "本地模式"}
            </span>
          </span>
          <span className="text-xs text-[#3e3e44] font-mono">
            {sessionId}
          </span>
          <span className="inline-flex items-center gap-1 text-xs text-text-muted">
            <span className="w-1.5 h-1.5 rounded-full bg-accent-interactive" />
            GLM-5.1
          </span>
        </div>
      </header>

      {/* 聊天面板 */}
      <div className="flex-1 min-h-0">
        <ChatPanel sessionId={sessionId} />
      </div>
    </div>
  );
}
