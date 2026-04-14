/**
 * MCP Server 工具刷新 API
 * POST — 刷新指定 MCP Server 的工具列表
 */

import { NextResponse } from "next/server";
import { getMCPHub } from "@/lib/mcp/hub";

export async function POST(
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

    const tools = await hub.refreshTools(id);
    return NextResponse.json({ success: true, tools, count: tools.length });
  } catch (error) {
    return NextResponse.json(
      { error: `Failed to refresh tools: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 }
    );
  }
}
