/**
 * Skill Registry
 * 管理已安装 Skill 的 CRUD，JSON 持久化
 * Phase 5: 可插拔能力扩展
 */

import { promises as fs } from "fs";
import path from "path";
import type { Skill, SkillToolDefinition } from "./types";
import { BUILT_IN_SKILLS, getExtensionSkillById } from "./market";

// ========== 存储路径 ==========

const PROJECT_ROOT = process.cwd();
const DATA_DIR = path.join(PROJECT_ROOT, "data");
const SKILLS_FILE = path.join(DATA_DIR, "skills.json");

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

// ========== CRUD ==========

/**
 * 获取所有已安装的 Skill（内置 + 扩展）
 * 内置 Skill 始终在列表中
 */
export async function getInstalledSkills(): Promise<Skill[]> {
  const extensionSkills = await readSkillsFile();

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

  return Array.from(installedMap.values());
}

/**
 * 获取所有已启用 Skill 的工具定义
 * 用于注入到 LLM 的 tools 参数
 */
export async function getEnabledSkillTools(): Promise<SkillToolDefinition[]> {
  const skills = await getInstalledSkills();
  const tools: SkillToolDefinition[] = [];
  for (const skill of skills) {
    if (skill.enabled) {
      tools.push(...skill.tools);
    }
  }
  return tools;
}

/**
 * 获取所有已启用 Skill 的 systemPromptAddon
 * 用于注入到 System Prompt
 */
export async function getEnabledSkillPromptAddons(): Promise<string[]> {
  const skills = await getInstalledSkills();
  const addons: string[] = [];
  for (const skill of skills) {
    if (skill.enabled && skill.systemPromptAddon) {
      addons.push(skill.systemPromptAddon);
    }
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
