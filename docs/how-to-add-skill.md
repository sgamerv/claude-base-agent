# 如何为 Agent 添加新的 Skill

> **文档类型**: How-to Guide  
> **目标读者**: 希望为 Cloud CDE Agent 添加新能力的开发者  
> **目标**: 完成一个新 Skill 从定义、注册、实现到 Agent 可用的全过程

---

## 概述

Skill 是 Agent 的可插拔能力扩展单元。每个 Skill 封装一组工具定义和 Prompt 增强指令，LLM 在运行时自动发现已启用的 Skill 工具并按需调用。

当前项目的 Skill 市场是**硬编码**的——所有可用 Skill 定义直接写在源码中。要添加一个新的 Skill（如 brainstorming），需要修改以下文件：

| 步骤 | 文件 | 做什么 |
|------|------|--------|
| 1 | `src/lib/skill/market.ts` | 在 `EXTENSION_SKILLS` 数组中添加 Skill 定义 |
| 2 | `src/lib/skill/executor.ts` | 在 `SKILL_LOCAL_HANDLERS` 中注册本地工具处理器（仅 `handler: "local"` 需要） |
| 3 | `src/lib/mcp/client.ts` | 在 `mapToolName` 中添加工具名映射（仅 `handler: "mcp"` 需要） |
| 4 | 前端重新构建 | 使新 Skill 出现在市场列表中 |

---

## 第 1 步：在 Market 中定义 Skill

打开 `src/lib/skill/market.ts`，在 `EXTENSION_SKILLS` 数组末尾添加新 Skill 定义。

### Skill 定义结构

```typescript
{
  id: string;                     // 唯一标识，kebab-case，如 "brainstorming"
  name: string;                   // 显示名称，如 "头脑风暴"
  description: string;            // 简短描述，显示在 Skill 卡片上
  icon: string;                   // emoji 图标
  version: string;                // 语义化版本号
  author: string;                 // 作者
  category: "extension";          // 扩展 Skill 必须为 "extension"
  enabled: boolean;               // 安装后默认是否启用，通常为 true
  tools: SkillToolDefinition[];   // 该 Skill 提供的工具列表
  systemPromptAddon?: string;     // 注入到 System Prompt 的额外指令
}
```

### 工具定义结构

```typescript
{
  name: string;              // 工具名，snake_case，如 "brainstorm"
  description: string;       // 工具描述——LLM 根据这段文字决定是否调用
  parameters: {              // JSON Schema 格式
    type: "object";
    properties: Record<string, { type: string; description: string }>;
    required: string[];
  };
  handler: "local" | "mcp";  // 执行方式
  mcpTool?: string;           // handler 为 "mcp" 时对应的 MCP Server 工具名
}
```

### handler 选择指南

| handler | 适用场景 | 工具执行位置 |
|---------|---------|-------------|
| `"local"` | 纯逻辑处理、API 调用、LLM 能力委派 | 控制平面 Node.js 进程 |
| `"mcp"` | 需要访问文件系统、终端、远程 CDE 环境 | 远程 CDE 容器中的 MCP Server |

### 示例：添加 brainstorming Skill

```typescript
// 在 EXTENSION_SKILLS 数组末尾添加
{
  id: "brainstorming",
  name: "头脑风暴",
  description: "结构化创意思维工具，帮助用户探索需求、发散方案和收敛决策",
  icon: "💡",
  version: "1.0.0",
  author: "community",
  category: "extension",
  enabled: true,
  tools: [
    {
      name: "brainstorm",
      description:
        "启动结构化头脑风暴。当用户需要探索需求、生成创意、评估方案或做决策时使用。" +
        "支持多种思维模式：发散思维（生成多个方案）、收敛思维（评估和筛选）、六顶思考帽、SWOT 分析等。",
      parameters: {
        type: "object",
        properties: {
          topic: {
            type: "string",
            description: "头脑风暴的主题或问题",
          },
          mode: {
            type: "string",
            description:
              "思维模式：divergent（发散，生成多个方案）、convergent（收敛，评估筛选）、" +
              "six_hats（六顶思考帽）、swot（SWOT 分析）、pros_cons（利弊分析）",
          },
          context: {
            type: "string",
            description: "补充上下文信息（可选），如项目背景、约束条件等",
          },
        },
        required: ["topic"],
      },
      handler: "local",  // 纯 LLM 能力委派，无需访问文件系统
    },
  ],
  systemPromptAddon:
    "你可以使用 brainstorm 工具启动结构化头脑风暴。" +
    "当用户需要创意探索、方案评估或决策辅助时，主动调用此工具。" +
    "根据问题性质选择合适的思维模式：探索阶段用 divergent，决策阶段用 convergent，" +
    "全面评估用 six_hats 或 swot。",
},
```

---

## 第 2 步：实现工具处理器

根据 `handler` 类型的不同，实现方式也不同。

### 方式 A：`handler: "local"` — 本地处理器

打开 `src/lib/skill/executor.ts`，在 `SKILL_LOCAL_HANDLERS` 字典中添加处理函数。

**适用场景**：纯逻辑处理、外部 API 调用、LLM 能力委派（工具返回引导文字，让 LLM 自行完成）。

```typescript
// 在 SKILL_LOCAL_HANDLERS 中添加
async brainstorm(input: Record<string, string>): Promise<ToolResult> {
  const topic = input.topic;
  const mode = input.mode || "divergent";

  if (!topic) {
    return { success: false, content: "", error: "Missing required parameter: topic" };
  }

  // LLM 能力委派模式：返回引导指令，让 LLM 自行执行头脑风暴
  const modeInstructions: Record<string, string> = {
    divergent: "请围绕以下主题进行发散思维，生成至少 5 个不同的创意方案或解决思路。不要过早评判，鼓励大胆设想。",
    convergent: "请对以下方案进行收敛评估，从可行性、影响力和实施难度三个维度打分（1-5），并给出最终推荐。",
    six_hats: "请使用六顶思考帽方法分析此主题，依次从六个视角（白帽-事实、红帽-感受、黑帽-风险、黄帽-价值、绿帽-创意、蓝帽-流程）进行思考。",
    swot: "请对此主题进行 SWOT 分析，分别列出优势 (Strengths)、劣势 (Weaknesses)、机会 (Opportunities) 和威胁 (Threats)。",
    pros_cons: "请对此主题进行利弊分析，分别列出至少 5 个优点和 5 个缺点，并给出综合建议。",
  };

  const instruction = modeInstructions[mode] || modeInstructions.divergent;
  const contextPart = input.context ? `\n\n背景信息：${input.context}` : "";

  return {
    success: true,
    content: `${instruction}\n\n主题：${topic}${contextPart}`,
  };
},
```

### 方式 B：`handler: "mcp"` — MCP 远程处理器

如果工具需要访问文件系统或终端（如读取项目配置、执行脚本），使用 MCP 模式。

1. 在 `src/lib/mcp/client.ts` 的 `mapToolName` 中添加映射：

```typescript
private mapToolName(agentToolName: string): string {
  const mapping: Record<string, string> = {
    // ... 已有映射
    your_tool_name: "your_mcp_tool_name",  // 新增
  };
  return mapping[agentToolName] || agentToolName;
}
```

2. 在 `mcp-server/index.ts` 中注册对应的 MCP Server 处理器（需要 MCP Server 支持该工具）。

---

## 第 3 步：验证

### 3.1 编译检查

```bash
npx tsc --noEmit
```

### 3.2 启动服务

```bash
npm run dev
```

### 3.3 在首页确认 Skill 出现

1. 打开 `http://localhost:3000`
2. 在「已安装技能」区域下方点击「浏览更多」
3. 确认新 Skill 出现在市场列表中
4. 点击「安装」
5. 确认 Skill 出现在已安装列表中，开关为启用状态

### 3.4 在聊天中验证 Agent 能发现并调用

1. 进入任意会话的聊天页面
2. 发送与 Skill 能力相关的消息，例如：*"帮我头脑风暴一下如何优化登录流程"*
3. 观察 Agent 是否调用了 `brainstorm` 工具
4. 确认工具执行结果正确

---

## 完整执行管线参考

添加新 Skill 后，Agent 运行时的完整链路如下：

```
┌─────────────────────────────────────────────────────────┐
│ 1. 用户消息 → send_message (Socket.io)                  │
└────────────────────┬────────────────────────────────────┘
                     ▼
┌─────────────────────────────────────────────────────────┐
│ 2. Orchestrator.runAgentLoop()                          │
│    ├── getAllToolDefinitions()                           │
│    │   └── getEnabledSkillTools() ← 从 Registry 读取    │
│    │       └── data/skills.json + BUILT_IN_SKILLS       │
│    ├── buildSystemPrompt()                              │
│    │   └── getEnabledSkillPromptAddons() ← 合并 Prompt  │
│    └── toGLMTools(skillToolDefs) → 传给 LLM API        │
└────────────────────┬────────────────────────────────────┘
                     ▼
┌─────────────────────────────────────────────────────────┐
│ 3. LLM 返回工具调用 (tool_call)                         │
│    例如: brainstorm({ topic: "...", mode: "divergent" })│
└────────────────────┬────────────────────────────────────┘
                     ▼
┌─────────────────────────────────────────────────────────┐
│ 4. Orchestrator → executeTool(toolName, input)          │
│    ├── handler="local" → SKILL_LOCAL_HANDLERS[toolName] │
│    └── handler="mcp"   → MCPClient.executeTool()        │
└────────────────────┬────────────────────────────────────┘
                     ▼
┌─────────────────────────────────────────────────────────┐
│ 5. 工具结果返回给 LLM → 继续循环或输出最终响应          │
└─────────────────────────────────────────────────────────┘
```

---

## 特殊工具的处理

以下工具在 `orchestrator.ts` 中有特殊拦截逻辑，**不属于 Skill 工具的普通执行路径**：

| 工具名 | 特殊处理 |
|--------|---------|
| `ask_user` | 系统级交互原语，挂起等待用户回复 |
| `write_file` | 先推送 Diff 让用户确认，接受后才写入 |
| `execute_bash` | 危险命令需用户审批 |

如果你添加的 Skill 工具需要类似的审批/确认机制，需要在 `orchestrator.ts` 的 `runAgentLoop()` 中新增特殊分支和对应的 `AgentCallbacks` 回调。

---

## 常见问题

### Q: 为什么新 Skill 安装后 Agent 不调用？

检查以下项：
1. Skill 的 `enabled` 是否为 `true`（首页可切换）
2. 工具的 `description` 是否足够清晰——LLM 根据描述决定是否调用
3. `systemPromptAddon` 是否引导 LLM 在合适场景下使用该工具
4. 查看控制台日志中 LLM 是否收到了工具定义（`[Agent]` 前缀日志）

### Q: 内置 Skill 和扩展 Skill 有什么区别？

| 维度 | 内置 Skill | 扩展 Skill |
|------|-----------|-----------|
| `category` | `"built-in"` | `"extension"` |
| 定义位置 | `BUILT_IN_SKILLS` 数组 | `EXTENSION_SKILLS` 数组 |
| 能否卸载 | 不能 | 能 |
| 持久化 | 代码中硬编码，状态可持久化到 JSON | 完整定义持久化到 `data/skills.json` |
| handler | 通常为 `"mcp"` | 通常为 `"local"` |

### Q: 能否从远程市场动态加载 Skill？

当前不支持。Skill 市场是硬编码在 `market.ts` 中的。如果需要远程市场，需要：
1. 搭建 Skill Registry 远程服务
2. 改造 `market.ts` 从远程拉取可用 Skill 列表
3. 改造安装流程，从远程下载 Skill 定义和处理器代码

### Q: 工具名冲突怎么办？

当前没有命名空间前缀机制。建议使用具有描述性的工具名（如 `brainstorm` 而非 `think`），避免与已有工具冲突。设计文档中计划了 `{skillId}_{toolName}` 前缀方案，但尚未实现。
