/**
 * MCP 工具总览 API
 * GET — 获取所有已注册 MCP 工具（跨 Server）
 */

import { NextResponse } from "next/server";
import { getMCPHub } from "@/lib/mcp/hub";

export async function GET() {
  try {
    const hub = getMCPHub();
    if (!hub) {
      return NextResponse.json(
        { error: "MCP Hub not initialized" },
        { status: 503 }
      );
    }

    const tools = hub.getAllToolDefinitions();
    const statuses = hub.getConnectionStatuses();

    return NextResponse.json({
      tools,
      count: tools.length,
      servers: statuses.map((s) => ({
        id: s.id,
        name: s.name,
        status: s.status,
        toolCount: s.toolCount,
      })),
    });
  } catch (error) {
    return NextResponse.json(
      { error: `Failed to get MCP tools: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 }
    );
  }
}
