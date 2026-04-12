/**
 * MCP Client — 控制平面侧
 * 连接到远程 CDE 容器中的 MCP Server，将工具调用转发执行
 *
 * Phase 2: 使用 HTTP 直接调用 MCP Server 的 REST 接口
 * 后续: 迁移到标准 MCP SSE 传输
 */

export interface MCPToolResult {
  success: boolean;
  content: string;
  error?: string;
}

export class MCPClient {
  private serverUrl: string;

  constructor(serverUrl: string = "http://localhost:3001") {
    this.serverUrl = serverUrl;
  }

  /**
   * 检查 MCP Server 是否可用
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(this.serverUrl, {
        signal: AbortSignal.timeout(3000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * 通过 MCP Server 执行工具
   * 使用简化的 HTTP 调用方式（Phase 2）
   */
  async executeTool(
    toolName: string,
    input: Record<string, string>
  ): Promise<MCPToolResult> {
    try {
      // 映射工具名称到 MCP Server 的工具名
      const mcpToolName = this.mapToolName(toolName);

      // 通过 SSE + JSON-RPC 调用 MCP Server
      // Phase 2 使用简化的直接 HTTP 调用
      const response = await fetch(`${this.serverUrl}/call`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tool: mcpToolName,
          args: input,
        }),
        signal: AbortSignal.timeout(30000),
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
      return {
        success: false,
        content: "",
        error: `MCP call failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * 映射 Agent 工具名到 MCP Server 工具名
   */
  private mapToolName(agentToolName: string): string {
    const mapping: Record<string, string> = {
      read_directory: "read_directory",
      read_file: "read_file",
      write_file: "write_file",
      execute_bash: "execute_command",
      list_files: "list_files",
      git_status: "git_status",
      git_diff: "git_diff",
    };
    return mapping[agentToolName] || agentToolName;
  }
}
