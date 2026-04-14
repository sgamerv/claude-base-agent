/**
 * Agent 工具定义
 * Phase 5: 合并基础工具 + Skill 工具
 */

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, Record<string, unknown>>;
    required: string[];
  };
}

/**
 * 基础工具（不属于任何 Skill 的通用工具）
 * ask_user 是系统级工具，不属于任何 Skill
 * Phase 8: 扩展 options/multiple 参数支持结构化选项
 */
export const BASE_TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: "ask_user",
    description: "当需要用户提供额外信息、做决定或确认方案时调用此工具。支持结构化选项列表，用户可通过点击选择或自由输入回复。",
    parameters: {
      type: "object",
      properties: {
        question: {
          type: "string",
          description: "向用户提出的具体问题",
        },
        options: {
          type: "array",
          description: "可选的结构化选项列表。提供选项时，用户可点击选择；不提供时显示文本输入框。",
          items: {
            type: "object",
            properties: {
              label: {
                type: "string",
                description: "选项显示文本",
              },
              value: {
                type: "string",
                description: "选项值（选择后发送给 Agent 的文本）",
              },
              description: {
                type: "string",
                description: "选项描述（可选，帮助用户理解选项含义）",
              },
            },
            required: ["label", "value"],
          },
        },
        multiple: {
          type: "boolean",
          description: "是否允许多选。默认 false（单选）。设为 true 时用户可选择多个选项，选择值以逗号拼接返回。",
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
  additionalTools?: { name: string; description: string; parameters: Record<string, unknown> }[]
) {
  const allTools: { name: string; description: string; parameters: Record<string, unknown> }[] = [
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
