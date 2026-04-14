# Phase 9: 外部 MCP 服务集成设计

## 1. 背景与目标

### 现状
当前项目中 MCP 的使用方式是**内置的、固定的**：
- 只有 1 个 MCP Server（`mcp-server/index.ts`），部署在 CDE 容器中
- MCP Client（`src/lib/mcp/client.ts`）硬编码连接到 `localhost:3001`
- 内置 Skill（filesystem/terminal/git）的 `handler: "mcp"` 指向这个固定 MCP Server
- 无法动态接入第三方 MCP 服务

### 需求
1. **Skill 中调用外部 MCP 服务**：Skill 定义能声明使用某个外部 MCP Server 提供的工具
2. **用户输入自动路由到 MCP 工具**：Agent 根据 LLM 意图识别，自动调用已注册的外部 MCP 工具
3. **动态管理**：支持运行时增删 MCP Server 连接，无需重启

### 目标
- 将 MCP 从"1 个固定连接"升级为"N 个动态连接"
- 外部 MCP 工具与内置工具统一路由，对 LLM 透明
- 提供 UI 管理界面，用户可添加/删除/启停 MCP Server 连接

---

## 2. 架构设计

### 2.1 整体架构

```
                    Agent Orchestrator
                          │
                          ▼
                    Tool Executor (路由)
                     ┌────┼────┐
                     │    │    │
                Skill  MCP  Fallback
                Local  Hub  Local
                         │
                    ┌────┼────┐────┐
                    │    │    │    │
                 内置   外部1  外部2  外部N
                 MCP   MCP   MCP   MCP
                (CDE)  (DB)  (API) (...)
```

### 2.2 MCP Hub（核心新增）

`MCPHub` 是外部 MCP 服务的连接管理器，替代当前单个 `MCPClient`：

```typescript
// src/lib/mcp/hub.ts

interface MCPServerConfig {
  id: string;              // 唯一标识，如 "postgres-mcp"
  name: string;            // 显示名称，如 "PostgreSQL MCP"
  url: string;             // MCP Server URL，如 "http://localhost:5432/mcp"
  transport: "sse" | "streamable-http" | "stdio";  // 传输协议
  enabled: boolean;        // 是否启用
  headers?: Record<string, string>;  // 自定义请求头（如认证）
  tags?: string[];         // 标签分类
}

interface MCPServerConnection {
  config: MCPServerConfig;
  status: "disconnected" | "connecting" | "connected" | "error";
  tools: MCPToolInfo[];    // 从 MCP Server 动态获取的工具列表
  lastSyncAt: number;
  error?: string;
}

interface MCPToolInfo {
  name: string;            // 工具名（含 server 前缀，如 "postgres_query"）
  description: string;
  inputSchema: object;     // JSON Schema
  serverId: string;        // 所属 MCP Server ID
}
```

### 2.3 工具名命名规范

为避免不同 MCP Server 提供的同名工具冲突，采用**带前缀的命名**：

| 来源 | 工具名格式 | 示例 |
|------|-----------|------|
| 内置 MCP (CDE) | 原始名（无前缀） | `read_file`, `execute_bash` |
| 外部 MCP Server | `{serverId}__{toolName}` | `postgres__query`, `slack__send_message` |

前缀只在内部路由使用。注入 LLM 的工具描述中会包含友好名称，LLM 看到的是：
```json
{
  "name": "postgres__query",
  "description": "执行 PostgreSQL 查询 (来源: PostgreSQL MCP)",
  "parameters": { ... }
}
```

### 2.4 工具路由流程（改造后）

```
LLM 生成工具调用: postgres__query({sql: "SELECT 1"})
       │
       ▼
Orchestrator.onToolCall()
       │
       ▼
Tool Executor
  ├── 1. ask_user → 直接处理（orchestrator 拦截）
  ├── 2. write_file → Diff 确认流程（orchestrator 拦截）
  ├── 3. execute_bash → 安全拦截（orchestrator 拦截）
  ├── 4. Skill Local Handler → executor.ts
  ├── 5. MCP Hub → hub.executeTool(toolName, input)
  │     ├── 内置工具 → 内置 MCPClient (CDE)
  │     └── 外部工具 (含 __ 前缀) → 对应 MCPServerConnection
  └── 6. Local Fallback → 本地执行
```

---

## 3. 数据模型

### 3.1 MCP Server 配置持久化

```json
// data/mcp-servers.json
[
  {
    "id": "postgres-mcp",
    "name": "PostgreSQL MCP",
    "url": "http://localhost:5432/mcp",
    "transport": "sse",
    "enabled": true,
    "headers": {
      "Authorization": "Bearer xxx"
    },
    "tags": ["database"],
    "addedAt": 1713000000000
  }
]
```

### 3.2 Skill 类型扩展

```typescript
// src/lib/skill/types.ts 扩展

export interface SkillToolDefinition {
  name: string;
  description: string;
  parameters: { ... };
  handler: "local" | "mcp" | "external-mcp";  // 新增 external-mcp
  mcpTool?: string;
  mcpServerId?: string;  // 新增：指定使用哪个外部 MCP Server
}
```

当 `handler: "external-mcp"` 时，`mcpServerId` 指定目标 MCP Server，`mcpTool` 指定该 Server 上的工具名。

### 3.3 SKILL.md 扩展

```yaml
---
name: database-assistant
description: "数据库操作助手"
metadata:
  author: community
  version: "1.0"
mcp-servers:
  - id: postgres-mcp       # 引用已注册的 MCP Server
    tools: [query, schema]  # 使用该 Server 的哪些工具
---
```

---

## 4. 核心模块设计

### 4.1 MCP Hub（`src/lib/mcp/hub.ts`）

职责：
- 管理多个 MCP Server 连接的生命周期
- 动态发现和缓存各 Server 提供的工具
- 统一的路由接口 `executeTool(toolName, input)`
- 定期心跳检测和自动重连

```typescript
class MCPHub {
  private connections: Map<string, MCPServerConnection>;
  private builtInClient: MCPClient;  // 内置 CDE MCP

  // 初始化：加载配置，建立连接
  async initialize(): Promise<void>;

  // 添加外部 MCP Server
  async addServer(config: MCPServerConfig): Promise<MCPServerConnection>;

  // 移除 MCP Server
  async removeServer(serverId: string): Promise<void>;

  // 启用/禁用
  async toggleServer(serverId: string, enabled: boolean): Promise<void>;

  // 刷新某个 Server 的工具列表
  async refreshTools(serverId: string): Promise<MCPToolInfo[]>;

  // 路由工具调用（核心方法）
  async executeTool(toolName: string, input: Record<string, unknown>): Promise<ToolResult>;

  // 获取所有可用工具定义（注入 LLM）
  async getAllToolDefinitions(): Promise<SkillToolDefinition[]>;

  // 获取所有连接状态
  getConnectionStatuses(): MCPServerConnection[];

  // 心跳检测
  startHealthCheck(intervalMs?: number): void;
}
```

### 4.2 MCP Transport 适配层（`src/lib/mcp/transport.ts`）

支持多种 MCP 传输协议：

| 传输方式 | 适用场景 | 连接方式 |
|---------|---------|---------|
| SSE | 远程 HTTP 服务 | GET /sse 建立 SSE 连接，POST /messages 发送请求 |
| Streamable HTTP | 远程 HTTP 服务（新版 MCP） | 单 POST 请求，支持流式响应 |
| stdio | 本地子进程 | 启动子进程，stdin/stdout 通信 |

```typescript
interface MCPTransport {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  listTools(): Promise<MCPToolInfo[]>;
  callTool(name: string, args: Record<string, unknown>): Promise<ToolResult>;
  healthCheck(): Promise<boolean>;
}

class SSETransport implements MCPTransport { ... }
class StreamableHTTPTransport implements MCPTransport { ... }
class StdioTransport implements MCPTransport { ... }
```

### 4.3 Tool Executor 改造（`src/lib/agent/tool-executor.ts`）

```typescript
// 改造后的路由逻辑
export async function executeTool(
  toolName: string,
  input: Record<string, string>,
  workspacePath?: string
): Promise<ToolResult> {
  // 1. Skill 本地工具
  const skillResult = await executeSkillTool(toolName, input);
  if (skillResult) return skillResult;

  // 2. MCP Hub 统一路由（内置 + 外部）
  if (mcpHub) {
    const hubResult = await mcpHub.executeTool(toolName, input, workspacePath);
    if (hubResult) return hubResult;
  }

  // 3. Local Fallback
  return executeLocally(toolName, input, workspacePath);
}
```

### 4.4 Orchestrator 改造（`src/lib/agent/orchestrator.ts`）

```typescript
// getAllToolDefinitions — 增加外部 MCP 工具定义
private async getAllToolDefinitions() {
  const skillTools = await getEnabledSkillTools();
  const mcpTools = await mcpHub.getAllToolDefinitions();  // 新增
  return [...skillTools, ...mcpTools];
}
```

---

## 5. API 设计

### 5.1 REST API

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/mcp/servers` | 列出所有 MCP Server 配置及状态 |
| POST | `/api/mcp/servers` | 添加外部 MCP Server |
| DELETE | `/api/mcp/servers/{id}` | 删除 MCP Server |
| PATCH | `/api/mcp/servers/{id}` | 更新配置（启用/禁用/修改 URL 等） |
| POST | `/api/mcp/servers/{id}/refresh` | 刷新工具列表 |
| GET | `/api/mcp/servers/{id}/tools` | 获取该 Server 提供的工具列表 |
| GET | `/api/mcp/tools` | 获取所有已注册 MCP 工具（跨 Server） |

### 5.2 Socket.IO 事件

| 事件 | 方向 | 说明 |
|------|------|------|
| `mcp_server_status` | Server → Client | 推送 MCP Server 连接状态变化 |
| `mcp_tools_updated` | Server → Client | 推送工具列表变化通知 |

---

## 6. 前端设计

### 6.1 MCP 管理面板

在设置页面或独立页面中增加 MCP Server 管理区域：

```
┌─────────────────────────────────────────────┐
│ 🔌 MCP 服务管理                    [+ 添加]  │
├─────────────────────────────────────────────┤
│                                             │
│ ┌─────────────────────────────────────────┐ │
│ │ 🟢 PostgreSQL MCP            [编辑][删除] │ │
│ │ URL: http://localhost:5432/mcp          │ │
│ │ 传输: SSE | 工具: 5 个 | 标签: database  │ │
│ │ 上次同步: 2 分钟前                       │ │
│ └─────────────────────────────────────────┘ │
│                                             │
│ ┌─────────────────────────────────────────┐ │
│ │ 🔴 Slack MCP                 [编辑][删除] │ │
│ │ URL: http://slack-mcp:8080              │ │
│ │ 传输: Streamable HTTP | 错误: 连接超时    │ │
│ └─────────────────────────────────────────┘ │
└─────────────────────────────────────────────┘
```

### 6.2 添加 MCP Server 对话框

```
┌─ 添加 MCP 服务 ────────────────────────────┐
│                                             │
│ 服务名称:  [________________________]       │
│ 服务 ID:   [________________________]       │
│ URL:       [________________________]       │
│ 传输协议:  [SSE ▼]                          │
│                                             │
│ 认证头 (可选):                               │
│ Key: [__________] Value: [__________]       │
│                                [+ 添加头]    │
│                                             │
│ 标签: [__________]                          │
│                                             │
│            [测试连接]  [取消]  [添加]         │
└─────────────────────────────────────────────┘
```

### 6.3 MCP 状态指示器改造

现有状态指示器（🟢 MCP 已连接 / ⚪ 本地模式）扩展为多服务状态：

```
🔌 MCP: 🟢 CDE | 🟢 PostgreSQL | 🔴 Slack
```

---

## 7. 安全设计

### 7.1 连接安全
- URL 白名单：只允许 `http://` / `https://` 协议
- 认证头加密存储：headers 中的敏感信息（如 API Key）使用 AES 加密存储
- stdio 模式命令审计：记录子进程启动命令

### 7.2 工具调用安全
- 工具调用频率限制：每个 MCP Server 可配置 rate limit
- 输入校验：调用外部工具前，根据 `inputSchema` 校验参数
- 敏感操作拦截：外部 MCP 工具的调用结果中检测到危险内容时的处理策略

### 7.3 工具发现安全
- 工具描述审计：新发现的工具需要经过安全扫描才可注册
- Prompt 注入检测：扫描外部 MCP 工具描述中可能的 Prompt 注入

---

## 8. 向后兼容

| 场景 | 处理方式 |
|------|---------|
| 无外部 MCP 配置 | 行为与当前完全一致，`mcpHub` 只包含内置 CDE 连接 |
| 内置 Skill handler: "mcp" | 继续路由到内置 CDE MCP Server，无需修改 |
| 现有 MCPClient | 保留为 MCPHub 的内置连接，不删除 |
| data/skills.json 中的 Skill | 无需变更，`handler: "mcp"` 语义不变 |

---

## 9. 依赖与风险

### 9.1 新增依赖
| 包 | 用途 | 说明 |
|----|------|------|
| `@modelcontextprotocol/sdk` (已有) | MCP 客户端 SDK | 已安装，使用其 Client 类 |

### 9.2 风险
| 风险 | 缓解措施 |
|------|---------|
| 外部 MCP Server 不稳定 | 心跳检测 + 自动重连 + 降级路由 |
| 工具名冲突 | 命名空间前缀 `serverId__toolName` |
| LLM 上下文爆炸（工具数过多） | 按需加载：只注入已启用 MCP Server 的工具 |
| 外部工具返回恶意内容 | 结果过滤 + Prompt 注入检测 |

---

## 10. 与 Skill 系统的集成方式

### 方式 A：Skill 引用外部 MCP（推荐）

Skill 通过 `mcpServerId` 引用已注册的 MCP Server，不直接定义连接信息：

```typescript
// market.ts 中的 Skill 定义
{
  id: "database-assistant",
  tools: [{
    name: "db_query",
    description: "执行数据库查询",
    parameters: { ... },
    handler: "external-mcp",
    mcpServerId: "postgres-mcp",  // 引用已注册的 MCP Server
    mcpTool: "query",             // 该 Server 上的工具名
  }]
}
```

### 方式 B：SKILL.md 声明依赖

```yaml
---
name: database-assistant
mcp-servers:
  - id: postgres-mcp
    required: true   # 如果该 MCP Server 不可用，Skill 降级提示
---
```

### 方式 C：直接路由（无需 Skill）

用户添加 MCP Server 后，其工具自动注入 LLM 上下文，LLM 可直接调用。无需创建 Skill 做中间层。

**三种方式共存**，覆盖不同场景：
- 方式 A：适合需要 Prompt 引导 + 工具组合的复杂场景
- 方式 B：适合 SKILL.md 型纯 Prompt Skill
- 方式 C：适合简单工具调用，开箱即用
