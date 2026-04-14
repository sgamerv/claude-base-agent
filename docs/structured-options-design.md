# 结构化选项交互设计文档

> **版本**: v1.0
> **日期**: 2026-04-13
> **状态**: 设计中
> **依赖**: Phase 6 人机协作工作流（已完成）

---

## 1. 问题分析

### 当前状况

当 LLM 需要用户做选择时（如选择方案、确认操作等），有两种场景：

| 场景 | 触发方式 | 当前渲染 | 交互方式 |
|------|---------|---------|---------|
| **ask_user 工具** | LLM 调用 `ask_user(question)` | 问题文本 + 文本输入框 | 手动输入回复 |
| **LLM 回复中的列表** | LLM 在 content 中返回编号列表 | Markdown 有序列表（纯文本） | 无法交互 |

### 痛点

1. **列表不换行** — LLM 返回的编号列表在气泡中可能挤在一行，Markdown 渲染虽有换行但视觉不清晰
2. **无法勾选** — 用户看到选项后只能手动输入（如 "1" 或 "方案A"），体验差且易出错
3. **无结构化数据** — `ask_user` 工具没有 `options` 参数，LLM 无法传递结构化选项

---

## 2. 设计目标

| 目标 | 说明 |
|------|------|
| **结构化选项** | `ask_user` 工具支持 `options` 参数，LLM 可传递选项列表 |
| **可点击选择** | 前端渲染为可点击的选项卡片，支持单选和多选 |
| **列表换行优化** | LLM 回复中的编号列表自动渲染为结构化选项卡片 |
| **向后兼容** | 无 `options` 时仍显示文本输入框 |

---

## 3. 方案设计

### 3.1 ask_user 工具扩展

```typescript
// tools.ts — ask_user 工具定义扩展
{
  name: "ask_user",
  description: "当需要用户提供额外信息、做决定或确认方案时调用此工具。支持结构化选项列表。",
  parameters: {
    type: "object",
    properties: {
      question: {
        type: "string",
        description: "向用户提出的具体问题",
      },
      options: {
        type: "array",
        description: "可选的选项列表，每个选项包含 label（显示文本）和 value（选择值）",
        items: {
          type: "object",
          properties: {
            label: { type: "string", description: "选项显示文本" },
            value: { type: "string", description: "选项值" },
            description: { type: "string", description: "选项描述（可选）" },
          },
          required: ["label", "value"],
        },
      },
      multiple: {
        type: "boolean",
        description: "是否允许多选（默认 false，单选）",
      },
    },
    required: ["question"],
  },
}
```

### 3.2 类型扩展

```typescript
// chat.ts — pendingInput 扩展
export interface SelectOption {
  label: string;          // 显示文本："方案A - 重构为微服务"
  value: string;          // 选择值："A" 或 "方案A"
  description?: string;   // 选项描述："适合大规模系统，但复杂度较高"
}

export interface ChatMessage {
  // ...existing fields...
  pendingInput?: {
    question: string;
    toolCallId: string;
    options?: SelectOption[];  // 新增：结构化选项
    multiple?: boolean;        // 新增：是否多选
  };
}
```

### 3.3 数据流转

```
LLM 调用 ask_user({ question: "选择方案", options: [...] })
    │
    ▼
orchestrator.ts: 提取 question + options + multiple
    │
    ▼
callbacks.onAskUser(question, toolCallId, options, multiple)
    │
    ▼
server.ts: emit "agent_needs_input" { question, toolCallId, options, multiple }
    │
    ▼
useSocket.ts: onAskUser(data) — data 包含 options, multiple
    │
    ▼
ChatPanel.tsx: updateLastAssistantMessage({ pendingInput: { question, toolCallId, options, multiple } })
    │
    ▼
ChatMessage.tsx:
    ├── 有 options → 渲染选项卡片（单选/多选）+ 确认按钮
    └── 无 options → 渲染文本输入框（兼容）
```

### 3.4 选项卡片 UI 设计

#### 单选模式（默认）

```
┌─────────────────────────────────────┐
│  ❓ 请选择实现方案                    │
│                                     │
│  ┌─────────────────────────────────┐│
│  │ ○ 方案A - 微服务架构             ││
│  │   适合大规模系统，但复杂度较高     ││
│  └─────────────────────────────────┘│
│  ┌─────────────────────────────────┐│
│  │ ● 方案B - 优化单体架构           ││  ← 选中态
│  │   改动最小，适合当前规模          ││
│  └─────────────────────────────────┘│
│  ┌─────────────────────────────────┐│
│  │ ○ 方案C - 混合架构              ││
│  │   折中方案，部分微服务化          ││
│  └─────────────────────────────────┘│
│                                     │
│  [确认选择]  或  输入自定义回复... [回复]│
└─────────────────────────────────────┘
```

#### 多选模式

```
┌─────────────────────────────────────┐
│  ❓ 选择需要的功能模块                │
│                                     │
│  ┌─────────────────────────────────┐│
│  │ ☑ 用户认证                       ││  ← 选中
│  └─────────────────────────────────┘│
│  ┌─────────────────────────────────┐│
│  │ ☐ 数据导出                       ││
│  └─────────────────────────────────┘│
│  ┌─────────────────────────────────┐│
│  │ ☑ 权限管理                       ││  ← 选中
│  └─────────────────────────────────┘│
│                                     │
│  [确认选择 (2/3)]                    │
└─────────────────────────────────────┘
```

### 3.5 LLM 回复中列表的智能识别

当 LLM 在 content 中返回编号列表但未使用 `ask_user` 工具时（即 LLM 直接在文本中给选项），前端尝试智能识别并渲染为选项卡片。

**识别规则**：

```
正则匹配：
/^(\d+)[.、)\s]+(.+)$/gm

匹配示例：
"1. 方案A - 微服务架构"   → { label: "方案A - 微服务架构", value: "1" }
"2. 方案B - 优化单体"     → { label: "方案B - 优化单体", value: "2" }
"3. 方案C - 混合架构"     → { label: "方案C - 混合架构", value: "3" }
```

**注意**：此功能为可选增强。由于 Markdown 有序列表已能正常渲染换行，主要优化点是将其变为可点击。但为避免误识别（如步骤列表 "1. 先读取文件"），需要上下文判断（如有 "选择"/"方案"/"选项" 等关键词）。

**设计决策**：Phase 8 先实现 `ask_user` 的结构化选项（确定性高），列表智能识别作为后续增强。

---

## 4. 修改文件清单

| 文件 | 修改内容 |
|------|---------|
| `src/lib/types/chat.ts` | 新增 `SelectOption` 接口，`pendingInput` 增加 `options`/`multiple` 字段 |
| `src/lib/agent/tools.ts` | `ask_user` 工具增加 `options`/`multiple` 参数定义 |
| `src/lib/agent/orchestrator.ts` | `onAskUser` 回调签名增加 `options`/`multiple`，传递到前端 |
| `src/lib/socket/server.ts` | `agent_needs_input` 事件携带 `options`/`multiple` |
| `src/lib/hooks/useSocket.ts` | `onAskUser` 数据类型扩展 |
| `src/components/chat/ChatMessage.tsx` | 选项卡片渲染（单选/多选 + 确认按钮 + 兼容文本输入） |
| `src/components/chat/ChatPanel.tsx` | `onAskUser` 处理中存储 `options`/`multiple` |
| `src/components/editor/AIPanel.tsx` | 同步修改编辑器入口的提问 UI |

---

## 5. 开发路线

### Phase 8A: ask_user 结构化选项 — 后端 ✅

- [x] **8A.1 类型扩展**
  - [x] `chat.ts` — 新增 `SelectOption` 接口，`pendingInput` 增加 `options`/`multiple`
  - [x] `tools.ts` — `ask_user` 工具增加 `options`/`multiple` 参数

- [x] **8A.2 数据链路打通**
  - [x] `orchestrator.ts` — `onAskUser` 回调签名增加 `options`/`multiple`
  - [x] `server.ts` — `agent_needs_input` 事件携带 `options`/`multiple`
  - [x] `useSocket.ts` — `onAskUser` 数据类型扩展

### Phase 8B: ask_user 结构化选项 — 前端 ✅

- [x] **8B.1 选项卡片组件**
  - [x] `ChatMessage.tsx` — 单选选项卡片（Radio 样式）+ 多选选项卡片（Checkbox 样式）+ 确认按钮
  - [x] `AIPanel.tsx` — 编辑器入口紧凑版选项卡片 + 确认按钮

- [x] **8B.2 数据流对接**
  - [x] `ChatPanel.tsx` — `onAskUser` 存储选项数据
  - [x] `AIPanel.tsx` — 编辑器入口同步修改

- [x] **8B.3 向后兼容**
  - [x] 无 `options` 时仍显示文本输入框
  - [x] 有 `options` 时底部仍有"自定义回复"文本输入
