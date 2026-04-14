/**
 * SKILL.md 解析器
 * 解析业界标准的 SKILL.md 格式（YAML frontmatter + Markdown 正文）
 * Phase 7: SKILL.md 包管理
 */

import yaml from "js-yaml";
import type { Skill, SkillSource } from "./types";

// ========== 解析结果 ==========

export interface ParsedSkillMd {
  name: string;
  description: string;
  license?: string;
  compatibility?: string;
  metadata: Record<string, string>;
  allowedTools: string[];
  promptContent: string; // Markdown 正文（SKILL.md frontmatter 之后的内容）
}

export interface ParseError {
  field: string;
  message: string;
}

export interface ParseResult {
  success: boolean;
  parsed?: ParsedSkillMd;
  errors: ParseError[];
}

// ========== 解析 ==========

/**
 * 解析 SKILL.md 内容
 *
 * SKILL.md 格式：
 * ---
 * name: brainstorming
 * description: "探索用户意图..."
 * license: MIT
 * metadata:
 *   author: anthropics
 *   version: "1.0"
 * allowed-tools: Read Write Bash
 * ---
 *
 * # 头脑风暴
 * ...Markdown 正文...
 */
export function parseSkillMd(content: string): ParseResult {
  const errors: ParseError[] = [];

  // 提取 YAML frontmatter
  const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!frontmatterMatch) {
    return {
      success: false,
      errors: [{ field: "frontmatter", message: "Missing YAML frontmatter (--- delimiters)" }],
    };
  }

  const yamlStr = frontmatterMatch[1];
  const markdownContent = content.slice(frontmatterMatch[0].length).trim();

  // 解析 YAML
  let frontmatter: Record<string, unknown>;
  try {
    frontmatter = yaml.load(yamlStr) as Record<string, unknown>;
  } catch (e) {
    return {
      success: false,
      errors: [{ field: "frontmatter", message: `Invalid YAML: ${e instanceof Error ? e.message : String(e)}` }],
    };
  }

  // 提取必需字段
  const name = String(frontmatter.name || "").trim();
  const description = String(frontmatter.description || "").trim();

  if (!name) {
    errors.push({ field: "name", message: "Missing required field: name" });
  }
  if (!description) {
    errors.push({ field: "description", message: "Missing required field: description" });
  }

  if (errors.length > 0) {
    return { success: false, errors };
  }

  // 提取 metadata
  const metadata: Record<string, string> = {};
  if (frontmatter.metadata && typeof frontmatter.metadata === "object") {
    for (const [key, value] of Object.entries(frontmatter.metadata as Record<string, unknown>)) {
      metadata[key] = String(value);
    }
  }

  // 提取 allowed-tools
  let allowedTools: string[] = [];
  if (frontmatter["allowed-tools"]) {
    const toolsStr = String(frontmatter["allowed-tools"]);
    allowedTools = toolsStr.split(/[\s,]+/).filter(Boolean);
  }

  return {
    success: true,
    parsed: {
      name,
      description,
      license: frontmatter.license ? String(frontmatter.license) : undefined,
      compatibility: frontmatter.compatibility ? String(frontmatter.compatibility) : undefined,
      metadata,
      allowedTools,
      promptContent: markdownContent,
    },
    errors: [],
  };
}

// ========== 转换为 Skill 模型 ==========

/**
 * 将解析后的 SKILL.md 转换为内部 Skill 模型
 *
 * 设计决策：SKILL.md 型 Skill 采用纯 Prompt 注入模式
 * - 不注册虚拟工具（与 Claude Code / CodeBuddy 行为一致）
 * - SKILL.md 的 Markdown 正文直接注入到 System Prompt
 * - LLM 根据 Prompt 指令自然调用已有工具
 */
export function convertToSkill(parsed: ParsedSkillMd, source: SkillSource): Skill {
  const id = toKebabCase(parsed.name);

  return {
    id,
    name: parsed.name,
    description: parsed.description,
    icon: getIconForCategory(parsed.metadata.category),
    version: parsed.metadata.version || "1.0.0",
    author: parsed.metadata.author || "unknown",
    category: "extension",
    tools: [], // SKILL.md 型 Skill 不注册工具，纯 Prompt 注入
    systemPromptAddon: buildPromptAddon(parsed),
    source,
    skillMdPath: `${id}/SKILL.md`,
    enabled: true,
  };
}

/**
 * 构建 systemPromptAddon
 * 将 SKILL.md 的 allowed-tools 声明和 Markdown 指令组合为完整 Prompt
 */
function buildPromptAddon(parsed: ParsedSkillMd): string {
  const parts: string[] = [];

  // Skill 能力声明
  parts.push(`## Skill: ${parsed.name}`);
  parts.push(parsed.description);

  // allowed-tools 声明
  if (parsed.allowedTools.length > 0) {
    parts.push(`\n可用工具: ${parsed.allowedTools.join(", ")}`);
  }

  // SKILL.md 的完整指令内容
  if (parsed.promptContent) {
    parts.push(`\n${parsed.promptContent}`);
  }

  return parts.join("\n");
}

// ========== 工具函数 ==========

function toKebabCase(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

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

function getIconForCategory(category?: string): string {
  if (!category) return "🧩";
  return CATEGORY_ICONS[category.toLowerCase()] || "🧩";
}
