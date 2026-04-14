/**
 * GET /api/skills — 列出已安装的 Skills + 市场可用 Skills
 */

import { NextResponse } from "next/server";
import { getInstalledSkills } from "@/lib/skill/registry";
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
