# Session 管理与沙箱隔离设计文档

> **日期**: 2026-04-11
> **状态**: 已确认，待实施

---

## 1. 概述

为 Cloud CDE Agent 增加 Session 管理功能，实现：
1. 首页可查看/进入/删除不同 session
2. 每个 session 拥有独立 workspace（目录级隔离），互不影响
3. 删除 session 时同步清理 workspace 和内存状态

## 2. 整体架构

```
┌─────────────────────────────────────────────────┐
│                   首页 (/)                        │
│  ┌───────────────────────────────────────────┐   │
│  │  Session 列表 (卡片式)                      │   │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐    │   │
│  │  │项目 A    │ │项目 B    │ │ + 新建   │    │   │
│  │  │3分钟前   │ │1小时前   │ │         │    │   │
│  │  │[💬][📝] │ │[💬][📝] │ │         │    │   │
│  │  │[🗑删除]  │ │[🗑删除]  │ │         │    │   │
│  │  └─────────┘ └─────────┘ └─────────┘    │   │
│  └───────────────────────────────────────────┘   │
└──────────────────────┬──────────────────────────┘
                       │ REST API
                       ▼
┌─────────────────────────────────────────────────┐
│              Session Manager (后端)               │
│  - CRUD: 创建/列表/删除 session                  │
│  - 持久化: data/sessions.json                    │
│  - Workspace: workspaces/{sessionId}/            │
│  - 清理: 删除 session 时递归删除 workspace 目录   │
└──────────────────────┬──────────────────────────┘
                       │
          ┌────────────┼────────────┐
          ▼            ▼            ▼
   ┌────────────┐ ┌─────────┐ ┌────────────┐
   │ workspaces/ │ │ Agent   │ │ Socket.io  │
   │ ├─ abc123/  │ │ History │ │ (实时通信)  │
   │ ├─ def456/  │ │ (内存)  │ │            │
   │ └─ ghi789/  │ │         │ │            │
   └────────────┘ └─────────┘ └────────────┘
```

## 3. 数据模型

```typescript
interface Session {
  id: string;            // 8位短ID (uuid v4 截取)
  name: string;          // 用户可编辑的名称，默认 "新会话"
  createdAt: number;     // 创建时间戳 (ms)
  lastActiveAt: number;  // 最后活跃时间戳 (ms)
  workspacePath: string; // 相对路径: workspaces/{id}
  entryMode: "chat" | "editor"; // 上次使用的入口
}
```

## 4. 存储布局

```
项目根目录/
├── data/
│   └── sessions.json        ← Session 元数据 (JSON 持久化)
├── workspaces/
│   ├── abc123de/             ← Session abc123de 的独立 workspace
│   │   └── ...              (Agent 的文件操作、bash 执行都在此目录下)
│   ├── fgh456ij/
│   │   └── ...
│   └── ...
├── src/                      ← 控制平面代码
├── mcp-server/
└── ...
```

- `data/sessions.json`: 数组形式存储所有 session 元数据
- `workspaces/{sessionId}/`: 每个 session 的隔离目录，Agent 执行文件操作和 bash 命令的工作目录

## 5. API 设计

### REST API (Next.js API Routes)

| 方法 | 路径 | 说明 | 请求体 | 响应 |
|------|------|------|--------|------|
| `GET` | `/api/sessions` | 列出所有 session | - | `{ sessions: Session[] }` |
| `POST` | `/api/sessions` | 创建新 session | `{ name?: string }` | `{ session: Session }` |
| `PATCH` | `/api/sessions/[id]` | 更新 session | `{ name?: string }` | `{ session: Session }` |
| `DELETE` | `/api/sessions/[id]` | 删除 session + 清理 workspace | - | `{ success: boolean }` |

### 创建 Session 流程

```
POST /api/sessions
    │
    ├── 1. 生成 8 位短 ID
    ├── 2. 创建 workspaces/{id}/ 目录
    ├── 3. 写入 sessions.json
    └── 4. 返回 Session 对象
```

### 删除 Session 流程

```
DELETE /api/sessions/{id}
    │
    ├── 1. 从 sessions.json 中移除
    ├── 2. 递归删除 workspaces/{id}/ 目录
    ├── 3. 清理内存中的 sessionHistories (LLM 对话历史)
    ├── 4. 清理内存中的前端消息缓存 (通知前端)
    └── 5. 返回成功
```

## 6. Workspace 路由机制

### 本地模式 (Fallback)

当前 `tool-executor.ts` 使用固定的 `PROJECT_ROOT`。改为按 session 路由：

```typescript
// 修改前
const PROJECT_ROOT = process.cwd();

// 修改后 — 每次工具执行根据 session 的 workspace 路径决定根目录
export async function executeTool(
  toolName: string,
  input: Record<string, string>,
  workspacePath?: string  // 新增
): Promise<ToolResult> {
  const root = workspacePath || PROJECT_ROOT;
  // 所有路径解析使用 root 替代 PROJECT_ROOT
}
```

### MCP 模式

MCP Server 的 `PROJECT_ROOT` 环境变量目前是固定的。需要支持多 workspace：

- 方案：在 MCP 的 `/call` 请求中增加 `workspacePath` 字段
- MCP Server 收到后，将 `workspacePath` 作为本次工具调用的根目录

## 7. 前端改动

### 首页重构 (`src/app/page.tsx`)

从"输入 ID 进入"改为"Session 列表管理"：

```
┌──────────────────────────────────────────────────┐
│  🤖 Cloud CDE Agent                              │
│  基于 GLM-5.1 的 AI 编程助手                      │
│                                                   │
│  ┌────────────────────────────────────────────┐   │
│  │  我的会话                          [+ 新建] │   │
│  ├────────────────────────────────────────────┤   │
│  │  📁 我的项目               3分钟前          │   │
│  │     [💬 聊天] [📝 编辑器] [🗑 删除]         │   │
│  ├────────────────────────────────────────────┤   │
│  │  📁 Bug 修复               1小时前         │   │
│  │     [💬 聊天] [📝 编辑器] [🗑 删除]         │   │
│  ├────────────────────────────────────────────┤   │
│  │  📁 重构实验               昨天            │   │
│  │     [💬 聊天] [📝 编辑器] [🗑 删除]         │   │
│  └────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────┘
```

### 交互细节

- **新建**: 点击后弹出行内输入框输入名称 → POST `/api/sessions` → 跳转到聊天页
- **进入**: 点击 💬 跳转 `/chat/{id}`，点击 📝 跳转 `/editor/{id}`
- **删除**: 点击 🗑 弹出确认 → DELETE `/api/sessions/{id}` → 列表刷新
- **重命名**: 双击名称可编辑 → PATCH `/api/sessions/{id}`
- **时间**: 显示相对时间 (3分钟前 / 1小时前 / 昨天)

## 8. 新增文件清单

| 文件 | 说明 |
|------|------|
| `src/lib/session/manager.ts` | Session CRUD 逻辑，JSON 读写，workspace 管理 |
| `src/app/api/sessions/route.ts` | GET (列表) + POST (创建) |
| `src/app/api/sessions/[id]/route.ts` | PATCH (更新) + DELETE (删除) |

## 9. 修改文件清单

| 文件 | 改动 |
|------|------|
| `src/app/page.tsx` | 首页重构为 Session 列表 |
| `src/lib/agent/tool-executor.ts` | `executeTool` 增加 `workspacePath` 参数 |
| `src/lib/agent/orchestrator.ts` | 传递 `workspacePath` 给 `executeTool` |
| `src/lib/socket/server.ts` | 创建 session 时关联 workspace，删除时清理 |
| `src/lib/store/session-store.ts` | 增加 `clearSession` 清理全局 Map |
| `.gitignore` | 忽略 `data/sessions.json` 和 `workspaces/` |
| `mcp-server/index.ts` | 支持 `workspacePath` 参数路由 |

## 10. 隔离级别演进路径

| 阶段 | 隔离方式 | 说明 |
|------|---------|------|
| **Phase 4 (当前)** | 目录级隔离 | 同一进程，不同工作目录，共享 MCP Server |
| **Phase 5** | 容器级隔离 | 每个 session 启动独立 Docker 容器，独立 MCP Server 进程 |
| **Phase 6** | K8s Pod 隔离 | 生产级部署，资源限制，自动扩缩容 |
