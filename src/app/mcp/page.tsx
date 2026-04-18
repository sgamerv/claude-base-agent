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
    <div className="min-h-screen bg-bg-marketing">
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* 顶部导航 */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push("/")}
              className="text-text-muted hover:text-text-secondary"
            >
              ← 返回
            </button>
            <h1 className="text-2xl font-[510] text-text-primary tracking-[-0.288px]">
              🔌 MCP 服务管理
            </h1>
          </div>
          <button
            onClick={() => setShowAddDialog(true)}
            className="px-4 py-2 bg-accent-brand text-white text-sm rounded-lg hover:bg-accent-hover"
          >
            + 添加服务
          </button>
        </div>

        {/* 统计概览 */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          <div className="bg-[rgba(255,255,255,0.02)] rounded-lg p-4 border border-border-standard">
            <p className="text-sm text-text-muted">服务总数</p>
            <p className="text-2xl font-[510] text-text-primary">{servers.length}</p>
          </div>
          <div className="bg-[rgba(255,255,255,0.02)] rounded-lg p-4 border border-border-standard">
            <p className="text-sm text-text-muted">已连接</p>
            <p className="text-2xl font-[510] text-status-success">{connectedCount}</p>
          </div>
          <div className="bg-[rgba(255,255,255,0.02)] rounded-lg p-4 border border-border-standard">
            <p className="text-sm text-text-muted">可用工具</p>
            <p className="text-2xl font-[510] text-accent-interactive">{totalTools}</p>
          </div>
        </div>

        {/* 服务列表 */}
        <div className="space-y-3">
          {loading ? (
            <div className="text-center py-12 text-text-muted">
              加载中...
            </div>
          ) : servers.length === 0 ? (
            <div className="text-center py-12 text-text-muted">
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
        <div className="mt-8 p-4 bg-[rgba(94,106,210,0.06)] rounded-lg border border-[rgba(94,106,210,0.2)]">
          <h3 className="text-sm font-[510] text-accent-hover mb-2">
            💡 什么是 MCP 服务？
          </h3>
          <p className="text-xs text-text-secondary">
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
