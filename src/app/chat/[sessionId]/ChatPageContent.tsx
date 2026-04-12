"use client";

import { use, useState, useEffect } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";

// 动态导入以避免 SSR 问题（Socket.io 依赖浏览器 API）
const ChatPanel = dynamic(() => import("@/components/chat/ChatPanel"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full text-zinc-400">
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
    <div className="flex flex-col h-screen bg-white dark:bg-zinc-950">
      {/* 顶部栏 */}
      <header className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-700 px-4 py-3 bg-white dark:bg-zinc-900">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
          >
            ← 返回
          </Link>
          <div className="flex items-center gap-2">
            <span className="text-lg">🤖</span>
            <h1 className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
              Cloud CDE Agent
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href={`/editor/${sessionId}`}
            className="text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400 transition-colors"
          >
            📝 编辑器入口 →
          </Link>
          {/* MCP 状态指示 */}
          <span className="inline-flex items-center gap-1.5 text-xs">
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                mcpStatus === "checking"
                  ? "bg-yellow-500 animate-pulse"
                  : mcpStatus === "connected"
                  ? "bg-green-500"
                  : "bg-zinc-400"
              }`}
            />
            <span className="text-zinc-500">
              {mcpStatus === "checking"
                ? "检测 MCP..."
                : mcpStatus === "connected"
                ? "MCP 已连接"
                : "本地模式"}
            </span>
          </span>
          <span className="text-xs text-zinc-400 font-mono">
            {sessionId}
          </span>
          <span className="inline-flex items-center gap-1 text-xs text-zinc-400">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
            GLM-5.1
          </span>
        </div>
      </header>

      {/* 聊天面板 */}
      <ChatPanel sessionId={sessionId} />
    </div>
  );
}
