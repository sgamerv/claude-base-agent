/**
 * MCP 类型定义 — 外部 MCP 服务集成
 * Phase 9: 支持多个外部 MCP Server 动态连接
 */

/** MCP Server 配置 */
export interface MCPServerConfig {
  /** 唯一标识，如 "postgres-mcp" */
  id: string;
  /** 显示名称，如 "PostgreSQL MCP" */
  name: string;
  /** MCP Server URL，如 "http://localhost:5432/mcp" */
  url: string;
  /** 传输协议 */
  transport: "sse" | "streamable-http" | "stdio";
  /** 是否启用 */
  enabled: boolean;
  /** 自定义请求头（如认证） */
  headers?: Record<string, string>;
  /** 标签分类 */
  tags?: string[];
  /** 添加时间 */
  addedAt?: number;
  /** stdio 模式的启动命令 */
  command?: string;
  /** stdio 模式的启动参数 */
  args?: string[];
  /** stdio 模式的环境变量 */
  env?: Record<string, string>;
}

/** MCP Server 连接状态 */
export type MCPServerStatus = "disconnected" | "connecting" | "connected" | "error";

/** MCP Server 连接实例 */
export interface MCPServerConnection {
  /** 服务器配置 */
  config: MCPServerConfig;
  /** 当前连接状态 */
  status: MCPServerStatus;
  /** 从 MCP Server 动态获取的工具列表 */
  tools: MCPToolInfo[];
  /** 上次同步工具列表的时间 */
  lastSyncAt: number;
  /** 错误信息 */
  error?: string;
  /** 重连次数 */
  reconnectAttempts: number;
}

/** MCP 工具信息 */
export interface MCPToolInfo {
  /** 工具名（含 server 前缀，如 "postgres__query"） */
  name: string;
  /** 工具原始名（不含前缀，如 "query"） */
  originalName: string;
  /** 工具描述 */
  description: string;
  /** 参数 JSON Schema */
  inputSchema: Record<string, unknown>;
  /** 所属 MCP Server ID */
  serverId: string;
}

/** MCP Transport 接口 */
export interface MCPTransport {
  /** 建立连接 */
  connect(): Promise<void>;
  /** 断开连接 */
  disconnect(): Promise<void>;
  /** 获取工具列表 */
  listTools(): Promise<MCPToolInfo[]>;
  /** 调用工具 */
  callTool(name: string, args: Record<string, unknown>): Promise<MCPToolResult>;
  /** 健康检查 */
  healthCheck(): Promise<boolean>;
}

/** MCP 工具调用结果 */
export interface MCPToolResult {
  success: boolean;
  content: string;
  error?: string;
}
