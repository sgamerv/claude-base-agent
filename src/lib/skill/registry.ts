/**
 * Skill Registry
 * 管理已安装 Skill 的 CRUD，JSON 持久化
 * Phase 5: 可插拔能力扩展
 * Phase 7: SKILL.md 包管理（从 skills/ 目录加载自定义 Skill）
 */

import { promises as fs } from "fs";
import path from "path";
import type { Skill, SkillToolDefinition } from "./types";
import { BUILT_IN_SKILLS, getExtensionSkillById } from "./market";
import { parseSkillMd } from "./parser";
import { registerExternalMCPRoute, clearExternalMCPRoutes } from "./executor";

// ========== 存储路径 ==========

const PROJECT_ROOT = process.cwd();
const DATA_DIR = path.join(PROJECT_ROOT, "data");
const SKILLS_FILE = path.join(DATA_DIR, "skills.json");
const SKILLS_DIR = path.join(PROJECT_ROOT, "skills");

// ========== 文件读写 ==========

async function ensureDataDir(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

async function readSkillsFile(): Promise<Skill[]> {
  try {
    const content = await fs.readFile(SKILLS_FILE, "utf-8");
    return JSON.parse(content);
  } catch {
    return [];
  }
}

async function writeSkillsFile(skills: Skill[]): Promise<void> {
  await ensureDataDir();
  await fs.writeFile(SKILLS_FILE, JSON.stringify(skills, null, 2), "utf-8");
}

// ========== 从 skills/ 目录扫描 ==========

/**
 * 扫描 skills/ 目录，加载所有包含 SKILL.md 的自定义 Skill
 * 这些是 Phase 7 安装的 SKILL.md 型 Skill
 */
async function scanSkillsDirectory(): Promise<Skill[]> {
  const skills: Skill[] = [];

  try {
    await fs.access(SKILLS_DIR);
  } catch {
    return skills; // skills/ 目录不存在
  }

  const entries = await fs.readdir(SKILLS_DIR, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith(".")) continue;

    const skillMdPath = path.join(SKILLS_DIR, entry.name, "SKILL.md");
    try {
      await fs.access(skillMdPath);
    } catch {
      continue; // 没有 SKILL.md，跳过
    }

    const content = await fs.readFile(skillMdPath, "utf-8");
    const parseResult = parseSkillMd(content);

    if (parseResult.success && parseResult.parsed) {
      const parsed = parseResult.parsed;
      const id = entry.name; // 使用目录名作为 ID

      // 检查是否已在 skills.json 中注册（有运行时信息如 enabled、source）
      const registered = await findRegisteredSkill(id);

      skills.push({
        id,
        name: parsed.name,
        description: parsed.description,
        icon: getCategoryIcon(parsed.metadata.category),
        version: parsed.metadata.version || "1.0.0",
        author: parsed.metadata.author || "unknown",
        category: "extension",
        tools: [],
        systemPromptAddon: parsed.promptContent, // SKILL.md 正文作为 Prompt
        skillMdPath: `${id}/SKILL.md`,
        enabled: registered?.enabled ?? true,
        source: registered?.source ?? {
          type: "local",
          installedAt: Date.now(),
        },
        installedAt: registered?.installedAt ?? Date.now(),
      });
    }
  }

  return skills;
}

/**
 * 从 skills.json 中查找指定 ID 的已注册 Skill
 */
async function findRegisteredSkill(id: string): Promise<Skill | null> {
  const skills = await readSkillsFile();
  return skills.find((s) => s.id === id) || null;
}

// ========== CRUD ==========

/**
 * 获取所有已安装的 Skill（内置 + 扩展 + skills/ 目录自定义）
 * 内置 Skill 始终在列表中
 */
export async function getInstalledSkills(): Promise<Skill[]> {
  const extensionSkills = await readSkillsFile();
  const dirSkills = await scanSkillsDirectory();

  // 合并内置 Skill（以最新定义为准）
  const installedMap = new Map<string, Skill>();

  // 先加入内置
  for (const skill of BUILT_IN_SKILLS) {
    installedMap.set(skill.id, { ...skill });
  }

  // 再加入扩展（从文件读取的包含 installedAt 等运行时信息）
  for (const skill of extensionSkills) {
    installedMap.set(skill.id, skill);
  }

  // 最后加入 skills/ 目录的自定义 Skill（覆盖 skills.json 中的同名记录，因为目录内容是最新的）
  for (const skill of dirSkills) {
    installedMap.set(skill.id, skill);
  }

  return Array.from(installedMap.values());
}

/**
 * 获取所有已启用 Skill 的工具定义
 * 用于注入到 LLM 的 tools 参数
 * Phase 9: 注册 external-mcp 工具路由
 */
export async function getEnabledSkillTools(): Promise<SkillToolDefinition[]> {
  const skills = await getInstalledSkills();
  const tools: SkillToolDefinition[] = [];

  // 清除旧的 external-mcp 路由
  clearExternalMCPRoutes();

  for (const skill of skills) {
    if (!skill.enabled) continue;
    for (const tool of skill.tools) {
      tools.push(tool);

      // Phase 9: 注册 external-mcp 路由到 executor
      if (tool.handler === "external-mcp" && tool.mcpServerId && tool.mcpTool) {
        registerExternalMCPRoute(tool.name, tool.mcpServerId, tool.mcpTool);
      }
    }
  }
  return tools;
}

/**
 * 获取所有已启用 Skill 的 systemPromptAddon
 * 用于注入到 System Prompt
 *
 * Phase 7 扩展：同时读取 skills/ 目录中 SKILL.md 的内容
 */
export async function getEnabledSkillPromptAddons(): Promise<string[]> {
  const skills = await getInstalledSkills();
  const addons: string[] = [];
  for (const skill of skills) {
    if (!skill.enabled) continue;

    // 1. 传统 Skill：使用硬编码的 systemPromptAddon
    if (skill.systemPromptAddon) {
      addons.push(skill.systemPromptAddon);
    }

    // 2. SKILL.md 型 Skill：从 skills/ 目录读取 Prompt 内容
    //    （已在 scanSkillsDirectory 中读取并设置到 systemPromptAddon，
    //     所以这里不需要额外读取文件）
  }
  return addons;
}

/**
 * 安装扩展 Skill
 * @returns 安装后的 Skill，如果已安装返回 null
 */
export async function installSkill(skillId: string): Promise<Skill | null> {
  // 查找扩展 Skill 定义
  const skillDef = getExtensionSkillById(skillId);
  if (!skillDef) {
    throw new Error(`Skill not found in market: ${skillId}`);
  }

  // 检查是否已安装
  const existing = await readSkillsFile();
  if (existing.find((s) => s.id === skillId)) {
    return null; // 已安装
  }

  const skill: Skill = {
    ...skillDef,
    installedAt: Date.now(),
    enabled: true,
  };

  existing.push(skill);
  await writeSkillsFile(existing);

  console.log(`[Skill] Installed: ${skillId}`);
  return skill;
}

/**
 * 卸载扩展 Skill
 * 内置 Skill 不可卸载
 * Phase 7 扩展：同时删除 skills/{id}/ 目录
 */
export async function uninstallSkill(skillId: string): Promise<boolean> {
  // 不允许卸载内置 Skill
  if (BUILT_IN_SKILLS.find((s) => s.id === skillId)) {
    throw new Error(`Cannot uninstall built-in skill: ${skillId}`);
  }

  const existing = await readSkillsFile();
  const idx = existing.findIndex((s) => s.id === skillId);
  if (idx === -1) return false;

  existing.splice(idx, 1);
  await writeSkillsFile(existing);

  // Phase 7: 删除 skills/ 目录中的文件
  const skillDir = path.join(SKILLS_DIR, skillId);
  try {
    await fs.rm(skillDir, { recursive: true, force: true });
  } catch {
    // 目录不存在或删除失败，不影响卸载
  }

  console.log(`[Skill] Uninstalled: ${skillId}`);
  return true;
}

/**
 * 启用/禁用 Skill
 */
export async function toggleSkill(skillId: string, enabled: boolean): Promise<Skill | null> {
  // 内置 Skill
  const builtIn = BUILT_IN_SKILLS.find((s) => s.id === skillId);
  if (builtIn) {
    // 内置 Skill 的 enabled 状态也需要持久化
    const existing = await readSkillsFile();
    const idx = existing.findIndex((s) => s.id === skillId);
    if (idx === -1) {
      // 首次修改，需要新增一条记录
      existing.push({ ...builtIn, enabled, installedAt: Date.now() });
    } else {
      existing[idx].enabled = enabled;
    }
    await writeSkillsFile(existing);
    return { ...builtIn, enabled };
  }

  // 扩展 Skill
  const existing = await readSkillsFile();
  const idx = existing.findIndex((s) => s.id === skillId);
  if (idx === -1) return null;

  existing[idx].enabled = enabled;
  await writeSkillsFile(existing);
  return existing[idx];
}

/**
 * 根据 ID 获取已安装的 Skill
 */
export async function getSkillById(skillId: string): Promise<Skill | null> {
  const skills = await getInstalledSkills();
  return skills.find((s) => s.id === skillId) || null;
}

// ========== 工具函数 ==========

const CATEGORY_ICONS: Record<string, string> = {
  design: "🎨",
  writing: "✍️",
  code: "💻",
  review: "👀",
  testing: "🧪",
  deploy: "🚀",
  data: "📊",
  security: "🔒",
  productivity: "⚡",
  research: "🔬",
};

function getCategoryIcon(category?: string): string {
  if (!category) return "🧩";
  return CATEGORY_ICONS[category.toLowerCase()] || "🧩";
}
