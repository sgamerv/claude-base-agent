/**
 * MCP Server 卡片组件
 * 展示单个 MCP Server 的状态和操作
 * Phase 9D: 前端 MCP 管理
 */

"use client";

import { useState } from "react";

interface ServerCardProps {
  server: {
    id: string;
    name: string;
    url: string;
    transport: string;
    enabled: boolean;
    tags?: string[];
    status: string;
    toolCount: number;
    lastSyncAt: number;
    error?: string;
  };
  onToggle: (id: string, enabled: boolean) => void;
  onDelete: (id: string) => void;
  onRefresh: (id: string) => void;
}

export default function ServerCard({ server, onToggle, onDelete, onRefresh }: ServerCardProps) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const statusIcon =
    server.status === "connected" ? "🟢" :
    server.status === "error" ? "🔴" :
    server.status === "connecting" ? "🟡" :
    "⚪";

  const statusText =
    server.status === "connected" ? "已连接" :
    server.status === "error" ? "连接失败" :
    server.status === "connecting" ? "连接中..." :
    "未连接";

  const isBuiltIn = server.id === "cde-built-in";
  const timeAgo = server.lastSyncAt
    ? getTimeAgo(server.lastSyncAt)
    : "从未";

  async function handleRefresh() {
    setRefreshing(true);
    await onRefresh(server.id);
    setRefreshing(false);
  }

  function handleDelete() {
    if (!confirmingDelete) {
      setConfirmingDelete(true);
      setTimeout(() => setConfirmingDelete(false), 3000);
      return;
    }
    onDelete(server.id);
  }

  return (
    <div className={`border rounded-lg p-4 ${
      server.status === "connected"
        ? "border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-900/10"
        : server.status === "error"
        ? "border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-900/10"
        : "border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800"
    }`}>
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg">{statusIcon}</span>
          <div>
            <h3 className="font-medium text-sm text-zinc-900 dark:text-zinc-100">
              {server.name}
            </h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
              {server.url}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {!isBuiltIn && (
            <>
              <button
                onClick={handleRefresh}
                disabled={refreshing || server.status !== "connected"}
                className="text-xs px-2 py-1 rounded bg-zinc-100 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-600 disabled:opacity-50"
                title="刷新工具列表"
              >
                {refreshing ? "刷新中..." : "🔄"}
              </button>
              <button
                onClick={() => onToggle(server.id, !server.enabled)}
                className={`text-xs px-2 py-1 rounded ${
                  server.enabled
                    ? "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 hover:bg-yellow-200"
                    : "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 hover:bg-green-200"
                }`}
              >
                {server.enabled ? "禁用" : "启用"}
              </button>
              <button
                onClick={handleDelete}
                className={`text-xs px-2 py-1 rounded ${
                  confirmingDelete
                    ? "bg-red-500 text-white"
                    : "bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 hover:bg-red-200"
                }`}
              >
                {confirmingDelete ? "确认删除？" : "删除"}
              </button>
            </>
          )}
          {isBuiltIn && (
            <span className="text-xs px-2 py-1 rounded bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400">
              内置
            </span>
          )}
        </div>
      </div>

      <div className="mt-3 flex items-center gap-3 text-xs text-zinc-500 dark:text-zinc-400">
        <span>传输: {server.transport.toUpperCase()}</span>
        <span>工具: {server.toolCount} 个</span>
        <span>同步: {timeAgo}</span>
        {server.tags && server.tags.length > 0 && (
          <span>
            {server.tags.map((tag) => (
              <span
                key={tag}
                className="inline-block px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-700 text-zinc-500 dark:text-zinc-400 mr-1"
              >
                {tag}
              </span>
            ))}
          </span>
        )}
      </div>

      {server.error && (
        <div className="mt-2 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded px-2 py-1">
          ⚠️ {server.error}
        </div>
      )}
    </div>
  );
}

function getTimeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return "刚刚";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  return `${Math.floor(hours / 24)} 天前`;
}
