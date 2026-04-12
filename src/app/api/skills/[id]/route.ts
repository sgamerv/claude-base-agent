/**
 * DELETE /api/skills/[id] — 卸载 Skill
 * PATCH /api/skills/[id] — 启用/禁用 Skill
 */

import { NextRequest, NextResponse } from "next/server";
import { uninstallSkill, toggleSkill } from "@/lib/skill/registry";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    await uninstallSkill(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[API] Failed to uninstall skill:", error);
    const message = error instanceof Error ? error.message : "Failed to uninstall skill";
    const status = message.includes("built-in") ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const body = await request.json();
    const { enabled } = body;

    if (typeof enabled !== "boolean") {
      return NextResponse.json(
        { error: "Missing or invalid 'enabled' field" },
        { status: 400 }
      );
    }

    const skill = await toggleSkill(id, enabled);
    if (!skill) {
      return NextResponse.json(
        { error: "Skill not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ skill });
  } catch (error) {
    console.error("[API] Failed to toggle skill:", error);
    return NextResponse.json(
      { error: "Failed to toggle skill" },
      { status: 500 }
    );
  }
}
