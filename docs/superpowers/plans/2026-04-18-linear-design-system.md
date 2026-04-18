# Linear 设计系统改造 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 Cloud CDE Agent 前端从 Zinc 暗色主题改造为 Linear 风格设计系统

**Architecture:** 先建立 CSS 变量 token + Inter 字体基础层，再按页面渐进改造。所有改动为纯视觉 Tailwind 类名替换，不涉及逻辑变更。

**Tech Stack:** Next.js 16, Tailwind CSS v4, Inter Variable (本地 woff2)

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `src/app/globals.css` | Modify | Token 变量系统、全局链接样式、滚动条 |
| `src/app/layout.tsx` | Modify | 字体切换 Geist → Inter Variable |
| `src/app/page.tsx` | Modify | 首页全量样式改造 |
| `src/app/chat/[sessionId]/ChatPageContent.tsx` | Modify | 聊天页顶部栏样式 |
| `src/app/editor/[sessionId]/EditorPageContent.tsx` | Modify | 编辑器页顶部栏样式 |
| `src/app/mcp/page.tsx` | Modify | MCP 管理页全量样式 |
| `src/components/chat/ChatMessage.tsx` | Modify | 消息气泡、工具卡片、提问、审批样式 |
| `src/components/chat/ChatInput.tsx` | Modify | 输入框、发送按钮样式 |
| `src/components/chat/ChatPanel.tsx` | Modify | 聊天面板空状态、连接状态条 |
| `src/components/editor/CodeEditor.tsx` | Modify | 标签栏、Monaco fontFamily |
| `src/components/editor/FileTree.tsx` | Modify | 文件树背景、选中态、悬停态 |
| `src/components/editor/TerminalPanel.tsx` | Modify | 终端背景、ANSI 颜色、边框 |
| `src/components/editor/AIPanel.tsx` | Modify | AI 面板全量样式（折叠态、消息、审批、提问） |
| `src/components/editor/EditorPanel.tsx` | Modify | 面板容器、状态栏、底部标签栏 |
| `src/components/common/DiffViewer.tsx` | Modify | Diff 容器、行背景、按钮 |
| `src/components/mcp/MCPStatusBadge.tsx` | Modify | 状态点颜色、文字色 |
| `src/components/mcp/ServerCard.tsx` | Modify | Server 卡片样式 |
| `src/components/mcp/AddServerDialog.tsx` | Modify | 对话框面板、输入框、按钮 |
| `public/fonts/InterVariable.woff2` | Create | Inter Variable 字体文件 |

---

## Task 1: 下载 Inter Variable 字体 + 建立 Token 基础

**Files:**
- Create: `public/fonts/InterVariable.woff2`
- Modify: `src/app/globals.css`
- Modify: `src/app/layout.tsx`

- [ ] **Step 1: 下载 Inter Variable 字体文件**

```bash
mkdir -p public/fonts
curl -L "https://rsms.me/inter/font-files/InterVariable.woff2" -o public/fonts/InterVariable.woff2
ls -la public/fonts/InterVariable.woff2
```

Expected: 文件存在且大小 > 100KB

- [ ] **Step 2: 替换 layout.tsx 字体加载**

将整个文件内容替换为使用本地 Inter Variable 字体：

```tsx
import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

const inter = localFont({
  src: "../../public/fonts/InterVariable.woff2",
  variable: "--font-inter",
  weight: "100 900",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Cloud CDE Agent",
  description: "基于 GLM-5.1 的 AI 远程协作开发平台",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} h-full antialiased`}
      style={{ fontFeatureSettings: '"cv01", "ss03"' }}
    >
      <body className="min-h-full flex flex-col font-sans">
        {children}
      </body>
    </html>
  );
}
```

- [ ] **Step 3: 重写 globals.css Token 系统**

```css
@import "tailwindcss";

@theme inline {
  /* 字体 */
  --font-sans: var(--font-inter), "SF Pro Display", -apple-system, system-ui, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, "Open Sans", "Helvetica Neue", sans-serif;
  --font-mono: "Berkeley Mono", ui-monospace, "SF Mono", Menlo, monospace;

  /* 背景 */
  --color-bg-marketing: #08090a;
  --color-bg-panel: #0f1011;
  --color-bg-surface: #191a1b;
  --color-bg-hover: #28282c;

  /* 文字 */
  --color-text-primary: #f7f8f8;
  --color-text-secondary: #d0d6e0;
  --color-text-tertiary: #8a8f98;
  --color-text-muted: #62666d;

  /* 品牌 */
  --color-accent-brand: #5e6ad2;
  --color-accent-interactive: #7170ff;
  --color-accent-hover: #828fff;
  --color-accent-link: #a8b1ff;
  --color-accent-link-hover: #c7cdff;

  /* 边框 */
  --color-border-subtle: rgba(255, 255, 255, 0.05);
  --color-border-standard: rgba(255, 255, 255, 0.08);
  --color-border-solid: #23252a;

  /* 状态 */
  --color-status-success: #27a644;
  --color-status-error: #e5484d;
  --color-status-warning: #f5a623;
}

body {
  background: var(--color-bg-marketing);
  color: var(--color-text-secondary);
}

/* 全局链接 */
a {
  color: var(--color-accent-link);
  text-decoration: underline;
  text-underline-offset: 3px;
  text-decoration-color: rgba(168, 177, 255, 0.3);
  transition: all 0.15s;
}

a:hover {
  color: var(--color-accent-link-hover);
  text-decoration-color: rgba(199, 205, 255, 0.6);
  background: rgba(168, 177, 255, 0.08);
  border-radius: 3px;
}

/* 滚动条 */
::-webkit-scrollbar {
  width: 6px;
}

::-webkit-scrollbar-track {
  background: transparent;
}

::-webkit-scrollbar-thumb {
  background-color: #3e3e44;
  border-radius: 3px;
}

::-webkit-scrollbar-thumb:hover {
  background-color: #52525b;
}
```

- [ ] **Step 4: 验证基础层**

```bash
npm run build
```

Expected: 构建成功，无错误

- [ ] **Step 5: 提交**

```bash
git add public/fonts/InterVariable.woff2 src/app/globals.css src/app/layout.tsx
git commit -m "feat: add Inter Variable font and Linear design tokens

Replace Geist with Inter Variable (local woff2), establish CSS custom
property token system with Linear color palette, add global link styles.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 2: 改造首页 (page.tsx)

**Files:**
- Modify: `src/app/page.tsx`

这是改动量最大的单个文件（~880 行）。所有改动为 Tailwind 类名替换。遵循以下替换规则：

**颜色映射速查表（适用于所有后续 Task）：**
- `bg-zinc-50 dark:bg-zinc-950` / `bg-white dark:bg-zinc-950` → `bg-bg-marketing`
- `bg-white dark:bg-zinc-900` → `bg-[rgba(255,255,255,0.02)]`
- `border-zinc-200 dark:border-zinc-800` / `border-zinc-200 dark:border-zinc-700` → `border-border-standard`
- `border-b border-zinc-200 dark:border-zinc-800` → `border-b border-border-subtle`
- `bg-blue-600` → `bg-accent-brand`
- `hover:bg-blue-700` → `hover:bg-accent-hover`
- `text-blue-600 dark:text-blue-400` → `text-accent-link`
- `text-zinc-900 dark:text-zinc-100` / `text-zinc-900 dark:text-zinc-50` → `text-text-primary`
- `text-zinc-700 dark:text-zinc-300` → `text-text-secondary`
- `text-zinc-500 dark:text-zinc-400` → `text-text-tertiary`
- `text-zinc-400` → `text-text-muted`
- `font-bold` → `font-[510]`
- `font-medium` → `font-[510]`
- `bg-zinc-100 dark:bg-zinc-800/50` → `bg-[rgba(255,255,255,0.03)]`
- `hover:bg-zinc-100 dark:hover:bg-zinc-800` → `hover:bg-[rgba(255,255,255,0.04)]`
- `hover:bg-zinc-50 dark:hover:bg-zinc-800/50` → `hover:bg-[rgba(255,255,255,0.04)]`

- [ ] **Step 1: 替换页面外壳样式**

In `page.tsx`, replace the outer div:
- `min-h-screen bg-zinc-50 dark:bg-zinc-950` → `min-h-screen bg-bg-marketing`

- [ ] **Step 2: 替换标题区域**

标题 div 内：
- `text-2xl font-bold text-zinc-900 dark:text-zinc-50` → `text-2xl font-[510] text-text-primary tracking-[-0.288px]`
- `text-zinc-500 dark:text-zinc-400 text-sm` → `text-text-tertiary text-[15px]`
- MCP 管理链接 `text-xs text-blue-600 dark:text-blue-400` → `text-xs text-accent-link`

- [ ] **Step 3: 替换会话列表卡片**

卡片容器：
- `bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800` → `bg-[rgba(255,255,255,0.02)] rounded-xl border border-border-standard`

列表头：
- `border-b border-zinc-200 dark:border-zinc-800` → `border-b border-border-subtle`
- `text-sm font-medium text-zinc-700 dark:text-zinc-300` → `text-sm font-[510] text-text-secondary`
- 新建按钮 `bg-blue-600 ... hover:bg-blue-700` → `bg-accent-brand ... hover:bg-accent-hover`

新建表单：
- `bg-blue-50 dark:bg-blue-950/30` → `bg-[rgba(94,106,210,0.06)]`
- Input: `bg-white dark:bg-zinc-800 ... border-zinc-300 dark:border-zinc-600 ... text-zinc-900 dark:text-zinc-100 ... focus:ring-blue-500` → `bg-[rgba(255,255,255,0.03)] ... border-border-standard ... text-text-primary ... focus:ring-accent-brand`
- 创建按钮同新建按钮颜色替换

列表项：
- `hover:bg-zinc-50 dark:hover:bg-zinc-800/50` → `hover:bg-[rgba(255,255,255,0.03)]`
- 会话名 `text-zinc-800 dark:text-zinc-200` → `text-text-primary`
- `hover:border-zinc-300 dark:hover:border-zinc-600 ... focus:border-blue-500` → `hover:border-border-standard ... focus:border-accent-brand`
- 时间 `text-xs text-zinc-400` → `text-xs text-text-muted`
- ID `text-zinc-300 dark:text-zinc-600` → `text-[#3e3e44]`

操作按钮（聊天、编辑器）：
- `text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-zinc-700` → `text-text-secondary hover:bg-[rgba(255,255,255,0.04)] border border-border-standard`

删除按钮：
- `text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 border-transparent hover:border-red-200 dark:hover:border-red-800` → `text-status-error hover:bg-[rgba(229,72,77,0.08)] border-transparent hover:border-[rgba(229,72,77,0.2)]`

- [ ] **Step 4: 替换技能面板**

面板容器同会话卡片容器替换。

技能网格中卡片：
- `border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/50` → `border-border-standard bg-[rgba(255,255,255,0.03)]`
- 未启用: `bg-zinc-100 dark:bg-zinc-800/30 opacity-60` → `bg-[rgba(255,255,255,0.02)] opacity-60`

开关：
- `bg-blue-600` → `bg-accent-brand`
- `bg-zinc-300 dark:bg-zinc-600` → `bg-[#3e3e44]`

Badge 样式替换（getSourceBadge 函数返回值）：
- GitHub: `bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300` → `bg-[rgba(255,255,255,0.05)] text-text-secondary`
- ZIP: `bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300` → `bg-[rgba(245,166,35,0.1)] text-status-warning`
- Local: `bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300` → `bg-[rgba(39,166,68,0.1)] text-status-success`
- URL: `bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300` → `bg-[rgba(113,112,255,0.1)] text-accent-interactive`

分类 Badge：
- Built-in: `bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300` → `bg-[rgba(94,106,210,0.1)] text-accent-hover`
- Extension: `bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300` → `bg-[rgba(113,112,255,0.1)] text-accent-link`
- SKILL.md: `bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300` → `bg-[rgba(229,72,77,0.1)] text-status-error`

卸载按钮：
- `text-red-500 ... border-red-200 dark:border-red-800 ... hover:bg-red-50 dark:hover:bg-red-950/30` → `text-status-error ... border-[rgba(229,72,77,0.2)] ... hover:bg-[rgba(229,72,77,0.08)]`

安装自定义按钮：
- `bg-green-600 hover:bg-green-700` → `bg-status-success hover:bg-[#2db84e]`

市场按钮：
- `text-blue-600 dark:text-blue-400` → `text-accent-link`

市场区域：
- `bg-zinc-50 dark:bg-zinc-800/30 border-b border-zinc-200 dark:border-zinc-700` → `bg-[rgba(255,255,255,0.02)] border-b border-border-subtle`
- 市场卡片 `border-dashed border-zinc-300 dark:border-zinc-600 hover:border-blue-400 dark:hover:border-blue-500` → `border-dashed border-border-standard hover:border-accent-brand`
- 安装按钮 `text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800 hover:bg-blue-50 dark:hover:bg-blue-950/30` → `text-accent-link border-[rgba(94,106,210,0.2)] hover:bg-[rgba(94,106,210,0.08)]`

- [ ] **Step 5: 替换安装对话框**

Backdrop:
- `bg-black/40` → `bg-[rgba(0,0,0,0.85)]`

面板:
- `bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-700 shadow-2xl` → `bg-bg-surface rounded-xl border border-border-standard shadow-2xl`

头部：
- `border-b border-zinc-200 dark:border-zinc-800` → `border-b border-border-subtle`

Tab:
- 激活: `text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400` → `text-accent-interactive border-b-2 border-accent-brand`
- 未激活: `text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300` → `text-text-muted hover:text-text-secondary`

Input 同之前替换规则。

预览结果：
- `bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800` → `bg-[rgba(39,166,68,0.08)] border-[rgba(39,166,68,0.2)]`
- 绿色文字 → `text-status-success`

安全扫描：
- 阻止: `bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800 ... text-red-600 dark:text-red-400` → `bg-[rgba(229,72,77,0.08)] border-[rgba(229,72,77,0.2)] ... text-status-error`
- 警告: `bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800` → `bg-[rgba(245,166,35,0.08)] border-[rgba(245,166,35,0.2)]`

底部操作按钮同之前 Ghost 按钮规则。

- [ ] **Step 6: 验证首页**

```bash
npm run build
```

Expected: 构建成功

- [ ] **Step 7: 提交**

```bash
git add src/app/page.tsx
git commit -m "feat: restyle homepage to Linear design system

Replace Zinc theme with Linear-inspired palette: dark backgrounds,
semi-transparent borders, brand indigo CTAs, 510 weight typography.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 3: 改造聊天页 (ChatPageContent + ChatPanel + ChatMessage + ChatInput)

**Files:**
- Modify: `src/app/chat/[sessionId]/ChatPageContent.tsx`
- Modify: `src/components/chat/ChatPanel.tsx`
- Modify: `src/components/chat/ChatMessage.tsx`
- Modify: `src/components/chat/ChatInput.tsx`

- [ ] **Step 1: 改造 ChatPageContent.tsx**

页面容器：
- `bg-white dark:bg-zinc-950` → `bg-bg-marketing`

顶部栏：
- `bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-700` → `bg-bg-panel border-b border-border-subtle`

返回链接：
- `text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300` → `text-text-muted hover:text-text-secondary`

标题：
- `font-medium text-zinc-900 dark:text-zinc-100` → `font-[510] text-text-primary`

编辑器入口链接：
- `text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400` → `text-xs text-accent-link hover:text-accent-link-hover`

MCP 状态点（替换三元组的 className）：
- 检测中 `bg-yellow-500` → `bg-status-warning`
- 已连接 `bg-green-500` → `bg-status-success`
- 断开 `bg-zinc-400` → `bg-[#3e3e44]`

MCP 文字 `text-zinc-500` → `text-text-muted`

Session ID `text-zinc-400` → `text-[#3e3e44]`

模型点 `bg-blue-500` → `bg-accent-interactive`
模型文字 `text-zinc-400` → `text-text-muted`

加载文字 `text-zinc-400` → `text-text-muted`

- [ ] **Step 2: 改造 ChatPanel.tsx**

连接断开条：
- `bg-red-500` → `bg-status-error`

空状态：
- `text-zinc-400` → `text-text-muted`
- 标题 `text-lg font-medium` → `text-lg font-[510] text-text-primary`

建议按钮：
- `border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800` → `border-border-standard text-text-secondary hover:bg-[rgba(255,255,255,0.04)]`

- [ ] **Step 3: 改造 ChatMessage.tsx**

用户气泡：
- `bg-blue-600 text-white` → `bg-accent-brand text-white`

AI 气泡：
- `bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100` → `bg-[rgba(255,255,255,0.03)] text-text-primary border border-[rgba(255,255,255,0.06)]`

系统消息：
- `bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200` → `bg-[rgba(245,166,35,0.08)] text-status-warning`

工具调用卡片（ToolCallCard）：
- 容器 `border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/50` → `border-border-standard bg-[rgba(255,255,255,0.02)]`
- 头部 hover `hover:bg-zinc-100 dark:hover:bg-zinc-800` → `hover:bg-[rgba(255,255,255,0.04)]`
- 展开 border `border-zinc-200 dark:border-zinc-700` → `border-border-subtle`
- 输入 label `text-zinc-400` → `text-text-muted`
- 输入 pre `bg-white dark:bg-zinc-900` → `bg-[rgba(255,255,255,0.03)]`
- 结果 label `text-zinc-400` → `text-text-muted`
- 成功结果 `text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-950/30` → `text-status-success bg-[rgba(39,166,68,0.08)]`
- 错误结果 `text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-950/30` → `text-status-error bg-[rgba(229,72,77,0.08)]`
- 工具名 `text-zinc-700 dark:text-zinc-300` → `text-text-secondary`
- 代码 `text-zinc-500 dark:text-zinc-400` → `text-text-muted`
- 状态文字 `text-zinc-400` → `text-text-muted`
- 展开 arrow `text-zinc-400` → `text-text-muted`
- 状态点 `bg-yellow-500` → `bg-status-warning`, `bg-green-500` → `bg-status-success`, `bg-red-500` → `bg-status-error`

提问区（PendingInputArea）：
- 边框 `border-zinc-200 dark:border-zinc-600` → `border-border-subtle`
- 选项选中 `border-blue-500 bg-blue-50 dark:bg-blue-950/30 dark:border-blue-400` → `border-accent-brand bg-[rgba(94,106,210,0.08)]`
- 选项未选中 `border-zinc-200 dark:border-zinc-600 hover:bg-zinc-50 dark:hover:bg-zinc-800/50` → `border-border-standard hover:bg-[rgba(255,255,255,0.04)]`
- 选中文字 `text-blue-700 dark:text-blue-300` → `text-accent-hover`
- 未选中文字 `text-zinc-800 dark:text-zinc-200` → `text-text-primary`
- 描述 `text-zinc-500 dark:text-zinc-400` → `text-text-muted`
- 确认按钮 `bg-blue-600 hover:bg-blue-700` → `bg-accent-brand hover:bg-accent-hover`
- Input `border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:ring-blue-500` → `border-border-standard bg-[rgba(255,255,255,0.03)] text-text-primary focus:ring-accent-brand`
- 回复按钮 `bg-blue-600 hover:bg-blue-700` → `bg-accent-brand hover:bg-accent-hover`

审批区：
- 边框 `border-red-200 dark:border-red-800` → `border-[rgba(229,72,77,0.2)]`
- 允许按钮 `bg-red-600 hover:bg-red-700` → `bg-status-error hover:bg-[#d03d42]`
- 拒绝按钮 `border-zinc-300 dark:border-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-800` → `border-border-standard hover:bg-[rgba(255,255,255,0.04)]`
- 代码块 `bg-red-50 dark:bg-red-950 text-red-800 dark:text-red-200` → `bg-[rgba(229,72,77,0.08)] text-status-error`

思考中点 `bg-zinc-400` → `bg-text-muted`

Diff 跳转链接 `text-blue-600 dark:text-blue-400` → `text-accent-link`（全局 a 样式会覆盖，但 hover 需确认）

- [ ] **Step 4: 改造 ChatInput.tsx**

输入框底栏：
- `border-t border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900` → `border-t border-border-subtle bg-bg-panel`

状态指示：
- `text-zinc-500` → `text-text-muted`
- 状态点 `bg-blue-500` → `bg-accent-interactive`

输入框：
- `rounded-xl border border-zinc-300 dark:border-zinc-600 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent` → `rounded-xl border border-border-standard bg-[rgba(255,255,255,0.02)] text-text-primary placeholder-text-muted focus:ring-2 focus:ring-accent-brand focus:border-transparent`

发送按钮：
- `bg-blue-600 hover:bg-blue-700` → `bg-accent-brand hover:bg-accent-hover`

- [ ] **Step 5: 验证**

```bash
npm run build
```

- [ ] **Step 6: 提交**

```bash
git add src/app/chat/[sessionId]/ChatPageContent.tsx src/components/chat/ChatPanel.tsx src/components/chat/ChatMessage.tsx src/components/chat/ChatInput.tsx
git commit -m "feat: restyle chat page to Linear design system

Brand indigo user bubbles, semi-transparent AI bubbles, ghost buttons,
updated status dots, approval/diff/question card styles.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 4: 改造编辑器页 (EditorPageContent + EditorPanel + CodeEditor + FileTree + TerminalPanel + AIPanel)

**Files:**
- Modify: `src/app/editor/[sessionId]/EditorPageContent.tsx`
- Modify: `src/components/editor/EditorPanel.tsx`
- Modify: `src/components/editor/CodeEditor.tsx`
- Modify: `src/components/editor/FileTree.tsx`
- Modify: `src/components/editor/TerminalPanel.tsx`
- Modify: `src/components/editor/AIPanel.tsx`

- [ ] **Step 1: 改造 EditorPageContent.tsx**

同 ChatPageContent 顶部栏替换（页面容器 bg、顶部栏 bg/border、链接色、状态点、标题字重）。

- [ ] **Step 2: 改造 EditorPanel.tsx**

文件树容器：
- `w-56 flex-shrink-0 border-r border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900` → `w-56 flex-shrink-0 border-r border-border-subtle bg-bg-panel`

底部面板：
- 容器 `border-t border-zinc-200 dark:border-zinc-700` → `border-t border-border-subtle`
- 标签栏 `border-b border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900` → `border-b border-border-subtle bg-bg-panel`
- 激活标签 `text-zinc-900 dark:text-zinc-100 border-b-2 border-blue-500` → `text-text-primary border-b-2 border-accent-brand`
- 未激活标签 `text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300` → `text-text-muted hover:text-text-secondary`
- 关闭按钮 `text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300` → `text-text-muted hover:text-text-secondary`

空面板 `text-zinc-400` → `text-text-muted`

状态栏：
- `bg-blue-600` → `bg-accent-brand`
- hover `hover:bg-blue-700` → `hover:bg-accent-hover`

- [ ] **Step 3: 改造 CodeEditor.tsx**

空状态：
- `text-zinc-400` → `text-text-muted`
- `text-zinc-500` → `text-text-muted`

标签栏：
- `bg-zinc-50 dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-700` → `bg-bg-panel border-b border-border-subtle`

标签页：
- `bg-white dark:bg-zinc-800 border-r border-zinc-200 dark:border-zinc-700` → `bg-[rgba(255,255,255,0.04)] border-r border-border-subtle`

文件名 `text-zinc-700 dark:text-zinc-300` → `text-text-secondary`

修改点 `bg-orange-500` → `bg-status-warning`

保存按钮 `text-blue-600 hover:text-blue-700 dark:text-blue-400` → `text-accent-link hover:text-accent-link-hover`

Monaco fontFamily:
- `'Geist Mono', 'Fira Code', monospace` → `'Berkeley Mono', ui-monospace, 'SF Mono', Menlo, monospace`

- [ ] **Step 4: 改造 FileTree.tsx**

头部：
- `border-b border-zinc-200 dark:border-zinc-700` → `border-b border-border-subtle`
- `text-zinc-600 dark:text-zinc-400` → `text-text-muted`

刷新按钮 `text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300` → `text-text-muted hover:text-text-secondary`

加载文字 `text-zinc-400` → `text-text-muted`

节点按钮：
- `hover:bg-zinc-100 dark:hover:bg-zinc-800` → `hover:bg-[rgba(255,255,255,0.03)]`
- 选中 `bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300` → `bg-[rgba(94,106,210,0.08)] text-accent-hover`
- 未选中 `text-zinc-700 dark:text-zinc-300` → `text-text-secondary`

- [ ] **Step 5: 改造 TerminalPanel.tsx**

头部：
- `border-b border-zinc-800 bg-zinc-900` → `border-b border-border-subtle bg-bg-panel`
- `text-zinc-400` → `text-text-muted`

关闭按钮 `text-zinc-500 hover:text-zinc-300` → `text-text-muted hover:text-text-secondary`

输出文字 `text-zinc-300` → `text-text-secondary`

输入区：
- `border-t border-zinc-800` → `border-t border-border-subtle`
- $ 符号 `text-cyan-500` → `text-accent-interactive`
- Input `text-zinc-200` → `text-text-primary`

ANSI 颜色替换（renderLine 函数）：
- `\x1b[32m` green: `text-green-500` → `text-status-success`
- `\x1b[36m` cyan: `text-cyan-500` → `text-accent-interactive`
- `\x1b[31m` red: `text-red-500` → `text-status-error`
- `\x1b[33m` yellow: `text-yellow-500` → `text-status-warning`
- `\x1b[90m` gray: `text-zinc-500` → `text-text-muted`

终端背景 `bg-zinc-950` → `bg-bg-marketing`

- [ ] **Step 6: 改造 AIPanel.tsx**

折叠态：
- `bg-zinc-50 dark:bg-zinc-900 border-l border-zinc-200 dark:border-zinc-700` → `bg-bg-panel border-l border-border-subtle`
- 状态点 `bg-blue-500` → `bg-accent-interactive`

展开态：
- 容器 `border-l border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950` → `border-l border-border-subtle bg-bg-marketing`
- 头栏 `border-b border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900` → `border-b border-border-subtle bg-bg-panel`
- 标题 `text-zinc-600 dark:text-zinc-400` → `text-text-tertiary font-[510]`
- 状态文字 `text-blue-500` → `text-accent-interactive`
- 折叠按钮 `text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300` → `text-text-muted hover:text-text-secondary`

Diff 预览头：
- `bg-blue-50 dark:bg-blue-950/30 border-b border-zinc-200 dark:border-zinc-700` → `bg-[rgba(94,106,210,0.06)] border-b border-border-subtle`
- 标签 `text-blue-700 dark:text-blue-300` → `text-accent-hover`

快捷指令：
- 边框 `border-zinc-200 dark:border-zinc-700` → `border-border-standard`
- hover `hover:bg-zinc-100 dark:hover:bg-zinc-800` → `hover:bg-[rgba(255,255,255,0.04)]`
- 文字 `text-zinc-600 dark:text-zinc-400` → `text-text-secondary`
- 描述 `text-zinc-400 text-[10px]` → `text-text-muted text-[10px]`

内联消息（AIPanel 内的消息列表）：
- 用户 `bg-blue-600 text-white ml-4` → `bg-accent-brand text-white ml-4`
- 系统 `bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200` → `bg-[rgba(245,166,35,0.08)] text-status-warning`
- AI `bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100 mr-4` → `bg-[rgba(255,255,255,0.03)] text-text-primary mr-4`

工具卡片 `bg-zinc-50 dark:bg-zinc-800/50 ... border-zinc-200 dark:border-zinc-700` → `bg-[rgba(255,255,255,0.02)] ... border-border-standard`
- 状态点 同 ChatMessage 替换
- 工具名 `text-zinc-600 dark:text-zinc-400` → `text-text-tertiary`
- 代码 `text-zinc-500 text-[10px]` → `text-text-muted text-[10px]`
- 结果 `text-zinc-500` → `text-text-muted`

Diff 卡片区域 `mt-2 mr-4` 保持不变。

提问区（AIPanelPendingInput）：
- 问题文字 `text-zinc-600 dark:text-zinc-400` → `text-text-tertiary`
- 选项选中 `border-blue-500 bg-blue-50 dark:bg-blue-950/30` → `border-accent-brand bg-[rgba(94,106,210,0.08)]`
- 选项未选中 `border-zinc-200 dark:border-zinc-600 hover:bg-zinc-50 dark:hover:bg-zinc-800/50` → `border-border-standard hover:bg-[rgba(255,255,255,0.04)]`
- 选中勾 `bg-blue-600 border-blue-600` → `bg-accent-brand border-accent-brand`
- 未选中勾 `border-zinc-300 dark:border-zinc-500` → `border-[#3e3e44]`
- 选中圆点 `border-blue-600 dark:border-blue-400` → `border-accent-brand`
- 内圆点 `bg-blue-600 dark:bg-blue-400` → `bg-accent-brand`
- 未选中圆 `border-zinc-300 dark:border-zinc-500` → `border-[#3e3e44]`
- 选中文字 `text-blue-700 dark:text-blue-300 font-medium` → `text-accent-hover font-[510]`
- 未选中文字 `text-zinc-800 dark:text-zinc-200` → `text-text-primary`
- 描述 `text-zinc-500 dark:text-zinc-400` → `text-text-muted`
- 确认按钮 `bg-blue-600 text-white px-2 py-1 rounded hover:bg-blue-700` → `bg-accent-brand text-white px-2 py-1 rounded hover:bg-accent-hover`
- Input `border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:ring-blue-500` → `border-border-standard bg-[rgba(255,255,255,0.03)] text-text-primary focus:ring-accent-brand`
- 回复按钮 `bg-blue-600 hover:bg-blue-700` → `bg-accent-brand hover:bg-accent-hover`

审批卡片：
- `border-red-200 dark:border-red-800` → `border-[rgba(229,72,77,0.2)]`
- 文字 `text-red-600 dark:text-red-400` → `text-status-error`
- 代码块 `bg-red-50 dark:bg-red-950 text-red-800 dark:text-red-200` → `bg-[rgba(229,72,77,0.08)] text-status-error`
- 允许 `bg-red-600 hover:bg-red-700` → `bg-status-error hover:bg-[#d03d42]`
- 拒绝 `border-zinc-300 dark:border-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-800` → `border-border-standard hover:bg-[rgba(255,255,255,0.04)]`

思考中点 `bg-zinc-400` → `bg-text-muted`
思考中文字 `text-zinc-400` → `text-text-muted`

底部输入框：
- `border-t border-zinc-200 dark:border-zinc-700` → `border-t border-border-subtle`
- Input `border-zinc-300 dark:border-zinc-600 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:ring-blue-500` → `border-border-standard bg-[rgba(255,255,255,0.02)] text-text-primary placeholder-text-muted focus:ring-accent-brand`
- 发送 `bg-blue-600 hover:bg-blue-700` → `bg-accent-brand hover:bg-accent-hover`

空状态 `text-zinc-400 text-xs` → `text-text-muted text-xs`

- [ ] **Step 7: 验证**

```bash
npm run build
```

- [ ] **Step 8: 提交**

```bash
git add src/app/editor/[sessionId]/EditorPageContent.tsx src/components/editor/EditorPanel.tsx src/components/editor/CodeEditor.tsx src/components/editor/FileTree.tsx src/components/editor/TerminalPanel.tsx src/components/editor/AIPanel.tsx
git commit -m "feat: restyle editor page to Linear design system

Panel backgrounds, file tree, code editor tabs, terminal ANSI colors,
AI panel bubbles, approval/diff/question cards, status bar.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 5: 改造 MCP 管理页 + 共享组件

**Files:**
- Modify: `src/app/mcp/page.tsx`
- Modify: `src/components/mcp/MCPStatusBadge.tsx`
- Modify: `src/components/mcp/ServerCard.tsx`
- Modify: `src/components/mcp/AddServerDialog.tsx`
- Modify: `src/components/common/DiffViewer.tsx`

- [ ] **Step 1: 改造 MCPPage.tsx**

页面背景 `bg-zinc-50 dark:bg-zinc-900` → `bg-bg-marketing`

返回按钮 `text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300` → `text-text-muted hover:text-text-secondary`

标题 `text-2xl font-bold text-zinc-900 dark:text-zinc-100` → `text-2xl font-[510] text-text-primary tracking-[-0.288px]`

添加按钮 `bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700` → `bg-accent-brand text-white text-sm rounded-lg hover:bg-accent-hover`

统计卡片 `bg-white dark:bg-zinc-800 rounded-lg p-4 border border-zinc-200 dark:border-zinc-700` → `bg-[rgba(255,255,255,0.02)] rounded-lg p-4 border border-border-standard`

统计标签 `text-sm text-zinc-500 dark:text-zinc-400` → `text-sm text-text-muted`

统计数字 `text-2xl font-bold text-zinc-900 dark:text-zinc-100` → `text-2xl font-[510] text-text-primary`

已连接数字 `text-green-600 dark:text-green-400` → `text-status-success`

工具数数字 `text-blue-600 dark:text-blue-400` → `text-accent-interactive`

加载/空状态 `text-zinc-500 dark:text-zinc-400` → `text-text-muted`

说明区 `bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800` → `bg-[rgba(94,106,210,0.06)] rounded-lg border border-[rgba(94,106,210,0.2)]`
- 标题 `text-blue-800 dark:text-blue-300` → `text-accent-hover`
- 内容 `text-blue-700 dark:text-blue-400` → `text-text-secondary`

- [ ] **Step 2: 改造 MCPStatusBadge.tsx**

加载态 `text-zinc-500` → `text-text-muted`

Compact 模式保持 emoji 圆点但改色：
- connected `🟢` 保持
- error `🔴` 保持
- disconnected `⚪` 保持

Full 模式：
- `text-zinc-500 dark:text-zinc-400` → `text-text-muted`
- `text-zinc-400` (无 server) → `text-text-muted`

- [ ] **Step 3: 改造 ServerCard.tsx**

连接态 `border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-900/10` → `border-[rgba(39,166,68,0.2)] bg-[rgba(39,166,68,0.04)]`

错误态 `border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-900/10` → `border-[rgba(229,72,77,0.2)] bg-[rgba(229,72,77,0.04)]`

默认态 `border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800` → `border-border-standard bg-[rgba(255,255,255,0.02)]`

服务名 `font-medium text-sm text-zinc-900 dark:text-zinc-100` → `font-[510] text-sm text-text-primary`

URL `text-xs text-zinc-500 dark:text-zinc-400` → `text-xs text-text-muted`

刷新按钮 `bg-zinc-100 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-600` → `bg-[rgba(255,255,255,0.04)] text-text-secondary hover:bg-[rgba(255,255,255,0.08)]`

启用/禁用按钮：
- 禁用态 `bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 hover:bg-yellow-200` → `bg-[rgba(245,166,35,0.1)] text-status-warning hover:bg-[rgba(245,166,35,0.15)]`
- 启用态 `bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 hover:bg-green-200` → `bg-[rgba(39,166,68,0.1)] text-status-success hover:bg-[rgba(39,166,68,0.15)]`

删除按钮：
- 默认 `bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 hover:bg-red-200` → `bg-[rgba(229,72,77,0.1)] text-status-error hover:bg-[rgba(229,72,77,0.15)]`
- 确认 `bg-red-500 text-white` → `bg-status-error text-white`

内置标签 `bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400` → `bg-[rgba(94,106,210,0.1)] text-accent-hover`

标签栏 `bg-zinc-100 dark:bg-zinc-700 text-zinc-500 dark:text-zinc-400` → `bg-[rgba(255,255,255,0.04)] text-text-muted`

元数据行 `text-xs text-zinc-500 dark:text-zinc-400` → `text-xs text-text-muted`

错误行 `text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20` → `text-status-error bg-[rgba(229,72,77,0.08)]`

- [ ] **Step 4: 改造 AddServerDialog.tsx**

Backdrop `bg-black/50` → `bg-[rgba(0,0,0,0.85)]`

面板 `bg-white dark:bg-zinc-800 rounded-xl shadow-xl` → `bg-bg-surface rounded-xl shadow-xl border border-border-standard`

标题 `text-lg font-semibold text-zinc-900 dark:text-zinc-100` → `text-lg font-[590] text-text-primary`

关闭按钮 `text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300` → `text-text-muted hover:text-text-secondary`

Labels `text-sm font-medium text-zinc-700 dark:text-zinc-300` → `text-sm font-[510] text-text-secondary`

Inputs `bg-white dark:bg-zinc-700 border-zinc-300 dark:border-zinc-600 text-zinc-900 dark:text-zinc-100` → `bg-[rgba(255,255,255,0.03)] border-border-standard text-text-primary`

Hint `text-xs text-zinc-500` → `text-xs text-text-muted`

Select `bg-white dark:bg-zinc-700 border-zinc-300 dark:border-zinc-600 text-zinc-900 dark:text-zinc-100` → `bg-[rgba(255,255,255,0.03)] border-border-standard text-text-primary`

认证头标签 `bg-zinc-100 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-300` → `bg-[rgba(255,255,255,0.04)] text-text-secondary`

认证头 key/value input 同 Input 替换。

添加按钮 `bg-zinc-100 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200` → `bg-[rgba(255,255,255,0.04)] text-text-secondary hover:bg-[rgba(255,255,255,0.08)]`

删除按钮 `text-red-500 hover:text-red-700` → `text-status-error hover:text-[#d03d42]`

测试结果成功 `bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400` → `bg-[rgba(39,166,68,0.08)] text-status-success`

测试结果失败 `bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400` → `bg-[rgba(229,72,77,0.08)] text-status-error`

操作按钮：
- 测试连接 `bg-zinc-100 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-600` → `bg-[rgba(255,255,255,0.04)] text-text-secondary hover:bg-[rgba(255,255,255,0.08)]`
- 取消同上
- 添加 `bg-blue-600 text-white hover:bg-blue-700` → `bg-accent-brand text-white hover:bg-accent-hover`

- [ ] **Step 5: 改造 DiffViewer.tsx**

容器 `border-zinc-200 dark:border-zinc-700` → `border-border-standard`

Header `bg-zinc-50 dark:bg-zinc-800/50 border-b border-zinc-200 dark:border-zinc-700` → `bg-[rgba(255,255,255,0.03)] border-b border-border-subtle`

文件名 `text-zinc-700 dark:text-zinc-300` → `text-text-secondary`

统计 `text-zinc-400` → `text-text-muted`

接受按钮 `bg-green-600 hover:bg-green-700` → `bg-status-success hover:bg-[#2db84e]`

拒绝按钮 `border-zinc-300 dark:border-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-800` → `border-border-standard hover:bg-[rgba(255,255,255,0.04)]`

新建文件行背景 `bg-green-50 dark:bg-green-950/30` → `bg-[rgba(39,166,68,0.06)]`
+ 号 `text-green-600 dark:text-green-400` → `text-status-success`
内容 `text-green-800 dark:text-green-300` → `text-status-success`

添加行背景同上。
删除行背景 `bg-red-50 dark:bg-red-950/30` → `bg-[rgba(229,72,77,0.06)]`
- 号 `text-red-600 dark:text-red-400` → `text-status-error`
内容 `text-red-800 dark:text-red-300` → `text-status-error`

未修改行 hover `hover:bg-zinc-50 dark:hover:bg-zinc-800/30` → `hover:bg-[rgba(255,255,255,0.03)]`
内容 `text-zinc-600 dark:text-zinc-400` → `text-text-muted`

行号 `text-zinc-400` → `text-text-muted`
行号 border `border-zinc-200 dark:border-zinc-700` → `border-border-subtle`

间隔行 `bg-zinc-100 dark:bg-zinc-800 text-zinc-400` → `bg-[rgba(255,255,255,0.03)] text-text-muted`

加载文字 `text-zinc-400` → `text-text-muted`

- [ ] **Step 6: 验证**

```bash
npm run build
```

- [ ] **Step 7: 提交**

```bash
git add src/app/mcp/page.tsx src/components/mcp/MCPStatusBadge.tsx src/components/mcp/ServerCard.tsx src/components/mcp/AddServerDialog.tsx src/components/common/DiffViewer.tsx
git commit -m "feat: restyle MCP page and shared components to Linear design

MCP management page, server cards, add dialog, diff viewer,
status badge — all migrated to token-based Linear palette.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 6: 最终验证与清理

**Files:**
- None (verification only)

- [ ] **Step 1: 全量构建验证**

```bash
npm run build
```

Expected: 构建成功，无 TypeScript 错误

- [ ] **Step 2: ESLint 检查**

```bash
npm run lint
```

Expected: 无新 lint 错误

- [ ] **Step 3: 视觉验证**

启动 dev server 并在浏览器中检查 4 个页面：
- `http://localhost:3000` — 首页深色背景、品牌靛蓝 CTA、半透明卡片
- `http://localhost:3000/chat/[sessionId]` — 聊天气泡颜色、工具卡片、输入框
- `http://localhost:3000/editor/[sessionId]` — 编辑器面板、终端、AI 面板
- `http://localhost:3000/mcp` — MCP 管理页统计卡片、Server 列表

检查要点：
1. 背景色为 `#08090a`（非纯黑）
2. 边框为半透明白色（非实色）
3. CTA 按钮为 `#5e6ad2`（非 blue-600）
4. 字体为 Inter Variable（非 Geist）
5. 链接为 `#a8b1ff`（非 blue-600）
6. 无残留的 `zinc-*` dark mode 类名

- [ ] **Step 4: 搜索残留旧样式**

```bash
grep -rn "bg-blue-600\|bg-blue-700\|border-blue-\|text-blue-600\|text-blue-400\|bg-zinc-50\|bg-zinc-900\|bg-zinc-800\|border-zinc-700\|border-zinc-200\|text-zinc-400\|text-zinc-500\|text-zinc-600\|text-zinc-700\|text-zinc-800\|text-zinc-900\|font-medium\|font-bold" src/ --include="*.tsx" | grep -v "node_modules" | head -30
```

Expected: 结果为空或仅剩无关项（如第三方组件、无关样式）。如有残留，修复后提交。

- [ ] **Step 5: 最终提交（如有修复）**

```bash
git add -A
git commit -m "chore: final cleanup of Linear design system migration

Remove any remaining Zinc/Blue references, ensure consistent
token usage across all components.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```
