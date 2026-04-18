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
        ? "border-[rgba(39,166,68,0.2)] bg-[rgba(39,166,68,0.04)]"
        : server.status === "error"
        ? "border-[rgba(229,72,77,0.2)] bg-[rgba(229,72,77,0.04)]"
        : "border-border-standard bg-[rgba(255,255,255,0.02)]"
    }`}>
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg">{statusIcon}</span>
          <div>
            <h3 className="font-[510] text-sm text-text-primary">
              {server.name}
            </h3>
            <p className="text-xs text-text-muted mt-0.5">
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
                className="text-xs px-2 py-1 rounded bg-[rgba(255,255,255,0.04)] text-text-secondary hover:bg-[rgba(255,255,255,0.08)] disabled:opacity-50"
                title="刷新工具列表"
              >
                {refreshing ? "刷新中..." : "🔄"}
              </button>
              <button
                onClick={() => onToggle(server.id, !server.enabled)}
                className={`text-xs px-2 py-1 rounded ${
                  server.enabled
                    ? "bg-[rgba(245,166,35,0.1)] text-status-warning hover:bg-[rgba(245,166,35,0.15)]"
                    : "bg-[rgba(39,166,68,0.1)] text-status-success hover:bg-[rgba(39,166,68,0.15)]"
                }`}
              >
                {server.enabled ? "禁用" : "启用"}
              </button>
              <button
                onClick={handleDelete}
                className={`text-xs px-2 py-1 rounded ${
                  confirmingDelete
                    ? "bg-status-error text-white"
                    : "bg-[rgba(229,72,77,0.1)] text-status-error hover:bg-[rgba(229,72,77,0.15)]"
                }`}
              >
                {confirmingDelete ? "确认删除？" : "删除"}
              </button>
            </>
          )}
          {isBuiltIn && (
            <span className="text-xs px-2 py-1 rounded bg-[rgba(94,106,210,0.1)] text-accent-hover">
              内置
            </span>
          )}
        </div>
      </div>

      <div className="mt-3 flex items-center gap-3 text-xs text-text-muted">
        <span>传输: {server.transport.toUpperCase()}</span>
        <span>工具: {server.toolCount} 个</span>
        <span>同步: {timeAgo}</span>
        {server.tags && server.tags.length > 0 && (
          <span>
            {server.tags.map((tag) => (
              <span
                key={tag}
                className="inline-block px-1.5 py-0.5 rounded bg-[rgba(255,255,255,0.04)] text-text-muted mr-1"
              >
                {tag}
              </span>
            ))}
          </span>
        )}
      </div>

      {server.error && (
        <div className="mt-2 text-xs text-status-error bg-[rgba(229,72,77,0.08)] rounded px-2 py-1">
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
