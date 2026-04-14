/**
 * MCP Server 工具列表 API
 * GET — 获取指定 MCP Server 的工具列表
 */

import { NextResponse } from "next/server";
import { getMCPHub } from "@/lib/mcp/hub";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const hub = getMCPHub();
    if (!hub) {
      return NextResponse.json(
        { error: "MCP Hub not initialized" },
        { status: 503 }
      );
    }

    const statuses = hub.getConnectionStatuses();
    const serverStatus = statuses.find((s) => s.id === id);

    if (!serverStatus) {
      return NextResponse.json(
        { error: `MCP Server "${id}" not found` },
        { status: 404 }
      );
    }

    // 获取该 Server 的工具定义
    const allTools = hub.getAllToolDefinitions();
    const serverTools = allTools.filter((t) => t.name.startsWith(`${id}__`));

    return NextResponse.json({
      serverId: id,
      serverName: serverStatus.name,
      status: serverStatus.status,
      tools: serverTools,
      count: serverTools.length,
    });
  } catch (error) {
    return NextResponse.json(
      { error: `Failed to get tools: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 }
    );
  }
}
