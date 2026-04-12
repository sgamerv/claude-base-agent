/**
 * GET /api/skills — 列出已安装的 Skills
 * POST /api/skills/install — 安装一个 Skill
 */

import { NextRequest, NextResponse } from "next/server";
import {
  getInstalledSkills,
  installSkill,
} from "@/lib/skill/registry";
import { getMarketSkills } from "@/lib/skill/market";

export async function GET() {
  try {
    const skills = await getInstalledSkills();
    const installedIds = skills.map((s) => s.id);
    const marketSkills = getMarketSkills(installedIds);

    return NextResponse.json({
      installed: skills,
      market: marketSkills,
    });
  } catch (error) {
    console.error("[API] Failed to get skills:", error);
    return NextResponse.json(
      { error: "Failed to get skills" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { skillId } = body;

    if (!skillId) {
      return NextResponse.json(
        { error: "Missing skillId" },
        { status: 400 }
      );
    }

    const skill = await installSkill(skillId);
    if (!skill) {
      return NextResponse.json(
        { error: "Skill already installed" },
        { status: 409 }
      );
    }

    return NextResponse.json({ skill });
  } catch (error) {
    console.error("[API] Failed to install skill:", error);
    const message = error instanceof Error ? error.message : "Failed to install skill";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
