/**
 * MCP 服务管理页面
 * Phase 9D: 前端 MCP 管理
 */

"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import ServerCard from "@/components/mcp/ServerCard";
import AddServerDialog from "@/components/mcp/AddServerDialog";

interface MCPServerInfo {
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
}

export default function MCPPage() {
  const router = useRouter();
  const [servers, setServers] = useState<MCPServerInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddDialog, setShowAddDialog] = useState(false);

  const fetchServers = useCallback(async () => {
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
  }, []);

  useEffect(() => {
    fetchServers();
  }, [fetchServers]);

  async function handleToggle(id: string, enabled: boolean) {
    try {
      await fetch(`/api/mcp/servers/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
      await fetchServers();
    } catch {
      // 忽略
    }
  }

  async function handleDelete(id: string) {
    try {
      await fetch(`/api/mcp/servers/${id}`, { method: "DELETE" });
      await fetchServers();
    } catch {
      // 忽略
    }
  }

  async function handleRefresh(id: string) {
    try {
      await fetch(`/api/mcp/servers/${id}/refresh`, { method: "POST" });
      await fetchServers();
    } catch {
      // 忽略
    }
  }

  const connectedCount = servers.filter((s) => s.status === "connected").length;
  const totalTools = servers.reduce((sum, s) => sum + s.toolCount, 0);

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-900">
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* 顶部导航 */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push("/")}
              className="text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
            >
              ← 返回
            </button>
            <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
              🔌 MCP 服务管理
            </h1>
          </div>
          <button
            onClick={() => setShowAddDialog(true)}
            className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700"
          >
            + 添加服务
          </button>
        </div>

        {/* 统计概览 */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          <div className="bg-white dark:bg-zinc-800 rounded-lg p-4 border border-zinc-200 dark:border-zinc-700">
            <p className="text-sm text-zinc-500 dark:text-zinc-400">服务总数</p>
            <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">{servers.length}</p>
          </div>
          <div className="bg-white dark:bg-zinc-800 rounded-lg p-4 border border-zinc-200 dark:border-zinc-700">
            <p className="text-sm text-zinc-500 dark:text-zinc-400">已连接</p>
            <p className="text-2xl font-bold text-green-600 dark:text-green-400">{connectedCount}</p>
          </div>
          <div className="bg-white dark:bg-zinc-800 rounded-lg p-4 border border-zinc-200 dark:border-zinc-700">
            <p className="text-sm text-zinc-500 dark:text-zinc-400">可用工具</p>
            <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{totalTools}</p>
          </div>
        </div>

        {/* 服务列表 */}
        <div className="space-y-3">
          {loading ? (
            <div className="text-center py-12 text-zinc-500 dark:text-zinc-400">
              加载中...
            </div>
          ) : servers.length === 0 ? (
            <div className="text-center py-12 text-zinc-500 dark:text-zinc-400">
              <p className="text-lg mb-2">暂无 MCP 服务</p>
              <p className="text-sm">点击右上角「添加服务」连接外部 MCP Server</p>
            </div>
          ) : (
            servers.map((server) => (
              <ServerCard
                key={server.id}
                server={server}
                onToggle={handleToggle}
                onDelete={handleDelete}
                onRefresh={handleRefresh}
              />
            ))
          )}
        </div>

        {/* 说明 */}
        <div className="mt-8 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
          <h3 className="text-sm font-medium text-blue-800 dark:text-blue-300 mb-2">
            💡 什么是 MCP 服务？
          </h3>
          <p className="text-xs text-blue-700 dark:text-blue-400">
            MCP (Model Context Protocol) 是一种标准化协议，允许 AI Agent 连接外部工具和数据源。
            添加外部 MCP 服务后，Agent 可以自动发现并调用该服务提供的工具，扩展自身能力。
            支持的传输协议包括 SSE 和 Streamable HTTP。
          </p>
        </div>
      </div>

      {/* 添加对话框 */}
      <AddServerDialog
        open={showAddDialog}
        onClose={() => setShowAddDialog(false)}
        onAdded={fetchServers}
      />
    </div>
  );
}
