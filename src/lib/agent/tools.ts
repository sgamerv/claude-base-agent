/**
 * Agent 工具定义
 * Phase 5: 合并基础工具 + Skill 工具
 */

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, {
      type: string;
      description: string;
    }>;
    required: string[];
  };
}

/**
 * 基础工具（不属于任何 Skill 的通用工具）
 * ask_user 是系统级工具，不属于任何 Skill
 */
export const BASE_TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: "ask_user",
    description: "当需要用户提供额外信息、做决定或确认方案时调用此工具。将问题推送给用户并等待回复。",
    parameters: {
      type: "object",
      properties: {
        question: {
          type: "string",
          description: "向用户提出的具体问题",
        },
      },
      required: ["question"],
    },
  },
];

/**
 * 将工具定义列表转换为 GLM API 的 tools 格式
 * @param additionalTools 额外的工具定义（来自 Skill）
 */
export function toGLMTools(
  additionalTools?: { name: string; description: string; parameters: ToolDefinition["parameters"] }[]
) {
  const allTools: { name: string; description: string; parameters: ToolDefinition["parameters"] }[] = [
    ...BASE_TOOL_DEFINITIONS,
  ];

  if (additionalTools) {
    allTools.push(...additionalTools);
  }

  return allTools.map((tool) => ({
    type: "function" as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }));
}
