/**
 * GET /api/sessions/[id] — 获取单个 session
 * PATCH /api/sessions/[id] — 更新 session
 * DELETE /api/sessions/[id] — 删除 session + 清理 workspace
 */

import { NextRequest, NextResponse } from "next/server";
import {
  updateSession,
  deleteSession,
  getSession,
} from "@/lib/session/manager";
import { clearSessionHistory } from "@/lib/socket/session-cleanup";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const session = await getSession(id);
    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }
    return NextResponse.json({ session });
  } catch (error) {
    console.error("[API] Failed to get session:", error);
    return NextResponse.json(
      { error: "Failed to get session" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const body = await request.json().catch(() => ({}));
    const session = await updateSession(id, body);
    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }
    return NextResponse.json({ session });
  } catch (error) {
    console.error("[API] Failed to update session:", error);
    return NextResponse.json(
      { error: "Failed to update session" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    // 检查 session 是否存在
    const session = await getSession(id);
    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    // 删除 session + 清理 workspace
    const deleted = await deleteSession(id);
    if (!deleted) {
      return NextResponse.json({ error: "Failed to delete session" }, { status: 500 });
    }

    // 清理内存中的对话历史和前端消息缓存
    clearSessionHistory(id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[API] Failed to delete session:", error);
    return NextResponse.json(
      { error: "Failed to delete session" },
      { status: 500 }
    );
  }
}
