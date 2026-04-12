/**
 * Skill 市场
 * 提供可安装的 Skill 预设列表
 * Phase 5: 可插拔能力扩展
 */

import type { Skill } from "./types";

/**
 * 内置 Skills — 系统预装的基础能力，不可卸载
 */
export const BUILT_IN_SKILLS: Skill[] = [
  {
    id: "filesystem",
    name: "文件系统",
    description: "读取目录、读写文件、列出项目结构",
    icon: "📁",
    version: "1.0.0",
    author: "system",
    category: "built-in",
    enabled: true,
    tools: [
      {
        name: "read_directory",
        description: "读取指定目录的文件和子目录列表。返回目录结构信息。",
        parameters: {
          type: "object",
          properties: {
            path: {
              type: "string",
              description: "要读取的目录路径，默认为项目根目录",
            },
          },
          required: ["path"],
        },
        handler: "mcp",
        mcpTool: "read_directory",
      },
      {
        name: "read_file",
        description: "读取指定文件的内容。返回文件的完整文本内容。",
        parameters: {
          type: "object",
          properties: {
            path: {
              type: "string",
              description: "要读取的文件路径",
            },
          },
          required: ["path"],
        },
        handler: "mcp",
        mcpTool: "read_file",
      },
      {
        name: "write_file",
        description: "写入内容到指定文件。如果文件不存在则创建，已存在则覆盖。",
        parameters: {
          type: "object",
          properties: {
            path: {
              type: "string",
              description: "要写入的文件路径",
            },
            content: {
              type: "string",
              description: "要写入的文件内容",
            },
          },
          required: ["path", "content"],
        },
        handler: "mcp",
        mcpTool: "write_file",
      },
      {
        name: "list_files",
        description: "递归列出项目中所有文件。用于快速了解项目结构。",
        parameters: {
          type: "object",
          properties: {
            pattern: {
              type: "string",
              description: "文件名匹配模式 (可选)",
            },
          },
          required: [],
        },
        handler: "mcp",
        mcpTool: "list_files",
      },
    ],
    systemPromptAddon:
      "你可以使用文件系统工具来浏览项目结构、读取和写入文件。修改代码前，先读取相关文件了解上下文。",
  },
  {
    id: "terminal",
    name: "终端操作",
    description: "执行 Shell 命令，运行测试、安装依赖、编译项目等",
    icon: "💻",
    version: "1.0.0",
    author: "system",
    category: "built-in",
    enabled: true,
    tools: [
      {
        name: "execute_bash",
        description:
          "在远程环境中执行 shell 命令。可用于运行测试、安装依赖、编译项目等操作。",
        parameters: {
          type: "object",
          properties: {
            command: {
              type: "string",
              description: "要执行的 shell 命令",
            },
          },
          required: ["command"],
        },
        handler: "mcp",
        mcpTool: "execute_command",
      },
    ],
    systemPromptAddon:
      "你可以通过 execute_bash 执行 Shell 命令。执行危险命令（如 rm -rf）前需要获得用户确认。",
  },
  {
    id: "git",
    name: "Git 版本控制",
    description: "查看 Git 状态、差异等版本控制操作",
    icon: "🔀",
    version: "1.0.0",
    author: "system",
    category: "built-in",
    enabled: true,
    tools: [
      {
        name: "git_status",
        description: "查看 Git 仓库当前状态，包括修改、新增和删除的文件。",
        parameters: {
          type: "object",
          properties: {},
          required: [],
        },
        handler: "mcp",
        mcpTool: "git_status",
      },
      {
        name: "git_diff",
        description: "查看 Git 差异。可查看所有变更或指定文件的变更。",
        parameters: {
          type: "object",
          properties: {
            path: {
              type: "string",
              description: "文件路径（可选），不传则查看所有变更",
            },
          },
          required: [],
        },
        handler: "mcp",
        mcpTool: "git_diff",
      },
    ],
    systemPromptAddon:
      "你可以使用 git 工具查看代码仓库的状态和差异。在修改代码后，建议用 git_diff 查看变更。",
  },
];

/**
 * 扩展 Skills — 用户可安装的第三方能力
 */
export const EXTENSION_SKILLS: Skill[] = [
  {
    id: "web-search",
    name: "Web 搜索",
    description: "搜索互联网获取最新信息，查找文档和解决方案",
    icon: "🔍",
    version: "1.0.0",
    author: "community",
    category: "extension",
    enabled: true,
    tools: [
      {
        name: "web_search",
        description:
          "搜索互联网获取信息。当需要查找最新资料、API文档、技术方案时使用。",
        parameters: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "搜索关键词",
            },
          },
          required: ["query"],
        },
        handler: "local",
      },
    ],
    systemPromptAddon:
      "你可以使用 web_search 工具搜索互联网。当用户的问题涉及最新信息、API文档或你不熟悉的技术时，主动搜索以获取准确答案。",
  },
  {
    id: "api-testing",
    name: "API 测试",
    description: "发送 HTTP 请求测试 API 接口",
    icon: "🌐",
    version: "1.0.0",
    author: "community",
    category: "extension",
    enabled: true,
    tools: [
      {
        name: "http_request",
        description:
          "发送 HTTP 请求。可用于测试 API 接口、调用 Web 服务等。",
        parameters: {
          type: "object",
          properties: {
            url: {
              type: "string",
              description: "请求 URL",
            },
            method: {
              type: "string",
              description: "HTTP 方法：GET/POST/PUT/DELETE/PATCH",
            },
            headers: {
              type: "string",
              description: "请求头 (JSON 格式字符串，可选)",
            },
            body: {
              type: "string",
              description: "请求体 (可选)",
            },
          },
          required: ["url"],
        },
        handler: "local",
      },
    ],
    systemPromptAddon:
      "你可以使用 http_request 工具发送 HTTP 请求。当需要测试 API 接口或调用 Web 服务时使用。",
  },
  {
    id: "code-review",
    name: "代码审查",
    description: "自动化代码审查，提供改进建议",
    icon: "👀",
    version: "1.0.0",
    author: "community",
    category: "extension",
    enabled: true,
    tools: [
      {
        name: "review_file",
        description:
          "审查指定文件的代码质量，提供改进建议。包括代码风格、潜在 Bug、性能优化等。",
        parameters: {
          type: "object",
          properties: {
            path: {
              type: "string",
              description: "要审查的文件路径",
            },
          },
          required: ["path"],
        },
        handler: "local",
      },
    ],
    systemPromptAddon:
      "你可以使用 review_file 工具审查代码。当用户请求代码审查或你想主动检查代码质量时使用。",
  },
  {
    id: "deploy",
    name: "部署管理",
    description: "触发和监控项目部署流程",
    icon: "🚀",
    version: "1.0.0",
    author: "community",
    category: "extension",
    enabled: true,
    tools: [
      {
        name: "deploy_trigger",
        description: "触发项目部署。将当前工作区的代码部署到目标环境。",
        parameters: {
          type: "object",
          properties: {
            environment: {
              type: "string",
              description: "部署环境：dev/staging/production",
            },
          },
          required: ["environment"],
        },
        handler: "local",
      },
      {
        name: "deploy_status",
        description: "查看最近的部署状态和日志。",
        parameters: {
          type: "object",
          properties: {},
          required: [],
        },
        handler: "local",
      },
    ],
    systemPromptAddon:
      "你可以使用部署工具来触发和监控项目部署。部署前建议先用 git_status 确认代码变更。",
  },
];

/**
 * 获取所有可安装的扩展 Skill（排除已安装的）
 */
export function getMarketSkills(installedIds: string[]): Skill[] {
  return EXTENSION_SKILLS.filter((s) => !installedIds.includes(s.id));
}

/**
 * 根据 ID 获取扩展 Skill 定义
 */
export function getExtensionSkillById(id: string): Skill | undefined {
  return EXTENSION_SKILLS.find((s) => s.id === id);
}
