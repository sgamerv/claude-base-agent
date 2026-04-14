/**
 * Skill 系统类型定义
 * Phase 5: 可插拔能力扩展
 * Phase 7: SKILL.md 包管理
 * Phase 9: 外部 MCP 服务集成
 */

export interface SkillToolDefinition {
  name: string; // 工具名，如 "web_search"
  description: string; // 工具描述，LLM 据此判断是否调用
  parameters: {
    type: "object";
    properties: Record<string, {
      type: string;
      description: string;
    }>;
    required: string[];
  };
  handler: "local" | "mcp" | "external-mcp"; // 执行方式：本地函数 / MCP 远程 / 外部 MCP
  mcpTool?: string; // handler 为 mcp 时对应的 MCP 工具名
  mcpServerId?: string; // Phase 9: handler 为 external-mcp 时指定外部 MCP Server ID
}

/** Skill 安装来源 */
export interface SkillSource {
  type: "market" | "zip" | "github" | "local" | "url";
  url?: string; // GitHub URL 或 ZIP 下载 URL
  ref?: string; // Git 分支/tag/commit
  installedAt: number; // 安装时间
  checksum?: string; // ZIP 包 SHA256 校验和
}

export interface Skill {
  id: string; // 唯一标识，如 "web-search"
  name: string; // 显示名称，如 "Web Search"
  description: string; // 简短描述
  icon: string; // emoji 图标
  version: string; // 版本号
  author: string; // 作者
  category: "built-in" | "extension"; // 内置 or 扩展
  tools: SkillToolDefinition[]; // 该 Skill 提供的工具定义
  systemPromptAddon?: string; // 注入到 System Prompt 的额外指令
  installedAt?: number; // 安装时间
  enabled: boolean; // 是否启用

  // Phase 7: SKILL.md 包管理字段
  source?: SkillSource; // 安装来源
  skillMdPath?: string; // SKILL.md 文件在 skills/ 目录中的相对路径
}
