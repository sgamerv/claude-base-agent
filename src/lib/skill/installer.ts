/**
 * Skill 安装引擎
 * 支持多来源安装：本地路径、ZIP 包、GitHub 仓库、URL
 * Phase 7: SKILL.md 包管理
 */

import { promises as fs } from "fs";
import path from "path";
import os from "os";
import AdmZip from "adm-zip";
import type { Skill, SkillSource } from "./types";
import { parseSkillMd, convertToSkill } from "./parser";
import { scanSkillDirectory } from "./scanner";
import type { SecurityScanResult } from "./scanner";

// ========== 安装参数 ==========

export interface InstallSource {
  type: "local" | "zip" | "github" | "url";
  path?: string;   // local/zip 类型：本地路径
  url?: string;    // github/url 类型：URL
  ref?: string;    // github 类型：Git 分支/tag/commit
}

export interface InstallResult {
  skill: Skill;
  scanResult: SecurityScanResult;
}

// ========== 存储路径 ==========

const PROJECT_ROOT = process.cwd();
const SKILLS_DIR = path.join(PROJECT_ROOT, "skills");
const DATA_DIR = path.join(PROJECT_ROOT, "data");
const SKILLS_FILE = path.join(DATA_DIR, "skills.json");

// ========== 安装入口 ==========

/**
 * 从来源安装 Skill
 */
export async function installSkillFromSource(source: InstallSource): Promise<InstallResult> {
  switch (source.type) {
    case "local":
      return installFromLocal(source.path!);
    case "zip":
      return installFromZip(source.path!);
    case "github":
      return installFromGitHub(source.url!, source.ref);
    case "url":
      return installFromUrl(source.url!);
    default:
      throw new Error(`Unsupported install source type: ${source.type}`);
  }
}

// ========== 本地路径安装 ==========

/**
 * 从本地目录安装 Skill
 */
export async function installFromLocal(localPath: string): Promise<InstallResult> {
  const stat = await fs.stat(localPath);
  if (!stat.isDirectory()) {
    throw new Error(`Path is not a directory: ${localPath}`);
  }

  const skillMdPath = path.join(localPath, "SKILL.md");
  const skillMdContent = await fs.readFile(skillMdPath, "utf-8");

  const parseResult = parseSkillMd(skillMdContent);
  if (!parseResult.success || !parseResult.parsed) {
    throw new Error(
      `Invalid SKILL.md: ${parseResult.errors.map((e) => `${e.field}: ${e.message}`).join("; ")}`
    );
  }

  const scanResult = await scanSkillDirectory(localPath);
  if (scanResult.status === "block") {
    throw new Error(
      `Security scan blocked: ${scanResult.issues.map((i) => i.message).join("; ")}`
    );
  }

  const skillSource: SkillSource = {
    type: "local",
    url: localPath,
    installedAt: Date.now(),
  };
  const skill = convertToSkill(parseResult.parsed, skillSource);

  const targetDir = path.join(SKILLS_DIR, skill.id);
  await copyDirectory(localPath, targetDir);
  await registerSkill(skill);

  console.log(`[Skill] Installed from local: ${skill.id} (${localPath})`);
  return { skill, scanResult };
}

// ========== ZIP 包安装 ==========

/**
 * 从 ZIP 包安装 Skill
 * ZIP 包结构要求：
 *   - SKILL.md 在根目录，或
 *   - SKILL.md 在一级子目录中（常见于 GitHub 下载的 ZIP）
 */
export async function installFromZip(zipPath: string): Promise<InstallResult> {
  const zip = new AdmZip(zipPath);
  const entries = zip.getEntries();

  if (entries.length === 0) {
    throw new Error("ZIP archive is empty");
  }

  // 查找 SKILL.md 所在位置
  const skillMdEntry = entries.find(
    (e) => !e.isDirectory && e.entryName.endsWith("SKILL.md")
  );
  if (!skillMdEntry) {
    throw new Error("No SKILL.md found in ZIP archive");
  }

  // 确定 SKILL.md 的前缀（根目录或一级子目录）
  const skillMdPath = skillMdEntry.entryName;
  const prefix = skillMdPath.includes("/")
    ? skillMdPath.substring(0, skillMdPath.lastIndexOf("/") + 1)
    : "";

  // 解压到临时目录
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "skill-install-"));
  try {
    zip.extractAllTo(tmpDir, true);

    // 找到 SKILL.md 所在的目录
    const skillDir = prefix
      ? path.join(tmpDir, prefix.replace(/\/$/, ""))
      : tmpDir;

    // 验证 SKILL.md
    const skillMdContent = await fs.readFile(path.join(skillDir, "SKILL.md"), "utf-8");
    const parseResult = parseSkillMd(skillMdContent);
    if (!parseResult.success || !parseResult.parsed) {
      throw new Error(
        `Invalid SKILL.md: ${parseResult.errors.map((e) => `${e.field}: ${e.message}`).join("; ")}`
      );
    }

    // 安全扫描
    const scanResult = await scanSkillDirectory(skillDir);
    if (scanResult.status === "block") {
      throw new Error(
        `Security scan blocked: ${scanResult.issues.map((i) => i.message).join("; ")}`
      );
    }

    // 计算 ZIP 校验和
    const zipBuffer = await fs.readFile(zipPath);
    const checksum = await computeChecksum(zipBuffer);

    // 构建 Skill 对象
    const skillSource: SkillSource = {
      type: "zip",
      installedAt: Date.now(),
      checksum,
    };
    const skill = convertToSkill(parseResult.parsed, skillSource);

    // 只复制 SKILL.md 前缀下的文件（排除顶层包装目录）
    const targetDir = path.join(SKILLS_DIR, skill.id);
    await copyDirectory(skillDir, targetDir);
    await registerSkill(skill);

    console.log(`[Skill] Installed from ZIP: ${skill.id}`);
    return { skill, scanResult };
  } finally {
    // 清理临时目录
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

// ========== GitHub 仓库安装 ==========

interface GitHubUrlInfo {
  owner: string;
  repo: string;
  path: string;  // 仓库内路径
  ref: string;   // 分支/tag/commit
}

/**
 * 从 GitHub 仓库安装 Skill
 *
 * 支持的 URL 格式：
 * - https://github.com/owner/repo → 扫描 skills/ 子目录
 * - https://github.com/owner/repo/tree/main/skills/brainstorming → 直接安装
 * - https://github.com/owner/repo/tree/v1.0/skills/brainstorming → 指定 ref
 */
export async function installFromGitHub(url: string, ref?: string): Promise<InstallResult> {
  const urlInfo = parseGitHubUrl(url);
  if (!urlInfo) {
    throw new Error(`Invalid GitHub URL: ${url}`);
  }

  // 使用指定的 ref 或 URL 中的 ref
  const effectiveRef = ref || urlInfo.ref || "main";

  if (urlInfo.path) {
    // URL 指向特定子目录 → 直接安装该 Skill
    return installGitHubSkillDir(urlInfo, effectiveRef);
  } else {
    // URL 指向仓库根 → 扫描 skills/ 子目录，安装第一个找到的 Skill
    // （完整的多选列表需要前端配合，这里先安装第一个）
    return installGitHubSkillFromRoot(urlInfo, effectiveRef);
  }
}

/**
 * 从 GitHub 仓库的特定子目录安装 Skill
 */
async function installGitHubSkillDir(
  urlInfo: GitHubUrlInfo,
  ref: string
): Promise<InstallResult> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "skill-github-"));
  try {
    // 通过 GitHub API 下载目录内容
    await downloadGitHubDir(urlInfo.owner, urlInfo.repo, urlInfo.path, ref, tmpDir);

    // 验证 SKILL.md
    const skillMdContent = await fs.readFile(path.join(tmpDir, "SKILL.md"), "utf-8");
    const parseResult = parseSkillMd(skillMdContent);
    if (!parseResult.success || !parseResult.parsed) {
      throw new Error(
        `Invalid SKILL.md: ${parseResult.errors.map((e) => `${e.field}: ${e.message}`).join("; ")}`
      );
    }

    const scanResult = await scanSkillDirectory(tmpDir);
    if (scanResult.status === "block") {
      throw new Error(
        `Security scan blocked: ${scanResult.issues.map((i) => i.message).join("; ")}`
      );
    }

    const skillSource: SkillSource = {
      type: "github",
      url: `https://github.com/${urlInfo.owner}/${urlInfo.repo}`,
      ref,
      installedAt: Date.now(),
    };
    const skill = convertToSkill(parseResult.parsed, skillSource);

    const targetDir = path.join(SKILLS_DIR, skill.id);
    await copyDirectory(tmpDir, targetDir);
    await registerSkill(skill);

    console.log(`[Skill] Installed from GitHub: ${skill.id} (${urlInfo.owner}/${urlInfo.repo}/${urlInfo.path})`);
    return { skill, scanResult };
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * 从 GitHub 仓库根安装 — 查找 skills/ 子目录下的第一个 Skill
 */
async function installGitHubSkillFromRoot(
  urlInfo: GitHubUrlInfo,
  ref: string
): Promise<InstallResult> {
  // 先查找 skills/ 目录
  const skillsPath = "skills";
  const contents = await fetchGitHubDir(urlInfo.owner, urlInfo.repo, skillsPath, ref);

  if (!contents || contents.length === 0) {
    throw new Error(
      `No skills/ directory found in repository: ${urlInfo.owner}/${urlInfo.repo}`
    );
  }

  // 找到第一个包含 SKILL.md 的子目录
  const skillDirs = contents.filter(
    (item: { type: string; name: string }) => item.type === "dir"
  );

  if (skillDirs.length === 0) {
    throw new Error(
      `No skill directories found in skills/ of ${urlInfo.owner}/${urlInfo.repo}`
    );
  }

  // 安装第一个 Skill
  const firstSkill = skillDirs[0];
  const skillUrlInfo: GitHubUrlInfo = {
    ...urlInfo,
    path: `${skillsPath}/${firstSkill.name}`,
  };

  return installGitHubSkillDir(skillUrlInfo, ref);
}

// ========== URL 安装 ==========

/**
 * 从 URL 下载 ZIP 包安装
 */
export async function installFromUrl(url: string): Promise<InstallResult> {
  // 下载 ZIP 到临时文件
  const tmpFile = path.join(os.tmpdir(), `skill-download-${Date.now()}.zip`);
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) {
      throw new Error(`Failed to download: HTTP ${response.status}`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    await fs.writeFile(tmpFile, buffer);

    // 走 ZIP 安装流程
    return installFromZip(tmpFile);
  } finally {
    await fs.unlink(tmpFile).catch(() => {});
  }
}

// ========== 扫描预览 ==========

/**
 * 扫描 Skill 包但不安装，用于安装前预览
 */
export async function scanSkillSource(source: InstallSource): Promise<{
  preview: { name: string; description: string; author: string; version: string } | null;
  scanResult: SecurityScanResult | null;
  skills?: { name: string; description: string }[]; // GitHub 仓库扫描结果
  error?: string;
}> {
  try {
    if (source.type === "local") {
      const skillMdPath = path.join(source.path!, "SKILL.md");
      const content = await fs.readFile(skillMdPath, "utf-8");
      const parseResult = parseSkillMd(content);

      if (!parseResult.success || !parseResult.parsed) {
        return {
          preview: null,
          scanResult: null,
          error: parseResult.errors.map((e) => `${e.field}: ${e.message}`).join("; "),
        };
      }

      const scanResult = await scanSkillDirectory(source.path!);
      return {
        preview: {
          name: parseResult.parsed.name,
          description: parseResult.parsed.description,
          author: parseResult.parsed.metadata.author || "unknown",
          version: parseResult.parsed.metadata.version || "1.0.0",
        },
        scanResult,
      };
    }

    if (source.type === "github") {
      const urlInfo = parseGitHubUrl(source.url!);
      if (!urlInfo) {
        return { preview: null, scanResult: null, error: "Invalid GitHub URL" };
      }

      const ref = source.ref || urlInfo.ref || "main";

      if (urlInfo.path) {
        // 指向特定 Skill 目录
        const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "skill-scan-"));
        try {
          await downloadGitHubDir(urlInfo.owner, urlInfo.repo, urlInfo.path, ref, tmpDir);
          const content = await fs.readFile(path.join(tmpDir, "SKILL.md"), "utf-8");
          const parseResult = parseSkillMd(content);

          if (!parseResult.success || !parseResult.parsed) {
            return {
              preview: null,
              scanResult: null,
              error: parseResult.errors.map((e) => `${e.field}: ${e.message}`).join("; "),
            };
          }

          const scanResult = await scanSkillDirectory(tmpDir);
          return {
            preview: {
              name: parseResult.parsed.name,
              description: parseResult.parsed.description,
              author: parseResult.parsed.metadata.author || "unknown",
              version: parseResult.parsed.metadata.version || "1.0.0",
            },
            scanResult,
          };
        } finally {
          await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
        }
      } else {
        // 指向仓库根，扫描 skills/ 子目录
        const contents = await fetchGitHubDir(urlInfo.owner, urlInfo.repo, "skills", ref);
        if (!contents || contents.length === 0) {
          return { preview: null, scanResult: null, error: "No skills/ directory found" };
        }

        const skillDirs = contents
          .filter((item: { type: string }) => item.type === "dir")
          .map((item: { name: string }) => ({ name: item.name, description: "" }));

        return {
          preview: null,
          scanResult: null,
          skills: skillDirs,
        };
      }
    }

    return {
      preview: null,
      scanResult: null,
      error: `Source type '${source.type}' preview not yet supported`,
    };
  } catch (error) {
    return {
      preview: null,
      scanResult: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// ========== 卸载扩展 ==========

/**
 * 卸载 Skill（删除 skills/ 目录中的文件）
 */
export async function uninstallSkillFiles(skillId: string): Promise<boolean> {
  const targetDir = path.join(SKILLS_DIR, skillId);
  try {
    await fs.access(targetDir);
    await fs.rm(targetDir, { recursive: true, force: true });
    console.log(`[Skill] Removed skill files: ${skillId}`);
    return true;
  } catch {
    return false;
  }
}

// ========== 注册/注销 ==========

async function registerSkill(skill: Skill): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });

  let skills: Skill[] = [];
  try {
    const content = await fs.readFile(SKILLS_FILE, "utf-8");
    skills = JSON.parse(content);
  } catch {
    // 文件不存在
  }

  if (skills.find((s) => s.id === skill.id)) {
    throw new Error(`Skill already installed: ${skill.id}`);
  }

  skills.push(skill);
  await fs.writeFile(SKILLS_FILE, JSON.stringify(skills, null, 2), "utf-8");
}

// ========== GitHub API ==========

const GITHUB_API_BASE = "https://api.github.com";

/**
 * 解析 GitHub URL 为结构化信息
 */
function parseGitHubUrl(url: string): GitHubUrlInfo | null {
  try {
    const parsed = new URL(url);
    if (parsed.hostname !== "github.com") return null;

    const parts = parsed.pathname.split("/").filter(Boolean);
    if (parts.length < 2) return null;

    const owner = parts[0];
    const repo = parts[1];

    // https://github.com/owner/repo/tree/ref/path
    if (parts.length >= 3 && parts[2] === "tree") {
      const ref = parts[3] || "main";
      const skillPath = parts.slice(4).join("/");
      return { owner, repo, path: skillPath, ref };
    }

    return { owner, repo, path: "", ref: "main" };
  } catch {
    return null;
  }
}

/**
 * 获取 GitHub 目录内容
 */
async function fetchGitHubDir(
  owner: string,
  repo: string,
  dirPath: string,
  ref: string
): Promise<Array<{ type: string; name: string; path: string }> | null> {
  const url = `${GITHUB_API_BASE}/repos/${owner}/${repo}/contents/${dirPath}?ref=${ref}`;
  const token = process.env.GITHUB_TOKEN;

  const headers: Record<string, string> = {
    Accept: "application/vnd.github.v3+json",
    "User-Agent": "CloudCDE-Agent/1.0",
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(url, { headers, signal: AbortSignal.timeout(15000) });
  if (!response.ok) {
    if (response.status === 404) return null;
    throw new Error(`GitHub API error: ${response.status}`);
  }

  return response.json() as Promise<Array<{ type: string; name: string; path: string }>>;
}

/**
 * 递归下载 GitHub 目录到本地
 */
async function downloadGitHubDir(
  owner: string,
  repo: string,
  dirPath: string,
  ref: string,
  localDir: string
): Promise<void> {
  await fs.mkdir(localDir, { recursive: true });

  const contents = await fetchGitHubDir(owner, repo, dirPath, ref);
  if (!contents) {
    throw new Error(`GitHub directory not found: ${dirPath}`);
  }

  for (const item of contents) {
    const localPath = path.join(localDir, item.name);

    if (item.type === "dir") {
      await downloadGitHubDir(owner, repo, `${dirPath}/${item.name}`, ref, localPath);
    } else if (item.type === "file") {
      // 下载文件内容
      const fileUrl = `${GITHUB_API_BASE}/repos/${owner}/${repo}/contents/${dirPath}/${item.name}?ref=${ref}`;
      const token = process.env.GITHUB_TOKEN;

      const headers: Record<string, string> = {
        Accept: "application/vnd.github.v3.raw",
        "User-Agent": "CloudCDE-Agent/1.0",
      };
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }

      const response = await fetch(fileUrl, { headers, signal: AbortSignal.timeout(15000) });
      if (response.ok) {
        const buffer = Buffer.from(await response.arrayBuffer());
        await fs.writeFile(localPath, buffer);
      }
    }
  }
}

// ========== 工具函数 ==========

async function copyDirectory(src: string, dest: string): Promise<void> {
  await fs.mkdir(dest, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      await copyDirectory(srcPath, destPath);
    } else if (entry.isFile()) {
      await fs.copyFile(srcPath, destPath);
    }
  }
}

async function computeChecksum(buffer: Buffer): Promise<string> {
  const { createHash } = await import("crypto");
  return createHash("sha256").update(buffer).digest("hex").substring(0, 16);
}
