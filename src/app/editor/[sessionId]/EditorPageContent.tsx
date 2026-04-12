"use client";

import { use, useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import Link from "next/link";

// 动态导入以避免 SSR 问题
const EditorPanel = dynamic(() => import("@/components/editor/EditorPanel"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full text-zinc-400">
      加载编辑器...
    </div>
  ),
});

export default function EditorPageContent({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = use(params);
  const searchParams = useSearchParams();
  const diffId = searchParams.get("diff");
  const [mcpStatus, setMcpStatus] = useState<"checking" | "connected" | "local">("checking");
  const [workspacePath, setWorkspacePath] = useState<string | null>(null);

  useEffect(() => {
    fetch("http://localhost:3001", { signal: AbortSignal.timeout(2000) })
      .then((res) => res.json())
      .then(() => setMcpStatus("connected"))
      .catch(() => setMcpStatus("local"));
  }, []);

  // 获取 session 的 workspacePath
  useEffect(() => {
    fetch(`/api/sessions/${sessionId}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.session?.workspacePath) {
          setWorkspacePath(data.session.workspacePath);
        }
      })
      .catch(console.error);
  }, [sessionId]);

  return (
    <div className="flex flex-col h-screen bg-white dark:bg-zinc-950">
      {/* 顶部工具栏 */}
      <header className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-700 px-4 py-2 bg-white dark:bg-zinc-900 select-none">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors text-sm"
          >
            ← 返回
          </Link>
          <div className="flex items-center gap-2">
            <span className="text-base">🤖</span>
            <h1 className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
              Cloud CDE Agent
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href={`/chat/${sessionId}`}
            className="text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400 transition-colors"
          >
            💬 聊天入口 →
          </Link>
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

      {/* 编辑器主面板 */}
      <EditorPanel sessionId={sessionId} workspacePath={workspacePath} diffId={diffId} />
    </div>
  );
}
