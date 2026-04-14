/**
 * Skill 安全扫描器
 * 安装前检查 Skill 包的安全性
 * Phase 7: SKILL.md 包管理
 */

import { promises as fs } from "fs";
import path from "path";

// ========== 扫描结果 ==========

export type SecurityLevel = "pass" | "warning" | "block";

export interface SecurityIssue {
  level: "warning" | "block";
  file: string;
  message: string;
}

export interface SecurityScanResult {
  status: SecurityLevel;
  issues: SecurityIssue[];
  fileCount: number;
  totalSize: number; // bytes
}

// ========== 限制常量 ==========

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const MAX_FILE_COUNT = 50;
const MAX_SINGLE_FILE_SIZE = 2 * 1024 * 1024; // 2MB 单文件

// 危险脚本模式
const DANGEROUS_SCRIPT_PATTERNS = [
  /\brm\s+-rf\s+[/"']/,                 // rm -rf /
  /\bcurl\s+.*\|\s*(ba)?sh/,           // curl | sh
  /\bwget\s+.*\|\s*(ba)?sh/,           // wget | sh
  /\beval\s+\$/,                        // eval $var
  /\bchmod\s+777/,                      // chmod 777
  /\b(npm|yarn|pnpm)\s+(info|view)\s+/, // 信息泄露（可选警告）
];

// Prompt 注入检测模式
const PROMPT_INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?previous\s+instructions/i,
  /forget\s+(all\s+)?previous\s+(instructions|rules)/i,
  /you\s+are\s+now\s+a\s+(different|new)\s+/i,
  /system\s*:\s*you\s+must/i,
  /override\s+system\s+prompt/i,
];

// ========== 扫描 ==========

/**
 * 扫描 Skill 目录的安全性
 */
export async function scanSkillDirectory(skillDir: string): Promise<SecurityScanResult> {
  const issues: SecurityIssue[] = [];
  let fileCount = 0;
  let totalSize = 0;

  // 递归遍历目录
  const files = await listFilesRecursive(skillDir);
  fileCount = files.length;

  // 文件数量检查
  if (fileCount > MAX_FILE_COUNT) {
    issues.push({
      level: "block",
      file: "",
      message: `Too many files: ${fileCount} (max ${MAX_FILE_COUNT})`,
    });
  }

  // 逐文件扫描
  for (const filePath of files) {
    const stat = await fs.stat(filePath);
    totalSize += stat.size;

    // 单文件大小检查
    if (stat.size > MAX_SINGLE_FILE_SIZE) {
      issues.push({
        level: "block",
        file: path.relative(skillDir, filePath),
        message: `File too large: ${(stat.size / 1024).toFixed(1)}KB (max ${MAX_SINGLE_FILE_SIZE / 1024}KB)`,
      });
    }

    // 总大小检查
    if (totalSize > MAX_FILE_SIZE) {
      issues.push({
        level: "block",
        file: "",
        message: `Total size too large: ${(totalSize / 1024).toFixed(1)}KB (max ${MAX_FILE_SIZE / 1024}KB)`,
      });
    }

    // 脚本文件扫描
    const ext = path.extname(filePath).toLowerCase();
    if ([".sh", ".bash", ".zsh", ".py", ".js", ".ts", ".rb", ".pl"].includes(ext)) {
      const content = await fs.readFile(filePath, "utf-8");
      for (const pattern of DANGEROUS_SCRIPT_PATTERNS) {
        if (pattern.test(content)) {
          issues.push({
            level: "warning",
            file: path.relative(skillDir, filePath),
            message: `Potentially dangerous script pattern detected: ${pattern.source}`,
          });
        }
      }
    }

    // SKILL.md Prompt 注入检测
    if (path.basename(filePath).toLowerCase() === "skill.md") {
      const content = await fs.readFile(filePath, "utf-8");
      for (const pattern of PROMPT_INJECTION_PATTERNS) {
        if (pattern.test(content)) {
          issues.push({
            level: "warning",
            file: path.relative(skillDir, filePath),
            message: `Potential prompt injection pattern detected: ${pattern.source}`,
          });
        }
      }
    }
  }

  // 确定安全级别
  const hasBlock = issues.some((i) => i.level === "block");
  const hasWarning = issues.some((i) => i.level === "warning");
  const status: SecurityLevel = hasBlock ? "block" : hasWarning ? "warning" : "pass";

  return { status, issues, fileCount, totalSize };
}

/**
 * 扫描 SKILL.md 内容（安装前预览）
 */
export function scanSkillMdContent(content: string): SecurityIssue[] {
  const issues: SecurityIssue[] = [];

  for (const pattern of PROMPT_INJECTION_PATTERNS) {
    if (pattern.test(content)) {
      issues.push({
        level: "warning",
        file: "SKILL.md",
        message: `Potential prompt injection pattern detected: ${pattern.source}`,
      });
    }
  }

  return issues;
}

// ========== 工具函数 ==========

async function listFilesRecursive(dir: string): Promise<string[]> {
  const files: string[] = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const subFiles = await listFilesRecursive(fullPath);
      files.push(...subFiles);
    } else if (entry.isFile()) {
      // 跳过隐藏文件
      if (!entry.name.startsWith(".")) {
        files.push(fullPath);
      }
    }
  }

  return files;
}
