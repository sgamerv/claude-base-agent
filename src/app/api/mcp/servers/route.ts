/**
 * MCP Server 管理 API
 * GET  — 列出所有 MCP Server 配置及状态
 * POST — 添加外部 MCP Server
 */

import { NextRequest, NextResponse } from "next/server";
import { getMCPHub } from "@/lib/mcp/hub";
import { loadServerConfigs, addServerConfig } from "@/lib/mcp/config";
import type { MCPServerConfig } from "@/lib/mcp/types";

export async function GET() {
  try {
    // 获取 Hub 中的连接状态
    const hub = getMCPHub();
    const statuses = hub ? hub.getConnectionStatuses() : [];

    // 获取配置文件中的所有配置
    const configs = await loadServerConfigs();

    // 合并状态和配置
    const result = configs.map((config) => {
      const status = statuses.find((s) => s.id === config.id);
      return {
        ...config,
        status: status?.status || "disconnected",
        toolCount: status?.toolCount || 0,
        lastSyncAt: status?.lastSyncAt || 0,
        error: status?.error,
      };
    });

    // 添加内置 CDE MCP 状态
    const builtInStatus = statuses.find((s) => s.id === "cde-built-in");
    if (builtInStatus) {
      result.unshift({
        id: "cde-built-in",
        name: "CDE 内置 MCP",
        url: process.env.MCP_SERVER_URL || "http://localhost:3001",
        transport: "streamable-http",
        enabled: true,
        tags: ["built-in"],
        addedAt: 0,
        status: builtInStatus.status,
        toolCount: builtInStatus.toolCount,
        lastSyncAt: builtInStatus.lastSyncAt,
      } as any);
    }

    return NextResponse.json({ servers: result });
  } catch (error) {
    return NextResponse.json(
      { error: `Failed to list MCP servers: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // 验证必填字段
    if (!body.id || !body.name || !body.url) {
      return NextResponse.json(
        { error: "Missing required fields: id, name, url" },
        { status: 400 }
      );
    }

    // URL 安全校验
    if (!body.url.startsWith("http://") && !body.url.startsWith("https://")) {
      return NextResponse.json(
        { error: "URL must start with http:// or https://" },
        { status: 400 }
      );
    }

    // ID 格式校验：只允许字母、数字、连字符
    if (!/^[a-zA-Z0-9_-]+$/.test(body.id)) {
      return NextResponse.json(
        { error: "ID must contain only letters, numbers, hyphens, and underscores" },
        { status: 400 }
      );
    }

    const config: MCPServerConfig = {
      id: body.id,
      name: body.name,
      url: body.url,
      transport: body.transport || "sse",
      enabled: body.enabled !== false,
      headers: body.headers,
      tags: body.tags,
      command: body.command,
      args: body.args,
      env: body.env,
    };

    // 先测试连接（可选）
    if (body.testConnection) {
      const hub = getMCPHub();
      if (hub) {
        try {
          await hub.addServer(config);
          const statuses = hub.getConnectionStatuses();
          const status = statuses.find((s) => s.id === config.id);
          return NextResponse.json({
            success: true,
            server: { ...config, status: status?.status, toolCount: status?.toolCount },
          });
        } catch (error) {
          return NextResponse.json({
            success: false,
            error: `Connection test failed: ${error instanceof Error ? error.message : String(error)}`,
          }, { status: 400 });
        }
      }
    }

    // 保存配置
    await addServerConfig(config);

    // 在 Hub 中添加连接
    const hub = getMCPHub();
    if (hub && config.enabled) {
      try {
        await hub.addServer(config);
      } catch (error) {
        console.error(`[MCP API] Failed to connect to new server ${config.id}:`, error);
        // 连接失败不影响保存配置
      }
    }

    return NextResponse.json({ success: true, server: config }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: `Failed to add MCP server: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 }
    );
  }
}
