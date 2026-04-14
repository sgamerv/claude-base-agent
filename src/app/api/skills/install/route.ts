/**
 * POST /api/skills/install — 安装 Skill
 * Phase 7: SKILL.md 包管理
 *
 * 支持的安装来源：
 * - { skillId: "web-search" } — 从硬编码市场安装（Phase 5 兼容）
 * - { source: { type: "local", path: "/path/to/skill" } } — 从本地目录安装
 * - { source: { type: "github", url: "..." } } — 从 GitHub 安装（Phase 7B）
 * - { source: { type: "url", url: "..." } } — 从 ZIP URL 安装（Phase 7B）
 */

import { NextRequest, NextResponse } from "next/server";
import { installSkill } from "@/lib/skill/registry";
import { installSkillFromSource, scanSkillSource } from "@/lib/skill/installer";
import type { InstallSource } from "@/lib/skill/installer";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { skillId, source, preview } = body;

    // Phase 5 兼容：从硬编码市场安装
    if (skillId && !source) {
      const skill = await installSkill(skillId);
      if (!skill) {
        return NextResponse.json(
          { error: "Skill already installed" },
          { status: 409 }
        );
      }
      return NextResponse.json({ skill });
    }

    // Phase 7：从来源安装
    if (source) {
      const installSource: InstallSource = {
        type: source.type,
        path: source.path,
        url: source.url,
        ref: source.ref,
      };

      // 预览模式：只扫描不安装
      if (preview) {
        const result = await scanSkillSource(installSource);
        return NextResponse.json(result);
      }

      // 安装
      const result = await installSkillFromSource(installSource);
      return NextResponse.json({
        skill: result.skill,
        securityScan: {
          status: result.scanResult.status,
          issues: result.scanResult.issues,
        },
      });
    }

    return NextResponse.json(
      { error: "Missing skillId or source" },
      { status: 400 }
    );
  } catch (error) {
    console.error("[API] Failed to install skill:", error);
    const message = error instanceof Error ? error.message : "Failed to install skill";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
