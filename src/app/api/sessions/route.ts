/**
 * GET /api/sessions — 列出所有 session
 * POST /api/sessions — 创建新 session
 */

import { NextRequest, NextResponse } from "next/server";
import { listSessions, createSession } from "@/lib/session/manager";

export async function GET() {
  try {
    const sessions = await listSessions();
    return NextResponse.json({ sessions });
  } catch (error) {
    console.error("[API] Failed to list sessions:", error);
    return NextResponse.json(
      { error: "Failed to list sessions" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const session = await createSession(body.name);
    return NextResponse.json({ session }, { status: 201 });
  } catch (error) {
    console.error("[API] Failed to create session:", error);
    return NextResponse.json(
      { error: "Failed to create session" },
      { status: 500 }
    );
  }
}
