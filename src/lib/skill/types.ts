/**
 * Skill 系统类型定义
 * Phase 5: 可插拔能力扩展
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
  handler: "local" | "mcp"; // 执行方式：本地函数 or MCP 远程
  mcpTool?: string; // handler 为 mcp 时对应的 MCP 工具名
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
}
