/**
 * MCP 状态指示组件
 * 显示所有 MCP Server 的连接状态
 * Phase 9D: 前端 MCP 管理
 */

"use client";

import { useEffect, useState } from "react";

interface MCPServerStatus {
  id: string;
  name: string;
  status: "disconnected" | "connecting" | "connected" | "error";
  toolCount: number;
  lastSyncAt: number;
  error?: string;
  tags?: string[];
}

interface MCPStatusBadgeProps {
  compact?: boolean;
  className?: string;
}

export default function MCPStatusBadge({ compact = false, className = "" }: MCPStatusBadgeProps) {
  const [servers, setServers] = useState<MCPServerStatus[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  async function fetchStatus() {
    try {
      const res = await fetch("/api/mcp/servers");
      if (res.ok) {
        const data = await res.json();
        setServers(data.servers || []);
      }
    } catch {
      // 忽略
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <span className={`text-xs text-zinc-500 ${className}`}>
        🔌 MCP...
      </span>
    );
  }

  if (compact) {
    // 紧凑模式：只显示图标和状态点
    const connected = servers.filter((s) => s.status === "connected").length;
    const hasError = servers.some((s) => s.status === "error");
    return (
      <span className={`text-xs ${className}`}>
        🔌{" "}
        {servers.map((s) => (
          <span key={s.id} title={`${s.name}: ${s.status}`}>
            {s.status === "connected" ? "🟢" : s.status === "error" ? "🔴" : "⚪"}
          </span>
        ))}
        {servers.length === 0 && <span className="text-zinc-400">⚪</span>}
      </span>
    );
  }

  return (
    <span className={`text-xs text-zinc-500 dark:text-zinc-400 ${className}`}>
      🔌 MCP:{" "}
      {servers.length === 0 ? (
        <span>⚪ 本地模式</span>
      ) : (
        servers.map((s, i) => (
          <span key={s.id}>
            {s.status === "connected" ? "🟢" : s.status === "error" ? "🔴" : "⚪"}
            {" "}{s.name}
            {i < servers.length - 1 && " | "}
          </span>
        ))
      )}
    </span>
  );
}
