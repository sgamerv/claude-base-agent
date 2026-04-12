# AI-Powered 远程协作开发平台 (Cloud CDE Agent) 设计文档

> **版本**: v1.7  
> **日期**: 2026-04-12  
> **状态**: Phase 6 完成  
> **变更记录**: v1.7 — Phase 6 人机协作工作流开发完成（Diff 预览 + Accept/Reject + 双入口跳转）

---

## 1. 项目概述

本系统旨在构建一个基于 Web 的远程协作开发平台。用户通过浏览器访问云端开发环境 (CDE)，与一个具备自主行动能力 (Agentic) 的 AI 伙伴协同编程。

### 1.1 核心定位

| 维度 | 说明 |
|------|------|
| **产品形态** | Web 端远程协作平台（连接到云端开发环境） |
| **核心能力** | AI Agent + 实时协作 + 云端执行 |
| **技术基座** | Claude Agent SDK + MCP + LSP |
| **目标用户** | 需要远程协作开发团队、云端编程场景的开发者 |

### 1.2 与传统 AI 编程工具的差异

| 特性 | 本平台 (Agentic CDE) | 普通 AI 插件 (IDE) |
|------|----------------------|---------------------|
| **主动性** | Agentic (代理式)：自主运行测试、根据报错反复迭代 | 辅助式：提供建议，由用户手动运行和修改 |
| **环境访问** | 深度访问终端、文件系统和外部工具 | 主要局限于编辑器内的文本编辑 |
| **工作流** | 一站式解决，终端-编辑器-AI 无缝切换 | 边写边看的视觉化开发 |
| **协作能力** | 多用户 + AI 实时协作，CRDT 冲突解决 | 单用户为主 |

---

## 2. 系统架构

系统采用**三层解耦**架构，确保 AI 推理逻辑、权限控制与物理执行环境的安全隔离。

### 2.1 整体架构图

```
┌─────────────────────────────────────────────────────────────────────────┐
│                       前端表现层 (Client Side) — 双入口                    │
│                                                                         │
│  ┌────────────────────────────┐  ┌──────────────────────────────────┐  │
│  │  入口 A: 代码编辑器         │  │  入口 B: 聊天界面                 │  │
│  │  /editor/:sessionId        │  │  /chat/:sessionId                │  │
│  │  ├─ Monaco Editor + Yjs    │  │  ├─ 对话消息流 (SSE 流式)        │  │
│  │  ├─ Xterm.js 终端          │  │  ├─ 工具调用详情 (可折叠)        │  │
│  │  ├─ 文件树                  │  │  ├─ ask_user 提问/选项           │  │
│  │  ├─ AI 操作面板 (侧栏)      │  │  ├─ Diff 摘要卡片               │  │
│  │  └─ Diff 预览 + 审批       │  │  └─ 文件引用 (@file) + 输入区    │  │
│  └─────────────┬──────────────┘  └───────────────┬──────────────────┘  │
│                │          共享状态层               │                      │
│   ┌────────────┴──────────────────────────────────┴──────────────────┐ │
│   │  Session Store │ CRDT Store │ Notification Store │ Auth Store    │ │
│   └────────────────────────────────┬────────────────────────────────┘ │
│                                    │                                   │
│                              WebSocket / SSE                           │
└────────────────────────────────────┬──────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     控制平面 (Control Plane)                         │
│                                                                     │
│  ┌─────────────────┐  ┌─────────────────┐  ┌────────────────────┐ │
│  │ Agent 编排引擎    │  │ 安全护栏 & RBAC   │  │ 协作状态同步器      │ │
│  │ (Claude Agent    │  │ (Guardrails &    │  │ (Session & Sync    │ │
│  │  SDK)            │  │  Permission)     │  │  Manager)          │ │
│  └────────┬────────┘  └────────┬────────┘  └────────┬───────────┘ │
│           │                    │                     │              │
│  ┌────────┴────────────────────┴─────────────────────┴───────────┐ │
│  │              MCP Client (工具代理 & 远程桥接)                    │ │
│  └──────────────────────────┬────────────────────────────────────┘ │
│                              │                                      │
│             HTTPS (Anthropic API) ↑↓                                │
│             MCP over JSON-RPC      ↑↓                               │
│             WebSockets (Socket.io) ↑↓                               │
└──────────────────────────────────┬──────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│                   执行平面 (Data Plane / CDE)                        │
│                    (隔离的 Docker 容器)                               │
│                                                                     │
│  ┌─────────────────┐  ┌─────────────────┐  ┌────────────────────┐ │
│  │  MCP Server      │  │  LSP Server      │  │  实时同步器         │ │
│  │  ├─ Filesystem   │  │  ├─ Go-to-Def    │  │  (文件变动 →        │ │
│  │  ├─ Terminal     │  │  ├─ Find-Ref     │  │   前端 & 控制平面)  │ │
│  │  └─ Git Tools    │  │  └─ Diagnostics  │  │                    │ │
│  └─────────────────┘  └─────────────────┘  └────────────────────┘ │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 2.2 层级职责

| 层级 | 技术栈 | 核心职责 |
|------|--------|----------|
| **前端 (Client)** | React + Tailwind + Monaco Editor + Xterm.js | **双入口架构**：代码编辑器入口 (IDE 工作流) + 聊天入口 (对话驱动工作流)，共享 Agent 会话与协作状态 |
| **控制平面 (Control Plane)** | Node.js (TypeScript) + Claude Agent SDK | 运行 Agent 循环，管理会话状态，安全拦截，转发用户指令 |
| **执行平面 (Data Plane)** | Docker / Kubernetes (CDE) | 真正的远程环境，运行代码、测试，通过 MCP 暴露接口给 Agent |

### 2.3 关键数据流

| 场景 | 数据流路径 |
|------|-----------|
| 用户提问 | 用户 → 前端 → 控制平面 (Claude SDK) → 生成工具调用指令 |
| 执行工具 | 控制平面 → 远程 CDE (MCP Server) → 执行 Shell / 修改文件 |
| 结果反馈 | MCP Server → 控制平面 → 前端 (流式展示日志) |
| 多人协作 | 用户 A 修改 → Yjs 广播 → 用户 B & AI Agent 同步更新 |
| 人机确认 | 控制平面检测敏感操作 → 前端弹出审批 → 用户点击 → 控制平面继续循环 |

---

## 3. 控制平面核心设计

控制平面是整个系统的中枢，由五个关键模块组成。

### 3.1 模块架构

```
控制平面 (Control Plane)
│
├── 1. Agent 编排引擎 (Agent Orchestrator)
│   ├── 调用 Claude Agent SDK，维护对话上下文快照
│   ├── 管理 Prompt Caching，降低 Token 成本
│   └── 实现 Plan-Act-Observe 代理循环
│
├── 2. MCP 客户端 (Tool Proxy & MCP Client)
│   ├── 将 Claude 生成的 JSON 指令转发给远程 CDE
│   ├── 将执行结果反馈给模型
│   └── 物理隔离：Agent 只能破坏临时容器，无法触及控制平面
│
├── 3. 安全护栏 (Security Guardrails & RBAC)
│   ├── 命令黑名单拦截
│   ├── 策略引擎 (如：rm -rf 触发审批)
│   └── 人机协作 (HITL) 审批工作流
│
├── 4. 协作状态同步器 (Session & Sync Manager)
│   ├── WebSocket 连接管理 (Socket.io)
│   ├── Yjs CRDT 后端逻辑
│   └── Agent 修改实时广播给房间内所有用户
│
└── 5. LSP 上下文管理器
    ├── 按需读取：仅在 Agent 调用 read_file 时抓取文件内容
    ├── 符号索引：只将文件目录结构发给 Agent
    └── 精准上下文：通过 LSP 获取相关代码片段，减少 Token 消耗

└── 6. Skill 引擎 (Skill Engine)
    ├── Skill Registry: 注册表，管理已安装 Skill 的元数据与工具定义
    ├── 动态工具注入: 将 Skill 的工具定义合并到 LLM 的 tools 参数中
    ├── 安装/卸载: API 驱动的 Skill 生命周期管理
    └── Skill 执行路由: 将 LLM 发起的 Skill 工具调用分发到对应处理器
```

### 3.2 Agent 执行循环 (Agentic Loop)

核心流程采用 **Plan-Act-Observe** 模式：

```
用户 Prompt
    │
    ▼
┌──────────────┐
│  Plan (规划)  │ ← Agent 分析任务，决定使用哪些工具
└──────┬───────┘
       │
       ▼
┌──────────────┐
│  Act (执行)   │ ← 调用工具 (read_file / execute_bash / ask_user)
└──────┬───────┘
       │
       ▼
┌──────────────┐
│ Observe (观察) │ ← 获取工具结果（成功/失败/报错）
└──────┬───────┘
       │
       ├── 任务未完成 → 回到 Plan
       ├── 需要用户输入 → 挂起等待 (ask_user)
       └── 任务完成 → 返回最终结果
```

### 3.3 核心代码架构

```typescript
import { Anthropic } from '@anthropic-ai/sdk';
import { Server as SocketServer } from 'socket.io';

// --- 安全策略定义 ---
const DANGEROUS_COMMANDS = ['rm -rf', 'format', 'chmod', 'chown'];

function isCommandSafe(command: string): boolean {
  return !DANGEROUS_COMMANDS.some(cmd => command.includes(cmd));
}

// --- 控制平面核心类 ---
export class ControlPlane {
  private anthropic: Anthropic;
  private io: SocketServer;
  private pendingRequests = new Map<string, (response: string) => void>();

  constructor(apiKey: string, io: SocketServer) {
    this.anthropic = new Anthropic({ apiKey });
    this.io = io;
    this.registerSocketHandlers();
  }

  /**
   * 处理来自前端的任务请求 — 核心代理循环
   */
  async handleUserTask(sessionId: string, userPrompt: string) {
    const socket = this.io.to(sessionId);

    let messages: Anthropic.MessageParam[] = [
      { role: 'user', content: userPrompt }
    ];

    let iterations = 0;
    const MAX_ITERATIONS = 10; // 防止死循环

    try {
      while (iterations < MAX_ITERATIONS) {
        iterations++;

        // 调用 Claude Agent (带 Tool Use 能力)
        const response = await this.anthropic.messages.create({
          model: "claude-3-5-sonnet-20241022",
          max_tokens: 4096,
          messages,
          tools: this.getToolDefinitions()
        });

        messages.push({ role: 'assistant', content: response.content });

        // 检查 AI 是否需要调用工具
        const toolCall = response.content.find(c => c.type === 'tool_use') as any;

        if (!toolCall) {
          // 无工具调用 → 任务完成
          socket.emit('agent_response', response.content[0]);
          break;
        }

        // 安全拦截 + 执行工具
        const result = await this.executeToolWithSafety(sessionId, toolCall);

        // 将工具结果回填到上下文，继续循环
        messages.push({
          role: 'user',
          content: [{
            type: 'tool_result',
            tool_use_id: toolCall.id,
            content: result
          }]
        });

        socket.emit('agent_status', { action: toolCall.name, status: 'completed' });
      }
    } catch (error) {
      socket.emit('error', 'Agent 思考循环中断');
    }
  }

  /**
   * 工具定义集合
   */
  private getToolDefinitions(): Anthropic.Tool[] {
    return [
      {
        name: "execute_bash",
        description: "在远程 CDE 环境执行 shell 命令",
        input_schema: {
          type: "object",
          properties: { command: { type: "string" } },
          required: ["command"]
        }
      },
      {
        name: "read_file",
        description: "读取远程代码文件",
        input_schema: {
          type: "object",
          properties: { path: { type: "string" } },
          required: ["path"]
        }
      },
      {
        name: "ask_user",
        description: "当需要用户提供额外信息、做决定或确认方案时调用此工具",
        input_schema: {
          type: "object",
          properties: {
            question: { type: "string", description: "向用户提出的具体问题" }
          },
          required: ["question"]
        }
      }
    ];
  }

  /**
   * 安全拦截与远程 CDE 执行桥接
   */
  private async executeToolWithSafety(sessionId: string, toolCall: any): Promise<string> {
    const { name, input, id } = toolCall;

    if (name === 'execute_bash') {
      if (!isCommandSafe(input.command)) {
        // 触发 HITL — 人机审批
        this.io.to(sessionId).emit('approval_required', {
          id, command: input.command
        });
        return "ERROR: Command blocked by security policy. Waiting for user approval.";
      }
      return await this.callRemoteCDE(sessionId, 'bash', input.command);
    }

    if (name === 'read_file') {
      return await this.callRemoteCDE(sessionId, 'fs_read', input.path);
    }

    if (name === 'ask_user') {
      // 向前端推送问题
      this.io.to(sessionId).emit('agent_needs_input', {
        id, question: input.question
      });
      // 挂起循环，等待用户回复
      return new Promise((resolve) => {
        this.pendingRequests.set(id, resolve);
      });
    }

    return "Unknown tool";
  }

  /**
   * 注册前端 Socket 事件处理器
   */
  private registerSocketHandlers() {
    this.io.on('connection', (socket) => {
      // 用户回复 Agent 的提问
      socket.on('user_reply', ({ requestId, answer }) => {
        const resolve = this.pendingRequests.get(requestId);
        if (resolve) {
          resolve(answer);
          this.pendingRequests.delete(requestId);
        }
      });
    });
  }

  /**
   * 与远程 CDE 容器通信 (MCP over JSON-RPC)
   */
  private async callRemoteCDE(sessionId: string, type: string, payload: any): Promise<string> {
    // 实际场景中通过 gRPC 或 WebSocket 连接到 Docker 容器内的 MCP Server
    console.log(`[CDE ${sessionId}] Executing ${type}: ${payload}`);
    return `Output of ${type} for ${payload}`;
  }
}
```

### 3.4 关键设计：动态人机协作 (ask_user)

在复杂的 Agent 工作流中，AI 经常需要在执行过程中向用户获取输入。系统通过 **Promise 挂起机制** 实现这一能力：

```
Agent 发现问题
    │
    ▼
调用 ask_user 工具
    │
    ▼
控制平面拦截 → 暂停循环
    │
    ├── 在 Map 中存储 resolve 函数 (key: tool_use_id)
    └── 通过 WebSocket 向前端推送 agent_needs_input 事件
    │
    ▼
前端弹出交互组件 (气泡/输入框/选项按钮)
    │
    ▼
用户输入答案 → 前端发送 user_reply 事件
    │
    ▼
控制平面触发 resolve → Agent 循环携带用户回复继续运行
```

**为什么选择"工具化挂起"而非"终止并重启"：**

| 方案 | 逻辑 | 优缺点 |
|------|------|--------|
| 终止并重启 | 强制结束当前任务，让用户发新指令 | **差**：Agent 丢失执行中间状态，浪费 Token |
| 工具化挂起 (推荐) | 将用户视为一个外部 API | **优**：保持 Agent 思考连续性，拿到结果后自然继续 |

---

## 4. 关键技术能力

### 4.1 LSP (Language Server Protocol)

**全称**: Language Server Protocol（语言服务器协议）

**来源**: 微软、Red Hat 和 Codenvy 联合推出，基于 JSON-RPC 的通信协议。

**核心价值**: 解决编辑器与语言支持的 M×N 问题 → M 个编辑器 × N 种语言只需 M+N 套实现。

**为 Agent 提供的能力：**

| 能力 | 说明 | Agent 应用场景 |
|------|------|---------------|
| 跳转到定义 (Go to Definition) | 精确定位变量/函数的声明位置 | Agent 修改代码时找到真正的定义处 |
| 查找引用 (Find References) | 找出函数在整个项目中的调用点 | 重构前评估影响范围 |
| 静态诊断 (Diagnostics) | 运行前发现语法错误、类型冲突 | 验证 AI 生成代码的正确性，无需运行测试 |
| 符号搜索 (Symbol Search) | 快速列出文件中的类、方法、变量 | 在大型代码库中快速导航 |

**在架构中的集成方式：**

```
控制平面 (LSP Client)          CDE 容器 (LSP Server)
        │                              │
        │  "user.save() 在哪定义的？"     │
        │ ────────────────────────────→ │
        │                              │
        │  "src/models/user.ts:42"      │
        │ ←──────────────────────────── │
```

**常用 Language Server：**

| 语言 | Language Server |
|------|----------------|
| Python | Pyright (Microsoft) |
| TypeScript/JS | vtsls / typescript-language-server |
| Rust | rust-analyzer |
| Go | gopls |

### 4.2 MCP (Model Context Protocol)

**作用**: 标准化 Agent 操作外部世界的接口，像"插拔外挂"一样连接外部数据。

**在本架构中的角色：**

```
控制平面
   │
   │  MCP over JSON-RPC (远程)
   │
   ▼
CDE 容器内的 MCP Server
   ├── Filesystem Tool ─── 原子级文件读写
   ├── Terminal Tool ────── 封装系统 Shell
   ├── Git Tool ────────── 版本控制操作
   └── (可扩展) ────────── 连接 GitHub、Jira、数据库等
```

### 4.3 上下文管理策略

面对大规模代码库，不能将所有代码塞入 Token 窗口，需采用以下策略：

| 策略 | 说明 |
|------|------|
| **文件树索引** | 仅将目录结构发送给 Agent，而非全部文件内容 |
| **按需读取** | Agent 调用 `read_file` 时才从远程 CDE 抓取具体内容 |
| **LSP 增强** | 通过 LSP 预先分析代码依赖，只推送相关的代码片段给 Agent |
| **Prompt Caching** | 利用 Anthropic 的 Prompt Caching 减少重复读取的成本 |

---

## 5. 前端 UI 设计 — 双入口架构

前端采用**双入口 (Dual-Entry)** 架构，代码编辑器与聊天界面作为两个独立的主入口，各自拥有完整的布局和交互范式，同时共享 Agent 能力与协作状态。

### 5.1 架构总览

```
┌──────────────────────────────────────────────────────────────────────────┐
│                          前端应用 (React SPA)                             │
│                                                                          │
│   ┌─────────────────────────┐     ┌─────────────────────────────────┐   │
│   │   入口 A: 代码编辑器     │     │   入口 B: 聊天界面               │   │
│   │   /editor/:sessionId    │     │   /chat/:sessionId              │   │
│   │                         │     │                                 │   │
│   │  ┌───────────────────┐  │     │  ┌───────────────────────────┐  │   │
│   │  │ Monaco Editor     │  │     │  │ 对话消息流                 │  │   │
│   │  │ + Yjs (CRDT)      │  │     │  │ ├─ 用户消息               │  │   │
│   │  └───────────────────┘  │     │  │ ├─ Agent 思考过程 (SSE)    │  │   │
│   │  ┌───────────────────┐  │     │  │ ├─ 工具调用详情            │  │   │
│   │  │ Xterm.js 终端      │  │     │  │ └─ 最终回复               │  │   │
│   │  └───────────────────┘  │     │  └───────────────────────────┘  │   │
│   │  ┌───────────────────┐  │     │  ┌───────────────────────────┐  │   │
│   │  │ 文件树 (侧栏)      │  │     │  │ 交互组件                  │  │   │
│   │  └───────────────────┘  │     │  │ ├─ ask_user 提问气泡       │  │   │
│   │  ┌───────────────────┐  │     │  │ ├─ 选项按钮 (A/B 方案)     │  │   │
│   │  │ AI 操作面板        │  │     │  │ └─ 自由输入框              │  │   │
│   │  │ ├─ Diff 预览      │  │     │  └───────────────────────────┘  │   │
│   │  │ ├─ 审批按钮       │  │     │  ┌───────────────────────────┐  │   │
│   │  │ └─ 快捷指令       │  │     │  │ 输入区                    │  │   │
│   │  └───────────────────┘  │     │  │ ├─ 多行输入框              │  │   │
│   │                         │     │  │ ├─ 附件上传 (@file)        │  │   │
│   │                         │     │  │ └─ 发送按钮                │  │   │
│   └────────────┬────────────┘     │  └───────────────────────────┘  │   │
│                │                  └──────────────┬──────────────────┘   │
│                │                                  │                      │
│   ┌────────────┴──────────────────────────────────┴──────────────────┐  │
│   │                    共享状态层 (Shared Store)                       │  │
│   │  ├─ 会话状态 (Session Store) ─── 会话 ID、Agent 运行状态          │  │
│   │  ├─ 协作状态 (CRDT Store) ────── Yjs Doc、文件变更同步           │  │
│   │  ├─ 通知中心 (Notification) ──── 审批请求、Agent 提问、错误告警   │  │
│   │  └─ 用户信息 (Auth Store) ────── 用户身份、权限角色               │  │
│   └─────────────────────────────────────────────────────────────────┘  │
│                                 │                                       │
│                          WebSocket / SSE                                │
└─────────────────────────────────┬──────────────────────────────────────┘
                                  │
                                  ▼
                         控制平面 (Control Plane)
```

### 5.2 入口 A: 代码编辑器界面 (`/editor/:sessionId`)

面向**以代码为中心**的工作流，用户在编辑器中编写代码，按需调用 Agent 辅助。

#### 布局结构

```
┌─────────────────────────────────────────────────────────────┐
│  顶部工具栏: [文件] [编辑] [视图] [终端] [Git]    [协作头像] │
├──────┬──────────────────────────────────┬───────────────────┤
│      │                                  │                   │
│ 文件 │     Monaco Editor                │  AI 操作面板       │
│ 树   │     (主编辑区)                    │  (可折叠侧栏)      │
│      │                                  │                   │
│      │                                  │  ├─ Inline Chat   │
│      │                                  │  ├─ Diff 预览     │
│      │                                  │  ├─ 审批按钮      │
│      │                                  │  └─ 快捷指令      │
│      │                                  │                   │
├──────┴──────────────────────────────────┴───────────────────┤
│  底部面板: [终端 Xterm.js] [问题] [输出]    Agent 状态指示器  │
└─────────────────────────────────────────────────────────────┘
```

#### 核心组件

| 组件 | 技术实现 | 职责 |
|------|---------|------|
| Monaco Editor | Monaco Editor + Yjs (CRDT) | 多用户与 AI 实时协作编辑，冲突自动解决 |
| 文件树 | 自定义 Tree 组件 | 展示远程 CDE 文件目录结构，支持点击打开文件 |
| 终端面板 | Xterm.js + WebSocket | 实时透传远程容器的 Shell I/O |
| AI 操作面板 | 侧栏组件 (可折叠) | Inline Chat、Diff 预览、审批按钮、快捷指令 |
| Diff 预览 | Monaco Diff Editor | Agent 修改代码后展示差异视图，需用户点击 Accept 才写入 |
| 审批按钮 | Accept / Reject | HITL 人机确认，审批 Agent 的代码修改和敏感操作 |
| 状态指示器 | 底部状态栏 | 显示 Agent 当前状态（思考中 / 执行中 / 等待确认） |

#### 交互流程

```
用户在编辑器中编写代码
    │
    │
    ├── 快捷指令面板 → "/fix" "/refactor" "/test" → Agent 执行
    │       │
    │       └── Agent 修改 → 右侧面板展示 Diff → Accept/Reject
    │
    ├── Agent 主动修改 → 编辑器中高亮变更区域 → 状态栏提示 "1 个修改待确认"
    │       │
    │       └── 用户点击 → Diff 视图 → Accept/Reject
    │
    └── Agent 需要输入 → 编辑器上方浮现提问气泡 → 用户回复 → Agent 继续
```

### 5.3 入口 B: 聊天界面 (`/chat/:sessionId`)

面向**以对话为中心**的工作流，用户通过自然语言驱动 Agent 完成任务，代码变更是对话的"产出物"。

#### 布局结构

```
┌─────────────────────────────────────────────────────────────┐
│  顶部栏: [会话标题] [Agent 状态] [跳转编辑器 →] [协作头像]    │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  对话消息流                                                  │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ 🤖 Agent: 我来帮你分析这个项目的结构...                │   │
│  │    📎 工具调用: read_file("src/index.ts")             │   │
│  │    📎 工具结果: 文件内容 (可折叠)                      │   │
│  │    ✅ 分析完成，项目使用 Next.js 框架...               │   │
│  └─────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ 🤖 Agent: 我建议将 API 调用重构为以下方式，            │   │
│  │    你倾向哪个方案？                                    │   │
│  │    [方案 A: Fetch API]  [方案 B: Axios 实例]          │   │
│  └─────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ 🤖 Agent: 修改已完成，以下是变更摘要：                  │   │
│  │    📄 Diff: src/api.ts (+12 -5)                      │   │
│  │    📄 Diff: src/utils.ts (+3 -1)                     │   │
│  │    [查看完整 Diff]  [Accept All]  [Reject]            │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│  输入区                                                     │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ [@file 引用文件]  [输入消息...]               [发送]  │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

#### 核心组件

| 组件 | 技术实现 | 职责 |
|------|---------|------|
| 对话消息流 | 自定义 Chat 组件 | 展示完整对话历史，支持消息分组、时间线 |
| Agent 思考展示 | SSE 流式渲染 | 实时展示 Claude 的推理过程，打字机效果 |
| 工具调用详情 | 可折叠卡片 | 展示 `read_file`、`execute_bash` 等工具的调用参数和结果 |
| ask_user 提问 | 气泡式交互 | `ask_user` 触发时在对话流中插入提问组件 |
| 选项按钮 | Button Group | AI 提供多方案选择时，渲染为可点击按钮 |
| Diff 摘要卡片 | 内嵌 Diff 组件 | Agent 修改文件后在消息流中展示 Diff 摘要和 Accept/Reject 操作 |
| 文件引用 (@file) | Mention 组件 | 用户可在输入中 `@file` 引用特定文件，自动注入为上下文 |
| 输入区 | 多行输入框 | 支持多行文本、Shift+Enter 换行、附件上传 |
| 跳转编辑器 | 导航按钮 | 点击后跳转到代码编辑器入口，保持同一会话状态 |

#### 交互流程

```
用户在输入框发送消息
    │
    ├── 对话流展示 Agent 思考过程 (SSE 流式)
    │
    ├── Agent 调用工具 → 对话流中展示工具调用卡片 (可折叠)
    │       │
    │       └── 工具结果返回 → 自动折叠 → Agent 继续思考
    │
    ├── Agent 提出问题 → 对话流中插入提问气泡 / 选项按钮
    │       │
    │       └── 用户点击选项或输入回复 → Agent 继续执行
    │
    ├── Agent 生成代码修改 → 对话流中展示 Diff 摘要卡片
    │       │
    │       ├── Accept → 写入远程 CDE → 显示 "已应用"
    │       └── Reject → Agent 收到拒绝信号 → 可重新生成
    │
    └── 任务完成 → Agent 给出总结 → 用户可继续追问或跳转编辑器查看结果
```

### 5.4 双入口协同机制

两个入口虽然界面分离，但共享同一 Agent 会话与协作状态，确保无缝切换。

#### 状态共享

| 共享状态 | 存储位置 | 同步方式 | 说明 |
|---------|---------|---------|------|
| 会话 ID | URL 参数 + Session Store | 路由级 | 两个入口通过相同的 `sessionId` 绑定同一 Agent 会话 |
| Agent 运行状态 | Session Store | WebSocket | 任一入口发起的任务，另一入口实时感知状态 |
| 文件变更 | CRDT Store (Yjs) | WebSocket | 聊天入口中 Accept 的修改，编辑器入口实时同步 |
| 通知事件 | Notification Store | WebSocket | 审批请求、Agent 提问在两个入口均会弹出 |
| 对话历史 | Session Store | API | 编辑器入口的 Inline Chat 记录也出现在聊天入口 |

#### 入口间跳转

```
编辑器 → 聊天:  点击顶部 "打开聊天" 按钮 → /chat/:sessionId
聊天 → 编辑器:  点击顶部 "打开编辑器" 按钮 → /editor/:sessionId
Diff 跳转:      聊天中点击 Diff 卡片的 "在编辑器中查看" → /editor/:sessionId?diff=file.ts
```

#### 场景化使用建议

| 场景 | 推荐入口 | 原因 |
|------|---------|------|
| 编写/调试代码 | 代码编辑器 | 需要完整的 IDE 能力，AI 作为辅助 |
| 大规模重构 | 聊天界面 | 用自然语言描述重构目标，Agent 自主执行 |
| 代码审查 | 聊天界面 | 对话式审查，逐步追问和修改 |
| 快速修复 Bug | 代码编辑器 | 选中代码直接 Inline Chat |
| 项目初始化 | 聊天界面 | 从零开始，对话驱动脚手架生成 |
| 学习理解代码 | 聊天界面 | 问答式探索，Agent 逐步解释 |

### 5.5 前端路由设计

```
/                           → 入口选择页 (或默认重定向到 /chat)
/chat                       → 新建聊天会话
/chat/:sessionId            → 聊天界面入口
/editor/:sessionId          → 代码编辑器入口
/editor/:sessionId?diff=:file → 编辑器入口，自动打开指定文件的 Diff 视图
/settings                   → 用户设置
```

### 5.6 通知与打断机制

两个入口共享同一通知管道，确保用户不会错过 Agent 的交互请求：

```
Agent 发出事件
    │
    ├── 事件类型: ask_user
    │   ├── 当前在聊天入口 → 对话流中插入提问气泡
    │   └── 当前在编辑器入口 → 编辑器上方浮现提问气泡 + 状态栏闪烁
    │
    ├── 事件类型: approval_required
    │   ├── 当前在聊天入口 → 对话流中插入审批卡片
    │   └── 当前在编辑器入口 → 右侧 AI 面板弹出审批按钮 + 状态栏提示
    │
    ├── 事件类型: file_changed (Agent 修改了文件)
    │   ├── 当前在聊天入口 → 对话流中展示 Diff 摘要
    │   └── 当前在编辑器入口 → 编辑器高亮变更区域 + 状态栏 "N 个修改待确认"
    │
    └── 事件类型: task_completed
        ├── 当前在聊天入口 → 对话流中展示完成摘要
        └── 当前在编辑器入口 → 状态栏显示 "Agent 已完成任务" + 通知提示
```

---

## 6. Skill 系统设计

Skill 是 Agent 能力的可插拔扩展单元。每个 Skill 封装了一组相关工具（Tool）和对应的 Prompt 增强，可独立安装、卸载，LLM 在运行时自动发现已安装 Skill 的工具并按需调用。

### 6.1 核心概念

| 概念 | 说明 |
|------|------|
| **Skill** | 一个能力扩展包，包含元数据、工具定义、Prompt 片段和执行处理器 |
| **Skill Registry** | 全局注册表，管理所有已安装 Skill 的元数据，持久化到 `data/skills.json` |
| **内置 Skill** | 系统预装的基础能力（文件系统、终端、Git），不可卸载 |
| **扩展 Skill** | 用户安装的第三方能力，可安装/卸载 |
| **Tool** | Skill 暴露给 LLM 的最小能力单元，包含 name、description、parameters schema |

### 6.2 Skill 数据模型

```typescript
interface Skill {
  id: string;                     // 唯一标识，如 "web-search"
  name: string;                   // 显示名称，如 "Web Search"
  description: string;            // 简短描述
  icon: string;                   // emoji 图标
  version: string;                // 版本号
  author: string;                 // 作者
  category: "built-in" | "extension";  // 内置 or 扩展
  tools: SkillToolDefinition[];   // 该 Skill 提供的工具定义
  systemPromptAddon?: string;     // 注入到 System Prompt 的额外指令
  installedAt?: number;           // 安装时间
  enabled: boolean;               // 是否启用
}

interface SkillToolDefinition {
  name: string;                   // 工具名，如 "web_search"
  description: string;            // 工具描述，LLM 据此判断是否调用
  parameters: {                   // JSON Schema 格式
    type: "object";
    properties: Record<string, {
      type: string;
      description: string;
    }>;
    required: string[];
  };
  handler: "local" | "mcp";      // 执行方式：本地函数 or MCP 远程
  mcpTool?: string;               // handler 为 mcp 时对应的 MCP 工具名
}
```

### 6.3 Skill Registry 架构

```
┌───────────────────────────────────────────────────────┐
│                   Skill Registry                       │
│                                                       │
│  ┌─────────────┐  ┌─────────────┐  ┌──────────────┐ │
│  │ 内置 Skills   │  │ 扩展 Skills   │  │ Skill 市场    │ │
│  │ (不可卸载)    │  │ (可安装/卸载) │  │ (可用列表)    │ │
│  ├─────────────┤  ├─────────────┤  ├──────────────┤ │
│  │ filesystem  │  │ web-search  │  │ code-review  │ │
│  │ terminal    │  │ database    │  │ api-testing  │ │
│  │ git         │  │ ...         │  │ ...          │ │
│  └─────────────┘  └─────────────┘  └──────────────┘ │
│                                                       │
│  持久化: data/skills.json                              │
└───────────────────────┬───────────────────────────────┘
                        │
          ┌─────────────┼─────────────┐
          │             │             │
          ▼             ▼             ▼
   工具定义合并    Prompt 注入    执行路由
   (toGLMTools)   (System Prompt) (tool-executor)
```

### 6.4 工作流程

#### 6.4.1 Skill 安装流程

```
用户从首页 Skill 市场点击「安装」
    │
    ▼
POST /api/skills/{id}/install
    │
    ├── 从 Skill 市场获取 Skill 定义 (工具 + Prompt + 元数据)
    │
    ├── 写入 data/skills.json (追加到 installedSkills 列表)
    │
    ├── 如果 Skill 有 MCP 工具，在 MCP Server 中注册对应处理器
    │
    └── 返回安装成功 → 前端刷新 Skill 列表
```

#### 6.4.2 Skill 卸载流程

```
用户点击「卸载」
    │
    ▼
POST /api/skills/{id}/uninstall
    │
    ├── 检查是否为内置 Skill → 内置 Skill 拒绝卸载
    │
    ├── 从 data/skills.json 中移除
    │
    ├── 如果有 MCP 工具，从 MCP Server 注销处理器
    │
    └── 返回卸载成功 → 前端刷新 Skill 列表
```

#### 6.4.3 LLM 自动发现与调用流程

```
用户发送消息
    │
    ▼
Orchestrator.runAgentLoop()
    │
    ├── 构建 tools 参数:
    │   1. 基础工具 (TOOL_DEFINITIONS)
    │   2. + 所有已安装且启用 Skill 的工具定义
    │   → 合并为完整工具列表传给 LLM
    │
    ├── 构建 system prompt:
    │   1. 基础 SYSTEM_PROMPT
    │   2. + 所有已安装且启用 Skill 的 systemPromptAddon
    │   → 合并为完整 Prompt
    │
    ▼
LLM 根据工具描述自主决定调用哪个工具
    │
    ├── 调用基础工具 → tool-executor 正常处理
    │
    └── 调用 Skill 工具 → tool-executor 路由:
        ├── handler === "local" → 执行本地注册的函数
        └── handler === "mcp"   → 通过 MCP Client 调用远程工具
```

### 6.5 核心代码模块

| 模块 | 路径 | 职责 |
|------|------|------|
| Skill Registry | `src/lib/skill/registry.ts` | Skill CRUD，JSON 持久化，工具定义合并 |
| Skill Market | `src/lib/skill/market.ts` | 可用 Skill 列表（内置 + 远程市场） |
| Skill API | `src/app/api/skills/route.ts` | `GET` 列出已安装 / `POST` 安装 |
| Skill API | `src/app/api/skills/[id]/route.ts` | `DELETE` 卸载 / `PATCH` 启用禁用 |
| 工具定义合并 | `src/lib/agent/tools.ts` | 改造 `toGLMTools()` 合并 Skill 工具 |
| Orchestrator | `src/lib/agent/orchestrator.ts` | 改造 System Prompt 和 tools 参数构建 |
| Tool Executor | `src/lib/agent/tool-executor.ts` | 增加 Skill 工具的路由分发 |
| 首页 Skill 面板 | `src/app/page.tsx` | 展示已安装 Skill + 可安装 Skill 市场 |

### 6.6 Skill 市场预设

以下是计划支持的扩展 Skill 列表：

| Skill ID | 名称 | 提供工具 | 描述 |
|----------|------|---------|------|
| `web-search` | Web 搜索 | `web_search` | 搜索互联网获取最新信息 |
| `database` | 数据库操作 | `db_query`, `db_schema` | 连接数据库执行查询 |
| `code-review` | 代码审查 | `review_file`, `review_diff` | 自动化代码审查与建议 |
| `api-testing` | API 测试 | `http_request` | 发送 HTTP 请求测试 API |
| `deploy` | 部署管理 | `deploy_status`, `deploy_trigger` | 触发和监控部署流程 |

### 6.7 首页 Skill 展示设计

在首页会话列表下方，新增 Skill 面板区域：

```
┌─────────────────────────────────────────────────┐
│  🧩 已安装技能                     [浏览更多 →]  │
├─────────────────────────────────────────────────┤
│                                                 │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐     │
│  │ 📁 文件   │  │ 💻 终端   │  │ 🔀 Git   │     │
│  │ 系统      │  │ 操作      │  │ 版本控制  │     │
│  │ 内置 · 3  │  │ 内置 · 1  │  │ 内置 · 2  │     │
│  └──────────┘  └──────────┘  └──────────┘     │
│                                                 │
│  ┌──────────┐  ┌──────────┐                    │
│  │ 🔍 Web   │  │ 🗄️ 数据库 │                    │
│  │ 搜索      │  │ 操作      │                    │
│  │ 扩展 · 1  │  │ 扩展 · 2  │                    │
│  │ [卸载]    │  │ [卸载]    │                    │
│  └──────────┘  └──────────┘                    │
│                                                 │
└─────────────────────────────────────────────────┘
```

### 6.8 安全考量

| 风险 | 措施 |
|------|------|
| 恶意 Skill 工具 | 内置 Skill 不可卸载；扩展 Skill 安装时显示权限声明 |
| 工具名冲突 | Skill 工具名使用 `{skillId}_{toolName}` 命名空间前缀 |
| Prompt 注入 | Skill 的 systemPromptAddon 需经过审核，限制长度 |
| 资源消耗 | Skill 工具执行超时限制，与基础工具一致 |

---

## 7. 安全性设计

### 7.1 安全护栏 (Guardrails)

| 层级 | 措施 | 说明 |
|------|------|------|
| **命令拦截** | 黑名单机制 | 拦截 `rm -rf /`, `mkfs`, `chmod` 等高危命令 |
| **人机确认 (HITL)** | 审批工作流 | 破坏性操作必须经前端人工确认 |
| **Diff 审批** | 代码审查 | Agent 修改的代码必须在 UI 展示 Diff，人工 Accept 后才写入磁盘 |
| **只读默认** | 最小权限 | 默认只允许 Agent 读取代码，修改操作需二次确认 |
| **敏感信息过滤** | 内容检测 | 拦截导出 `.env` 文件、泄露密钥等行为 |

### 7.2 沙盒隔离

- 每个 CDE 环境运行在独立的 Docker 容器中
- 开启 Network Namespace 隔离，防止 Agent 扫描内网
- 使用 EFS 或分布式文件系统挂载到容器，确保数据持久化

### 7.3 多用户权限

| 模式 | 说明 |
|------|------|
| 创建者模式 | 只有发起 Task 的人能回答 Agent 提问 |
| 抢占模式 | 谁先点"回复"谁回答 |
| 权限分级 | 只有 Maintainer 权限的用户能批准代码修改操作 |

---

## 8. 技术栈总览

### 8.1 推荐开发栈

| 维度 | 推荐工具 |
|------|---------|
| 语言 | TypeScript (生态最成熟) |
| 核心 SDK | `@anthropic-ai/sdk` |
| 基础模型 | GLM-5.1 |
| 前端框架 | React + Tailwind CSS |
| 代码编辑器 | Monaco Editor |
| 终端 | Xterm.js |
| 协作引擎 | Yjs (CRDT) |
| 后端框架 | NestJS / Fastify |
| 实时通信 | Socket.io / WS |
| 外部连接 | MCP SDK |
| 远程环境 | Docker / Kubernetes |
| IDE 框架 (可选) | Eclipse Theia (AI-native 开源 IDE) |

### 8.2 核心依赖

```bash
npm install @anthropic-ai/sdk zod socket.io yjs
```

---

## 9. 开发路线图

### Phase 1: 极简 Demo — 聊天入口 ✅

- [x] 用 Next.js 搭建聊天界面 (`/chat/:sessionId`)
- [x] 后端集成 GLM-5.1 SDK，配置 `read_directory` 工具
- [x] 实现前端发送消息，后端返回 Agent 响应

### Phase 2: 聊天入口增强 + MCP 远程执行 ✅

- [x] SSE 流式展示 Agent 思考过程
- [x] 聊天界面中的工具调用详情展示（可折叠卡片）
- [x] 集成 MCP 协议，支持远程 Docker 容器中执行 Bash 命令
- [x] 实现 Docker Compose 本地模拟（控制平面容器 + MCP Server 容器）

### Phase 3: 代码编辑器入口 ✅

- [x] 实现代码编辑器界面 (`/editor/:sessionId`)，集成 Monaco Editor
- [x] 文件树组件 + 终端面板
- [x] AI 操作面板（Inline Chat、快捷指令）
- [x] 双入口路由与共享状态层 (Session Store)

### Phase 4: Session 管理与沙箱隔离 ✅

- [x] **4.1 Session Manager 后端**
  - [x] 创建 `src/lib/session/manager.ts` — Session CRUD，JSON 文件持久化
  - [x] 数据模型：id / name / createdAt / lastActiveAt / workspacePath / entryMode
  - [x] 存储位置：`data/sessions.json`，workspace 目录：`workspaces/{id}/`
  - [x] 创建 session 时自动创建 workspace 目录
  - [x] 删除 session 时递归清理 workspace 目录 + 内存中的对话历史
- [x] **4.2 Session API Routes**
  - [x] `GET /api/sessions` — 列出所有 session
  - [x] `POST /api/sessions` — 创建新 session
  - [x] `PATCH /api/sessions/[id]` — 更新 session（重命名等）
  - [x] `DELETE /api/sessions/[id]` — 删除 session + 清理 workspace
- [x] **4.3 Workspace 路由机制**
  - [x] 修改 `tool-executor.ts` — `executeTool` 增加 `workspacePath` 参数
  - [x] 修改 `orchestrator.ts` — 传递 `workspacePath` 给工具执行
  - [x] 修改 `socket/server.ts` — session 关联 workspace 路径
  - [x] 修改 `mcp-server/index.ts` — MCP 调用支持 `workspacePath` 路由
- [x] **4.4 首页重构**
  - [x] 首页改为 Session 列表视图（卡片式布局）
  - [x] 新建 session：行内输入名称 → 创建 → 跳转聊天页
  - [x] 进入 session：💬 聊天 / 📝 编辑器 双入口按钮
  - [x] 删除 session：确认弹窗 → 删除 → 列表刷新
  - [x] 重命名 session：双击编辑
  - [x] 时间显示：相对时间（3分钟前 / 昨天）
- [x] **4.5 状态清理**
  - [x] `session-data.ts` 纯数据层（无 React 依赖，供 API Route 使用）
  - [x] `session-cleanup.ts` 清理模块
  - [x] `server-cleanup.ts` 后端 LLM 历史清理
  - [x] 删除 session 时清理 `sessionMessagesMap` / `sessionAgentStateMap`
  - [x] 删除 session 时清理 `sessionHistories`（后端 LLM 历史）
  - [x] `.gitignore` 添加 `data/` 和 `workspaces/`

### Phase 5: Skill 系统 — 可插拔能力扩展 ✅

- [x] **5.1 Skill Registry 核心模块**
  - [x] 创建 `src/lib/skill/registry.ts` — Skill CRUD，JSON 持久化 (`data/skills.json`)
  - [x] 数据模型：id / name / description / icon / version / author / category / tools / systemPromptAddon / enabled
  - [x] 内置 Skill 注册：将现有基础工具（filesystem / terminal / git）重构为内置 Skill
  - [x] `getInstalledSkills()` / `installSkill()` / `uninstallSkill()` / `toggleSkill()`
- [x] **5.2 Skill 市场与预设**
  - [x] 创建 `src/lib/skill/market.ts` — 可安装 Skill 目录（内置预设 + 扩展市场）
  - [x] 预设扩展 Skill：web-search / api-testing / code-review / deploy
  - [x] 每个预设 Skill 包含完整的工具定义 + systemPromptAddon + 执行处理器
- [x] **5.3 Agent 工具链改造**
  - [x] 改造 `src/lib/agent/tools.ts` — `toGLMTools()` 合并所有已启用 Skill 的工具定义
  - [x] 改造 `src/lib/agent/orchestrator.ts` — System Prompt 注入 Skill 的 promptAddon
  - [x] 改造 `src/lib/agent/tool-executor.ts` — 增加 Skill 工具的路由分发（local / mcp）
- [x] **5.4 Skill API Routes**
  - [x] `GET /api/skills` — 列出已安装 Skill + 市场可用 Skill
  - [x] `POST /api/skills` — 安装 Skill (body: { skillId })
  - [x] `DELETE /api/skills/{id}` — 卸载 Skill（内置不可卸载）
  - [x] `PATCH /api/skills/{id}` — 启用/禁用 Skill
- [x] **5.5 首页 Skill 展示面板**
  - [x] 首页新增「已安装技能」区域，卡片式展示
  - [x] 区分内置 Skill（标记"内置"）和扩展 Skill（可卸载按钮）
  - [x] 「浏览更多」按钮展开 Skill 市场弹窗
  - [x] 安装/卸载操作实时刷新列表
  - [x] 每个 Skill 卡片显示：图标 + 名称 + 工具数量 + 类别标签 + 启用/禁用开关

### Phase 6: 人机协作工作流 ✅

- [x] 实现 `ask_user` 工具与 Promise 挂起机制（双入口通知联动）
- [x] 实现 `approval_required` 审批工作流
- [x] 编辑器入口：Diff 预览 + Accept/Reject
- [x] 聊天入口：Diff 摘要卡片 + Accept/Reject
- [x] 双入口间跳转（聊天 → 编辑器查看完整 Diff）

### Phase 7: 协作与智能增强

- [ ] 集成 Yjs CRDT 支持多用户协同编辑
- [ ] 集成 LSP 提高代码修改准确率
- [ ] 文件引用 (@file) 组件（聊天入口）
- [ ] Agent 文件修改的双入口实时同步

### Phase 8: 生产化

- [ ] Kubernetes 部署与多环境隔离
- [ ] 持久化日志 (PostgreSQL)
- [ ] RBAC 权限体系
- [ ] 性能监控与 Agent 行为审计

---

## 10. 附录

### 10.1 关键术语表

| 术语 | 全称 | 说明 |
|------|------|------|
| CDE | Cloud Development Environment | 云端开发环境 |
| MCP | Model Context Protocol | 模型上下文协议，标准化 Agent 操作外部世界的接口 |
| LSP | Language Server Protocol | 语言服务器协议，提供代码语义理解能力 |
| HITL | Human-in-the-Loop | 人机协作，敏感操作需人工确认 |
| CRDT | Conflict-free Replicated Data Type | 无冲突复制数据类型，实现多用户实时协作 |
| RBAC | Role-Based Access Control | 基于角色的访问控制 |
| Skill | — | Agent 的可插拔能力扩展单元，封装工具定义和 Prompt 增强 |
| Skill Registry | — | 全局注册表，管理已安装 Skill 的元数据和生命周期 |

### 10.2 连接协议速查

| 通信路径 | 协议 | 说明 |
|---------|------|------|
| 控制平面 → Anthropic API | HTTPS | 发送 Prompt，接收模型响应 |
| 控制平面 → CDE | MCP over JSON-RPC | 执行读写文件和 Shell 命令 |
| 控制平面 → 前端 | WebSockets (Socket.io) | 实时推送状态更新和 Diff |
| 前端 → 控制平面 | WebSocket 事件 | 用户提问、审批、回复 Agent |
