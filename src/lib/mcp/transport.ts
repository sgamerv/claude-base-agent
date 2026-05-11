/**
 * MCP Transport 适配层
 * 支持 SSE 和 Streamable HTTP 两种传输协议
 * Phase 9A: 外部 MCP 服务集成
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import type { MCPTransport, MCPToolInfo, MCPToolResult } from "./types";

/**
 * SSE Transport
 * 使用 MCP SDK 的 Client + SSEClientTransport 连接远程 MCP Server
 */
export class SSETransport implements MCPTransport {
  private client: Client;
  private transport: SSEClientTransport | null = null;
  private url: string;
  private headers?: Record<string, string>;
  private connected = false;

  constructor(url: string, headers?: Record<string, string>) {
    this.url = url;
    this.headers = headers;
    this.client = new Client(
      { name: "cde-agent-hub", version: "1.0.0" },
      { capabilities: {} }
    );
  }

  async connect(): Promise<void> {
    // SSE 连接地址
    const sseUrl = this.url.endsWith("/sse") ? this.url : `${this.url}/sse`;
    const messageUrl = this.url.endsWith("/sse")
      ? sseUrl.replace("/sse", "/messages")
      : `${this.url}/messages`;

    this.transport = new SSEClientTransport(
      new URL(sseUrl),
      {
        // 自定义请求头
        requestInit: this.headers
          ? { headers: this.headers }
          : undefined,
      }
    );

    await this.client.connect(this.transport);
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    if (this.transport) {
      await this.client.close();
      this.transport = null;
      this.connected = false;
    }
  }

  async listTools(): Promise<MCPToolInfo[]> {
    if (!this.connected) {
      throw new Error("SSE Transport not connected");
    }
    const result = await this.client.listTools();
    return (result.tools || []).map((tool) => ({
      name: tool.name,
      originalName: tool.name,
      description: tool.description || "",
      inputSchema: (tool.inputSchema as Record<string, unknown>) || { type: "object", properties: {} },
      serverId: "", // 由 Hub 填充
    }));
  }

  async callTool(name: string, args: Record<string, unknown>, signal?: AbortSignal): Promise<MCPToolResult> {
    if (!this.connected) {
      return { success: false, content: "", error: "SSE Transport not connected" };
    }
    if (signal?.aborted) {
      return { success: false, content: "", error: "Aborted" };
    }
    try {
      const result = await this.client.callTool({ name, arguments: args });
      // 提取文本内容
      const content = Array.isArray(result.content)
        ? result.content
            .filter((c: any) => c.type === "text")
            .map((c: any) => c.text)
            .join("\n")
        : String(result.content || "");
      return { success: !result.isError, content, error: result.isError ? content : undefined };
    } catch (error) {
      if (signal?.aborted) {
        return { success: false, content: "", error: "Aborted" };
      }
      return {
        success: false,
        content: "",
        error: `MCP tool call failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  async healthCheck(): Promise<boolean> {
    if (!this.connected) return false;
    try {
      // 尝试 listTools 作为健康检查
      await this.client.listTools();
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * 简化 HTTP Transport
 * 兼容当前内置 MCP Server 的 /call 端点
 */
export class SimpleHTTPTransport implements MCPTransport {
  private url: string;
  private headers?: Record<string, string>;

  constructor(url: string, headers?: Record<string, string>) {
    this.url = url;
    this.headers = headers;
  }

  async connect(): Promise<void> {
    // HTTP 不需要持久连接，只需验证可达性
    const ok = await this.healthCheck();
    if (!ok) throw new Error(`Cannot connect to MCP Server at ${this.url}`);
  }

  async disconnect(): Promise<void> {
    // HTTP 无需断开
  }

  async listTools(): Promise<MCPToolInfo[]> {
    try {
      const response = await fetch(`${this.url}/tools`, {
        signal: AbortSignal.timeout(5000),
        headers: this.headers,
      });
      if (!response.ok) return [];
      const data = await response.json();
      return (data.tools || []).map((tool: any) => ({
        name: tool.name,
        originalName: tool.name,
        description: tool.description || "",
        inputSchema: tool.inputSchema || { type: "object", properties: {} },
        serverId: "",
      }));
    } catch {
      return [];
    }
  }

  async callTool(name: string, args: Record<string, unknown>, signal?: AbortSignal): Promise<MCPToolResult> {
    try {
      // 合并超时和中止信号
      const timeoutSignal = AbortSignal.timeout(30000);
      const combined = signal
        ? AbortSignal.any([timeoutSignal, signal])
        : timeoutSignal;

      const response = await fetch(`${this.url}/call`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...this.headers,
        },
        body: JSON.stringify({ tool: name, args }),
        signal: combined,
      });

      if (!response.ok) {
        return {
          success: false,
          content: "",
          error: `MCP Server returned ${response.status}`,
        };
      }

      const data = await response.json();
      return {
        success: true,
        content: data.content || data.text || JSON.stringify(data),
      };
    } catch (error) {
      if (signal?.aborted) {
        return { success: false, content: "", error: "Aborted" };
      }
      return {
        success: false,
        content: "",
        error: `MCP call failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(this.url, {
        signal: AbortSignal.timeout(3000),
        headers: this.headers,
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}

/**
 * Transport 工厂方法
 * 根据配置创建对应的 Transport 实例
 */
export function createTransport(
  transport: "sse" | "streamable-http" | "stdio",
  url: string,
  headers?: Record<string, string>
): MCPTransport {
  switch (transport) {
    case "sse":
      return new SSETransport(url, headers);
    case "streamable-http":
      // streamable-http 暂时使用 SimpleHTTPTransport
      // 后续可替换为 StreamableHTTPTransport
      return new SimpleHTTPTransport(url, headers);
    case "stdio":
      throw new Error("stdio transport not yet supported");
    default:
      return new SimpleHTTPTransport(url, headers);
  }
}
