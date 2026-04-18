# Linear 风格设计系统改造

## 概述

将 Cloud CDE Agent 的前端 UI 从标准 Zinc 暗色主题改造为 DESIGN.md 中定义的 Linear 风格设计系统。覆盖全部 4 个页面（首页、聊天页、编辑器页、MCP 管理页），采用渐进式逐页改造策略。

## 设计决策

| 决策项 | 选择 | 理由 |
|--------|------|------|
| 字体 | Inter Variable 本地文件 | 性能最佳，无外部依赖 |
| Token 策略 | 先建 CSS 变量 token 再改页面 | 可维护性好，全局一致 |
| 图标 | 保留 Emoji | 用户偏好，直观易懂 |
| 链接色 | #a8b1ff（区别于用户气泡 #5e6ad2） | 视觉区分度高，避免与用户消息混淆 |
| 实施路径 | 渐进式逐页改造 | 每步可验证，风险低 |

## Token 系统

### 背景层级
- `--bg-marketing`: `#08090a` — 最深层页面背景
- `--bg-panel`: `#0f1011` — 侧边栏、面板
- `--bg-surface`: `#191a1b` — 卡片、下拉框
- `--bg-hover`: `#28282c` — 悬停状态

### 文字层级
- `--text-primary`: `#f7f8f8` — 标题、主文字
- `--text-secondary`: `#d0d6e0` — 正文、描述
- `--text-tertiary`: `#8a8f98` — 次要信息
- `--text-muted`: `#62666d` — 禁用、元数据

### 品牌色
- `--accent-brand`: `#5e6ad2` — CTA 背景按钮、用户消息气泡
- `--accent-interactive`: `#7170ff` — 激活态、选中断点
- `--accent-hover`: `#828fff` — CTA 悬停态
- `--accent-link`: `#a8b1ff` — 链接默认色（与用户气泡拉开视觉距离）
- `--accent-link-hover`: `#c7cdff` — 链接悬停色

### 边框
- `--border-subtle`: `rgba(255,255,255,0.05)` — 最细微分隔
- `--border-standard`: `rgba(255,255,255,0.08)` — 卡片、输入框标准边框
- `--border-solid`: `#23252a` — 需要实色时的边框

### 状态色
- `--status-success`: `#27a644`
- `--status-error`: `#e5484d`
- `--status-warning`: `#f5a623`

### 组件表面
- 按钮背景（ghost）: `rgba(255,255,255,0.02)` ~ `rgba(255,255,255,0.05)`
- 卡片背景: `rgba(255,255,255,0.02)` ~ `rgba(255,255,255,0.03)`
- 对话框/overlay: `rgba(0,0,0,0.85)`

## 字体规范

- **主字体**: Inter Variable，本地 woff2 文件，通过 next/font 加载
- **等宽字体**: Berkeley Mono 回退 ui-monospace、SF Mono、Menlo
- **OpenType 特性**: `font-feature-settings: "cv01", "ss03"` — 几何化字形
- **字重体系**: 400（正文）、510（UI 强调）、590（标题强调）
- **Display 字距**: 48px → -1.056px, 32px → -0.704px，24px 以下恢复自然
- **行高**: Display 级 1.00，正文 1.50~1.60

## 页面改造细则

### 首页 (src/app/page.tsx)

**改动范围**: 背景、标题、会话列表卡片、按钮、技能面板、安装对话框

| 元素 | 当前 | 改造后 |
|------|------|--------|
| 页面背景 | bg-zinc-50 dark:bg-zinc-950 | #08090a |
| 标题 | text-2xl font-bold | text-[24px] font-[510] tracking-[-0.288px] |
| 副标题 | text-sm text-zinc-500 | text-[15px] color:#8a8f98 |
| 新建按钮 | bg-blue-600 | bg-[#5e6ad2] hover:bg-[#828fff] |
| 卡片容器 | bg-white dark:bg-zinc-900 border-zinc-800 | bg-[rgba(255,255,255,0.02)] border-[rgba(255,255,255,0.08)] |
| 列表分隔线 | divide-zinc-100 | divide-[rgba(255,255,255,0.03)] |
| Ghost 按钮 | border-zinc-200 bg-transparent | bg-[rgba(255,255,255,0.02)] border-[rgba(255,255,255,0.08)] |
| 技能开关 | bg-blue-600 | bg-[#5e6ad2] |
| 安装对话框 backdrop | bg-black/40 | bg-[rgba(0,0,0,0.85)] |
| 安装对话框面板 | bg-white dark:bg-zinc-900 | bg-[#191a1b] |

### 聊天页 (ChatPanel + ChatMessage + ChatInput)

**改动范围**: 消息气泡、工具调用卡片、输入框、状态指示、空状态

| 元素 | 当前 | 改造后 |
|------|------|--------|
| 用户气泡 | bg-blue-600 | bg-[#5e6ad2] |
| AI 气泡 | bg-zinc-100 dark:bg-zinc-800 | bg-[rgba(255,255,255,0.03)] + border-[rgba(255,255,255,0.06)] |
| 系统消息 | bg-yellow-100 | bg-[rgba(245,166,35,0.08)] + border-[rgba(245,166,35,0.2)] |
| 工具调用卡片 | bg-zinc-50 dark:bg-zinc-800/50 | bg-[rgba(255,255,255,0.02)] + border-[rgba(255,255,255,0.08)] |
| 输入框底栏 | bg-white dark:bg-zinc-900 border-zinc-700 | bg-[#0f1011] + border-[rgba(255,255,255,0.06)] |
| 输入框 | bg-zinc-50 border-zinc-300 | bg-[rgba(255,255,255,0.02)] + border-[rgba(255,255,255,0.08)] |
| 发送按钮 | bg-blue-600 | bg-[#5e6ad2] |
| 建议按钮 | border-zinc-200 | bg-[rgba(255,255,255,0.02)] + border-[rgba(255,255,255,0.08)] |
| 审批按钮 | bg-red-600 | bg-[#e5484d] |
| 状态点（思考中） | bg-blue-500 | bg-[#7170ff] |
| 状态点（完成） | bg-green-500 | bg-[#27a644] |
| 状态点（错误） | bg-red-500 | bg-[#e5484d] |
| 链接 | text-blue-600 | color:#a8b1ff + underline + hover:#c7cdff |
| 确认选择按钮 | bg-blue-600 | bg-[#5e6ad2] |

### 编辑器页 (EditorPageContent + EditorPanel + AIPanel + FileTree + TerminalPanel)

**改动范围**: 顶部栏、文件树、编辑区、终端、状态栏、AI 面板

| 元素 | 当前 | 改造后 |
|------|------|--------|
| 顶部栏 | bg-zinc-900 border-zinc-700 | bg-[#0f1011] + border-[rgba(255,255,255,0.06)] |
| 文件树背景 | bg-zinc-50 dark:bg-zinc-900 | bg-[#0f1011] |
| 文件树边框 | border-zinc-700 | border-[rgba(255,255,255,0.05)] |
| 文件选中态 | bg-blue-50 dark:bg-blue-950 text-blue-700 | bg-[rgba(94,106,210,0.08)] color:#828fff |
| 文件悬停态 | hover:bg-zinc-100 dark:hover:bg-zinc-800 | hover:bg-[rgba(255,255,255,0.03)] |
| 底部面板标签栏 | bg-zinc-50 dark:bg-zinc-900 | bg-[#0f1011] |
| 标签激活态 | border-blue-500 | border-[#5e6ad2] |
| 终端背景 | bg-zinc-950 | bg-[#08090a] |
| 终端 $ 符号 | text-cyan-500 | color:#7170ff |
| 终端边框 | border-zinc-800 | border-[rgba(255,255,255,0.05)] |
| 状态栏 | bg-blue-600 | bg-[#5e6ad2] |
| AI 面板边框 | border-zinc-700 | border-[rgba(255,255,255,0.05)] |
| AI 面板背景 | bg-white dark:bg-zinc-950 | bg-[#08090a] |
| AI 面板头栏 | bg-zinc-50 dark:bg-zinc-900 | bg-[#0f1011] |
| AI 输入框 | bg-zinc-50 border-zinc-300 | bg-[rgba(255,255,255,0.02)] + border-[rgba(255,255,255,0.08)] |

### MCP 管理页 (MCPPage + ServerCard + AddServerDialog)

**改动范围**: 页面背景、统计卡片、Server 卡片、添加对话框、说明区

| 元素 | 当前 | 改造后 |
|------|------|--------|
| 页面背景 | bg-zinc-50 dark:bg-zinc-900 | #08090a |
| 统计卡片 | bg-white border-zinc-200 | bg-[rgba(255,255,255,0.02)] + border-[rgba(255,255,255,0.08)] |
| 统计数字（已连接） | text-green-600 | color:#27a644 |
| 统计数字（工具数） | text-blue-600 | color:#7170ff |
| Server 卡片 | border-zinc-200 bg-white | border-[rgba(255,255,255,0.08)] + bg-[rgba(255,255,255,0.02)] |
| Server 连接态 | border-green-200 bg-green-50 | border-[rgba(39,166,68,0.2)] + bg-[rgba(39,166,68,0.04)] |
| Server 错误态 | border-red-200 bg-red-50 | border-[rgba(229,72,77,0.2)] + bg-[rgba(229,72,77,0.04)] |
| 添加按钮 | bg-blue-600 | bg-[#5e6ad2] |
| 添加对话框 | bg-white dark:bg-zinc-800 | bg-[#191a1b] |
| 对话框 backdrop | bg-black/50 | bg-[rgba(0,0,0,0.85)] |
| 输入框 | bg-white dark:bg-zinc-700 | bg-[rgba(255,255,255,0.03)] + border-[rgba(255,255,255,0.08)] |
| 说明区 | bg-blue-50 border-blue-200 | bg-[rgba(94,106,210,0.06)] + border-[rgba(94,106,210,0.2)] |

## DiffViewer 改造 (src/components/common/DiffViewer.tsx)

| 元素 | 当前 | 改造后 |
|------|------|--------|
| 容器 | border-zinc-200 | border-[rgba(255,255,255,0.08)] |
| Header | bg-zinc-50 dark:bg-zinc-800/50 | bg-[rgba(255,255,255,0.03)] |
| 接受按钮 | bg-green-600 | bg-[#27a644] |
| 拒绝按钮 | border-zinc-300 | border-[rgba(255,255,255,0.08)] |
| 添加行背景 | bg-green-50 dark:bg-green-950/30 | bg-[rgba(39,166,68,0.06)] |
| 删除行背景 | bg-red-50 dark:bg-red-950/30 | bg-[rgba(229,72,77,0.06)] |

## MCPStatusBadge 改造 (src/components/mcp/MCPStatusBadge.tsx)

- 状态点从 emoji 圆点改为带颜色的 `span` 元素
- 连接态 `bg-[#27a644]`，错误态 `bg-[#e5484d]`，断开态 `bg-[#3e3e44]`

## 全局样式 (globals.css)

需要新增的 Tailwind @theme inline 变量：
- 所有 `--bg-*` 背景变量
- 所有 `--text-*` 文字变量
- 所有 `--accent-*` 品牌色变量
- 所有 `--border-*` 边框变量
- 所有 `--status-*` 状态色变量
- 字体变量 `--font-sans` → Inter Variable，`--font-mono` → Berkeley Mono 回退链

## 不在范围内

- 功能逻辑改动 — 纯视觉改造，不改变任何行为
- 后端 API — 无改动
- 亮色模式 — 仅关注暗色主题（DESIGN.md 为暗色优先）
- Monaco Editor / xterm 内部样式 — 这些组件自带主题，不做深度定制
- 图片/Logo — 不替换品牌标识
