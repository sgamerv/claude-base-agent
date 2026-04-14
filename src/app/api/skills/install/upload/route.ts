/**
 * POST /api/skills/install/upload — 上传 ZIP 包安装 Skill
 * Phase 7B: 多来源安装
 */

import { NextRequest, NextResponse } from "next/server";
import { installFromZip } from "@/lib/skill/installer";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { error: "Missing file in form data" },
        { status: 400 }
      );
    }

    // 检查文件类型
    if (!file.name.endsWith(".zip")) {
      return NextResponse.json(
        { error: "Only .zip files are supported" },
        { status: 400 }
      );
    }

    // 检查文件大小（10MB 限制）
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json(
        { error: "File too large (max 10MB)" },
        { status: 400 }
      );
    }

    // 将上传的文件保存到临时路径
    const { writeFile, mkdtemp, unlink } = await import("fs/promises");
    const path = await import("path");
    const os = await import("os");

    const tmpDir = await mkdtemp(path.join(os.tmpdir(), "skill-upload-"));
    const tmpFile = path.join(tmpDir, file.name);

    try {
      const buffer = Buffer.from(await file.arrayBuffer());
      await writeFile(tmpFile, buffer);

      const result = await installFromZip(tmpFile);

      return NextResponse.json({
        skill: result.skill,
        securityScan: {
          status: result.scanResult.status,
          issues: result.scanResult.issues,
        },
      });
    } finally {
      await unlink(tmpFile).catch(() => {});
      const { rm } = await import("fs/promises");
      await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    }
  } catch (error) {
    console.error("[API] Failed to upload install skill:", error);
    const message = error instanceof Error ? error.message : "Failed to install skill from upload";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
