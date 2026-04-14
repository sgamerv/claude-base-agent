/**
 * MCP Hub — 外部 MCP 服务连接管理器
 * 管理多个 MCP Server 连接，统一路由工具调用
 * Phase 9A: 核心实现
 */

import type {
  MCPServerConfig,
  MCPServerConnection,
  MCPServerStatus,
  MCPToolInfo,
  MCPToolResult,
  MCPTransport,
} from "./types";
import { MCPClient } from "./client";
import { loadServerConfigs } from "./config";
import { createTransport } from "./transport";

class MCPHub {
  private connections: Map<string, MCPServerConnection> = new Map();
  private transports: Map<string, MCPTransport> = new Map();
  private builtInClient: MCPClient | null = null;
  private builtInAvailable = false;
  private healthCheckInterval: NodeJS.Timeout | null = null;

  /**
   * 初始化 MCP Hub
   * 1. 连接内置 CDE MCP Server
   * 2. 加载外部 MCP Server 配置并连接
   */
  async initialize(builtInServerUrl?: string): Promise<void> {
    // 1. 初始化内置 CDE MCP 连接
    const url = builtInServerUrl || process.env.MCP_SERVER_URL || "http://localhost:3001";
    this.builtInClient = new MCPClient(url);
    this.builtInAvailable = await this.builtInClient.healthCheck();

    if (this.builtInAvailable) {
      console.log(`[MCP Hub] Built-in CDE MCP connected at ${url}`);
    } else {
      console.log(`[MCP Hub] Built-in CDE MCP not available at ${url}`);
    }

    // 2. 加载并连接外部 MCP Server
    try {
      const configs = await loadServerConfigs();
      for (const config of configs) {
        if (config.enabled) {
          await this.connectServer(config);
        } else {
          // 记录禁用的服务器
          this.connections.set(config.id, {
            config,
            status: "disconnected",
            tools: [],
            lastSyncAt: 0,
            reconnectAttempts: 0,
          });
        }
      }
      console.log(`[MCP Hub] Loaded ${configs.length} external MCP Server configs`);
    } catch (error) {
      console.error("[MCP Hub] Failed to load external MCP configs:", error);
    }

    // 3. 启动心跳检测
    this.startHealthCheck(30000);
  }

  /**
   * 连接单个外部 MCP Server
   */
  private async connectServer(config: MCPServerConfig): Promise<void> {
    const connection: MCPServerConnection = {
      config,
      status: "connecting",
      tools: [],
      lastSyncAt: 0,
      reconnectAttempts: 0,
    };
    this.connections.set(config.id, connection);

    try {
      const transport = createTransport(config.transport, config.url, config.headers);
      await transport.connect();

      // 获取工具列表
      const tools = await transport.listTools();

      // 为工具添加 serverId 前缀
      const prefixedTools = tools.map((tool) => ({
        ...tool,
        name: `${config.id}__${tool.originalName}`,
        serverId: config.id,
      }));

      connection.status = "connected";
      connection.tools = prefixedTools;
      connection.lastSyncAt = Date.now();
      connection.error = undefined;
      connection.reconnectAttempts = 0;

      this.transports.set(config.id, transport);
      console.log(`[MCP Hub] Connected to "${config.name}" (${config.id}), ${prefixedTools.length} tools available`);
    } catch (error) {
      connection.status = "error";
      connection.error = error instanceof Error ? error.message : String(error);
      console.error(`[MCP Hub] Failed to connect to "${config.name}" (${config.id}):`, connection.error);
    }
  }

  /**
   * 添加外部 MCP Server
   */
  async addServer(config: MCPServerConfig): Promise<MCPServerConnection> {
    if (this.connections.has(config.id)) {
      throw new Error(`MCP Server with id "${config.id}" already exists`);
    }

    const connection: MCPServerConnection = {
      config: { ...config, enabled: true, addedAt: Date.now() },
      status: "disconnected",
      tools: [],
      lastSyncAt: 0,
      reconnectAttempts: 0,
    };
    this.connections.set(config.id, connection);

    if (config.enabled !== false) {
      await this.connectServer(connection.config);
    }

    return this.connections.get(config.id)!;
  }

  /**
   * 移除 MCP Server
   */
  async removeServer(serverId: string): Promise<void> {
    const transport = this.transports.get(serverId);
    if (transport) {
      await transport.disconnect();
      this.transports.delete(serverId);
    }
    this.connections.delete(serverId);
    console.log(`[MCP Hub] Removed MCP Server: ${serverId}`);
  }

  /**
   * 启用/禁用 MCP Server
   */
  async toggleServer(serverId: string, enabled: boolean): Promise<void> {
    const connection = this.connections.get(serverId);
    if (!connection) throw new Error(`MCP Server "${serverId}" not found`);

    connection.config.enabled = enabled;

    if (enabled && connection.status !== "connected") {
      await this.connectServer(connection.config);
    } else if (!enabled && connection.status === "connected") {
      const transport = this.transports.get(serverId);
      if (transport) {
        await transport.disconnect();
        this.transports.delete(serverId);
      }
      connection.status = "disconnected";
      connection.tools = [];
    }
  }

  /**
   * 刷新某个 Server 的工具列表
   */
  async refreshTools(serverId: string): Promise<MCPToolInfo[]> {
    const transport = this.transports.get(serverId);
    const connection = this.connections.get(serverId);
    if (!transport || !connection) {
      throw new Error(`MCP Server "${serverId}" not connected`);
    }

    const tools = await transport.listTools();
    const prefixedTools = tools.map((tool) => ({
      ...tool,
      name: `${serverId}__${tool.originalName}`,
      serverId,
    }));

    connection.tools = prefixedTools;
    connection.lastSyncAt = Date.now();

    return prefixedTools;
  }

  /**
   * 路由工具调用（核心方法）
   * 根据工具名判断调用内置 MCP 还是外部 MCP
   */
  async executeTool(
    toolName: string,
    input: Record<string, unknown>,
    workspacePath?: string
  ): Promise<MCPToolResult | null> {
    // 检查是否为外部 MCP 工具（含 __ 前缀）
    if (toolName.includes("__")) {
      return this.executeExternalTool(toolName, input);
    }

    // 内置 MCP 工具
    if (this.builtInClient && this.builtInAvailable) {
      const mcpArgs = workspacePath ? { ...input, workspacePath } : input;
      return this.builtInClient.executeTool(toolName, mcpArgs as Record<string, string>);
    }

    // 没有可用的 MCP 连接
    return null;
  }

  /**
   * 执行外部 MCP 工具调用
   */
  private async executeExternalTool(
    toolName: string,
    input: Record<string, unknown>
  ): Promise<MCPToolResult> {
    // 解析 serverId 和原始工具名
    const separatorIndex = toolName.indexOf("__");
    const serverId = toolName.substring(0, separatorIndex);
    const originalToolName = toolName.substring(separatorIndex + 2);

    const transport = this.transports.get(serverId);
    const connection = this.connections.get(serverId);

    if (!transport || !connection || connection.status !== "connected") {
      return {
        success: false,
        content: "",
        error: `MCP Server "${serverId}" is not connected`,
      };
    }

    const result = await transport.callTool(originalToolName, input);

    // 在结果中附加来源信息
    if (result.success) {
      result.content = `[来自 ${connection.config.name}] ${result.content}`;
    }

    return result;
  }

  /**
   * 获取所有可用工具定义（注入 LLM）
   */
  getAllToolDefinitions(): Array<{
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  }> {
    const tools: Array<{
      name: string;
      description: string;
      parameters: Record<string, unknown>;
    }> = [];

    // 添加所有已连接外部 MCP Server 的工具
    for (const [serverId, connection] of this.connections) {
      if (connection.status !== "connected") continue;
      for (const tool of connection.tools) {
        tools.push({
          name: tool.name,
          description: `${tool.description} (来源: ${connection.config.name})`,
          parameters: tool.inputSchema,
        });
      }
    }

    return tools;
  }

  /**
   * 获取所有连接状态
   */
  getConnectionStatuses(): Array<{
    id: string;
    name: string;
    status: MCPServerStatus;
    toolCount: number;
    lastSyncAt: number;
    error?: string;
    tags?: string[];
  }> {
    const statuses: Array<{
      id: string;
      name: string;
      status: MCPServerStatus;
      toolCount: number;
      lastSyncAt: number;
      error?: string;
      tags?: string[];
    }> = [];

    // 内置 CDE MCP
    statuses.push({
      id: "cde-built-in",
      name: "CDE 内置 MCP",
      status: this.builtInAvailable ? "connected" as MCPServerStatus : "disconnected" as MCPServerStatus,
      toolCount: 7, // 内置 7 个工具
      lastSyncAt: Date.now(),
    });

    // 外部 MCP
    for (const [id, connection] of this.connections) {
      statuses.push({
        id,
        name: connection.config.name,
        status: connection.status,
        toolCount: connection.tools.length,
        lastSyncAt: connection.lastSyncAt,
        error: connection.error,
        tags: connection.config.tags,
      });
    }

    return statuses;
  }

  /**
   * 内置 MCP 是否可用
   */
  isBuiltInAvailable(): boolean {
    return this.builtInAvailable;
  }

  /**
   * 启动心跳检测
   */
  startHealthCheck(intervalMs: number = 30000): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    this.healthCheckInterval = setInterval(async () => {
      await this.performHealthCheck();
    }, intervalMs);
  }

  /**
   * 停止心跳检测
   */
  stopHealthCheck(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
  }

  /**
   * 执行一次健康检查
   */
  private async performHealthCheck(): Promise<void> {
    // 检查内置 MCP
    if (this.builtInClient) {
      const wasAvailable = this.builtInAvailable;
      this.builtInAvailable = await this.builtInClient.healthCheck();
      if (wasAvailable && !this.builtInAvailable) {
        console.warn("[MCP Hub] Built-in CDE MCP connection lost");
      } else if (!wasAvailable && this.builtInAvailable) {
        console.log("[MCP Hub] Built-in CDE MCP reconnected");
      }
    }

    // 检查外部 MCP 连接
    for (const [serverId, connection] of this.connections) {
      if (connection.status !== "connected" || !connection.config.enabled) continue;

      const transport = this.transports.get(serverId);
      if (!transport) continue;

      try {
        const healthy = await transport.healthCheck();
        if (!healthy) {
          console.warn(`[MCP Hub] Health check failed for "${connection.config.name}" (${serverId})`);
          connection.status = "error";
          connection.error = "Health check failed";

          // 尝试自动重连
          await this.tryReconnect(serverId);
        }
      } catch (error) {
        connection.status = "error";
        connection.error = error instanceof Error ? error.message : String(error);
        await this.tryReconnect(serverId);
      }
    }
  }

  /**
   * 自动重连
   * 指数退避，最多 5 次
   */
  private async tryReconnect(serverId: string): Promise<void> {
    const connection = this.connections.get(serverId);
    if (!connection || !connection.config.enabled) return;

    connection.reconnectAttempts++;
    if (connection.reconnectAttempts > 5) {
      console.error(`[MCP Hub] Max reconnect attempts reached for "${connection.config.name}" (${serverId})`);
      return;
    }

    // 指数退避：2s, 4s, 8s, 16s, 32s
    const delayMs = Math.pow(2, connection.reconnectAttempts) * 1000;
    console.log(
      `[MCP Hub] Reconnecting "${connection.config.name}" (${serverId}), attempt ${connection.reconnectAttempts}, delay ${delayMs}ms`
    );

    await new Promise((resolve) => setTimeout(resolve, delayMs));

    try {
      // 先断开旧连接
      const oldTransport = this.transports.get(serverId);
      if (oldTransport) {
        await oldTransport.disconnect();
        this.transports.delete(serverId);
      }

      await this.connectServer(connection.config);
      console.log(`[MCP Hub] Reconnected "${connection.config.name}" (${serverId})`);
    } catch (error) {
      console.error(`[MCP Hub] Reconnect failed for "${connection.config.name}" (${serverId}):`, error);
    }
  }

  /**
   * 关闭所有连接
   */
  async shutdown(): Promise<void> {
    this.stopHealthCheck();

    // 关闭所有外部连接
    for (const [serverId, transport] of this.transports) {
      try {
        await transport.disconnect();
      } catch (error) {
        console.error(`[MCP Hub] Error disconnecting ${serverId}:`, error);
      }
    }
    this.transports.clear();
    this.connections.clear();

    console.log("[MCP Hub] All connections closed");
  }
}

// 单例
let hubInstance: MCPHub | null = null;

/**
 * 获取 MCPHub 单例
 */
export function getMCPHub(): MCPHub | null {
  return hubInstance;
}

/**
 * 初始化 MCPHub
 * 在 server.ts 启动时调用
 */
export async function initMCPHub(builtInServerUrl?: string): Promise<MCPHub> {
  hubInstance = new MCPHub();
  await hubInstance.initialize(builtInServerUrl);
  return hubInstance;
}
