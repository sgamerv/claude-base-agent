/**
 * 单个 MCP Server 管理 API
 * DELETE — 删除 MCP Server
 * PATCH  — 更新配置（启用/禁用/修改 URL 等）
 */

import { NextRequest, NextResponse } from "next/server";
import { getMCPHub } from "@/lib/mcp/hub";
import { removeServerConfig, updateServerConfig } from "@/lib/mcp/config";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // 不允许删除内置 MCP
    if (id === "cde-built-in") {
      return NextResponse.json(
        { error: "Cannot delete built-in MCP server" },
        { status: 403 }
      );
    }

    // 从 Hub 中移除连接
    const hub = getMCPHub();
    if (hub) {
      await hub.removeServer(id);
    }

    // 从配置中移除
    const removed = await removeServerConfig(id);
    if (!removed) {
      return NextResponse.json(
        { error: `MCP Server "${id}" not found` },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: `Failed to delete MCP server: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    // 不允许修改内置 MCP 的核心配置
    if (id === "cde-built-in") {
      return NextResponse.json(
        { error: "Cannot modify built-in MCP server" },
        { status: 403 }
      );
    }

    // 更新配置文件
    const updated = await updateServerConfig(id, body);
    if (!updated) {
      return NextResponse.json(
        { error: `MCP Server "${id}" not found` },
        { status: 404 }
      );
    }

    // 处理启用/禁用
    const hub = getMCPHub();
    if (hub && body.enabled !== undefined) {
      await hub.toggleServer(id, body.enabled);
    }

    // URL 或 transport 变更时需要重连
    if (hub && (body.url || body.transport || body.headers)) {
      try {
        await hub.removeServer(id);
        await hub.addServer(updated);
      } catch (error) {
        console.error(`[MCP API] Failed to reconnect server ${id}:`, error);
      }
    }

    return NextResponse.json({ success: true, server: updated });
  } catch (error) {
    return NextResponse.json(
      { error: `Failed to update MCP server: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 }
    );
  }
}
