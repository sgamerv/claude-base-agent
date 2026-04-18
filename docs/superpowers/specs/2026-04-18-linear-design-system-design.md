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

**关于 DESIGN.md 之外的补充色值：**
DESIGN.md 未定义错误色、警告色和链接色。以下值基于 Linear 风格（冷色调、与靛蓝品牌色和谐）补充：
- `#e5484d` 错误红 — 冷调红，与靛蓝色系协调
- `#f5a623` 警告黄 — 琥珀色，DESIGN.md 中未出现但系统消息需要
- `#a8b1ff` / `#c7cdff` 链接色 — 靛蓝的淡紫变体，与用户气泡 `#5e6ad2` 拉开距离

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
- `--status-success`: `#27a644`（来自 DESIGN.md）
- `--status-error`: `#e5484d`（补充值）
- `--status-warning`: `#f5a623`（补充值）

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

## 全局样式改造 (globals.css)

**需要删除/替换的内容：**
- 删除 `:root { --background: #ffffff; --foreground: #171717; }` 和 `@media (prefers-color-scheme: dark)` 覆盖
- 删除 `body { font-family: Arial, Helvetica, sans-serif; }` — 由 next/font 注入的 CSS 变量控制
- 删除 `@theme inline` 中的 `--font-sans: var(--font-geist-sans)` 和 `--font-mono: var(--font-geist-mono)`

**需要新增的 @theme inline 变量：**
- 所有 `--bg-*` 背景变量
- 所有 `--text-*` 文字变量
- 所有 `--accent-*` 品牌色变量
- 所有 `--border-*` 边框变量
- 所有 `--status-*` 状态色变量
- 字体变量 `--font-sans` → Inter Variable CSS 变量，`--font-mono` → Berkeley Mono 回退链

**滚动条样式更新：**
- 滚动条 thumb: `#3e3e44`（匹配 `--border-solid` 附近色值）
- 滚动条 thumb hover: `#52525b`
- 去掉 `@media (prefers-color-scheme: dark)` 条件 — 暗色常驻

**全局链接基础样式（新增）：**
```css
a {
  color: #a8b1ff;
  text-decoration: underline;
  text-underline-offset: 3px;
  text-decoration-color: rgba(168, 177, 255, 0.3);
  transition: all 0.15s;
}
a:hover {
  color: #c7cdff;
  text-decoration-color: rgba(199, 205, 255, 0.6);
  background: rgba(168, 177, 255, 0.08);
  border-radius: 3px;
}
```

## 布局改造 (layout.tsx)

**显式改动：**
- 将 `import { Geist, Geist_Mono } from "next/font/google"` 替换为 Inter Variable 本地字体加载
- 将 `geistSans` 和 `geistMono` 变量替换为 Inter Variable 和等宽字体
- CSS 变量名改为 `--font-inter` 和 `--font-mono`
- `font-feature-settings: "cv01", "ss03"` 在 html 或 body 元素上设置

## 页面改造细则

### 首页 (src/app/page.tsx)

**改动范围**: 背景、标题、会话列表卡片、按钮、技能面板、Badge、安装对话框

| 元素 | 当前 | 改造后 |
|------|------|--------|
| 页面背景 | bg-zinc-50 dark:bg-zinc-950 | #08090a |
| 标题 | text-2xl font-bold | text-[24px] font-[510] tracking-[-0.288px] |
| 副标题 | text-sm text-zinc-500 | text-[15px] color:#8a8f98 |
| 新建按钮 | bg-blue-600 | bg-[#5e6ad2] hover:bg-[#828fff] |
| 卡片容器 | bg-white dark:bg-zinc-900 border-zinc-800 | bg-[rgba(255,255,255,0.02)] border-[rgba(255,255,255,0.08)] |
| 列表分隔线 | divide-zinc-100 | divide-[rgba(255,255,255,0.03)] |
| 技能开关 | bg-blue-600 | bg-[#5e6ad2] |
| 安装对话框 backdrop | bg-black/40 | bg-[rgba(0,0,0,0.85)] |
| 安装对话框面板 | bg-white dark:bg-zinc-900 | bg-[#191a1b] |

**Ghost 按钮统一处理（以下元素全部使用相同模式）：**

所有 `border-zinc-200 dark:border-zinc-700 bg-transparent` 或 `hover:bg-zinc-100 dark:hover:bg-zinc-800` 的按钮，统一改为：
- 默认: `bg-[rgba(255,255,255,0.02)] border-[rgba(255,255,255,0.08)]`
- 悬停: `hover:bg-[rgba(255,255,255,0.04)]`

涉及：聊天按钮、编辑器按钮、取消按钮、预览按钮、卸载按钮（红色变体用 `text-[#e5484d] border-[rgba(229,72,77,0.2)]`）

**Badge 样式改造：**

所有 `bg-*-100 text-*-700 dark:bg-*-900/40 dark:text-*-300` 的 Badge 统一改为半透明风格：
- 内置: `bg-[rgba(94,106,210,0.1)] text-[#828fff]`
- 扩展: `bg-[rgba(113,112,255,0.1)] text-[#a8b1ff]`
- GitHub: `bg-[rgba(255,255,255,0.05)] text-[#d0d6e0]`
- ZIP: `bg-[rgba(245,166,35,0.1)] text-[#f5a623]`
- 本地: `bg-[rgba(39,166,68,0.1)] text-[#27a644]`
- URL: `bg-[rgba(113,112,255,0.1)] text-[#7170ff]`
- SKILL.md: `bg-[rgba(229,72,77,0.1)] text-[#e5484d]`
- 工具数: `text-[#62666d]`

**安装对话框 Tab 激活态：**
- `text-blue-600 border-b-2 border-blue-600` → `text-[#7170ff] border-b-2 border-[#5e6ad2]`

**安全扫描结果：**
- 阻止: `bg-[rgba(229,72,77,0.08)] border-[rgba(229,72,77,0.2)] text-[#e5484d]`
- 警告: `bg-[rgba(245,166,35,0.08)] border-[rgba(245,166,35,0.2)] text-[#f5a623]`

**预览结果：**
- `bg-[rgba(39,166,68,0.08)] border-[rgba(39,166,68,0.2)] text-[#27a644]`

### 聊天页 (ChatPageContent + ChatPanel + ChatMessage + ChatInput)

**改动范围**: 页面容器、顶部栏、消息气泡、工具调用卡片、输入框、状态指示、空状态

#### ChatPageContent 顶部栏（独立于 ChatPanel）

| 元素 | 当前 | 改造后 |
|------|------|--------|
| 页面容器 | bg-white dark:bg-zinc-950 | bg-[#08090a] |
| 顶部栏 | bg-white dark:bg-zinc-900 border-zinc-700 | bg-[#0f1011] + border-[rgba(255,255,255,0.06)] |
| 返回链接 | text-zinc-400 hover:text-zinc-300 | text-[#62666d] hover:text-[#d0d6e0] |
| 标题 | font-medium text-zinc-100 | font-[510] text-[#f7f8f8] |
| 编辑器入口链接 | text-blue-600 dark:text-blue-400 | text-[#a8b1ff] hover:text-[#c7cdff] |
| MCP 状态点（检测中） | bg-yellow-500 | bg-[#f5a623] |
| MCP 状态点（已连接） | bg-green-500 | bg-[#27a644] |
| MCP 状态点（断开） | bg-zinc-400 | bg-[#3e3e44] |
| MCP 状态文字 | text-zinc-500 | text-[#62666d] |
| Session ID | text-zinc-400 font-mono | text-[#3e3e44] font-mono |
| 模型状态点 | bg-blue-500 | bg-[#7170ff] |
| 模型文字 | text-zinc-400 | text-[#62666d] |
| 加载中文字 | text-zinc-400 | text-[#62666d] |

#### ChatPanel + ChatMessage + ChatInput

| 元素 | 当前 | 改造后 |
|------|------|--------|
| 用户气泡 | bg-blue-600 | bg-[#5e6ad2] |
| AI 气泡 | bg-zinc-100 dark:bg-zinc-800 | bg-[rgba(255,255,255,0.03)] + border-[rgba(255,255,255,0.06)] |
| 系统消息 | bg-yellow-100 | bg-[rgba(245,166,35,0.08)] + border-[rgba(245,166,35,0.2)] |
| 工具调用卡片 | bg-zinc-50 dark:bg-zinc-800/50 | bg-[rgba(255,255,255,0.02)] + border-[rgba(255,255,255,0.08)] |
| 工具调用内部 pre | bg-white dark:bg-zinc-900 | bg-[rgba(255,255,255,0.03)] |
| 输入框底栏 | bg-white dark:bg-zinc-900 border-zinc-700 | bg-[#0f1011] + border-[rgba(255,255,255,0.06)] |
| 输入框 | bg-zinc-50 border-zinc-300 | bg-[rgba(255,255,255,0.02)] + border-[rgba(255,255,255,0.08)] |
| 发送按钮 | bg-blue-600 | bg-[#5e6ad2] |
| 建议按钮 | border-zinc-200 | bg-[rgba(255,255,255,0.02)] + border-[rgba(255,255,255,0.08)] |
| 审批允许按钮 | bg-red-600 | bg-[#e5484d] |
| 审批拒绝按钮 | border-zinc-300 | border-[rgba(255,255,255,0.08)] |
| 审批代码块 | bg-red-50 dark:bg-red-950 | bg-[rgba(229,72,77,0.08)] |
| 状态点（思考中） | bg-blue-500 | bg-[#7170ff] |
| 状态点（完成） | bg-green-500 | bg-[#27a644] |
| 状态点（错误） | bg-red-500 | bg-[#e5484d] |
| 链接 | text-blue-600 | color:#a8b1ff + underline + hover:#c7cdff |
| 确认选择按钮 | bg-blue-600 | bg-[#5e6ad2] |
| 选项卡片（选中） | border-blue-500 bg-blue-50 | border-[#5e6ad2] bg-[rgba(94,106,210,0.08)] |
| 选项卡片（未选中） | border-zinc-200 hover:bg-zinc-50 | border-[rgba(255,255,255,0.08)] hover:bg-[rgba(255,255,255,0.03)] |
| 选中文字色 | text-blue-700 | text-[#828fff] |
| 思考中点 | bg-zinc-400 | bg-[#62666d] |

### 编辑器页 (EditorPageContent + EditorPanel + CodeEditor + AIPanel + FileTree + TerminalPanel)

#### EditorPageContent 顶部栏

| 元素 | 当前 | 改造后 |
|------|------|--------|
| 页面容器 | bg-white dark:bg-zinc-950 | bg-[#08090a] |
| 顶部栏 | bg-white dark:bg-zinc-900 border-zinc-700 | bg-[#0f1011] + border-[rgba(255,255,255,0.06)] |
| 返回链接 | text-zinc-400 hover:text-zinc-300 | text-[#62666d] hover:text-[#d0d6e0] |
| 标题 | font-medium text-zinc-100 | font-[510] text-[#f7f8f8] |
| 聊天入口链接 | text-blue-600 dark:text-blue-400 | text-[#a8b1ff] hover:text-[#c7cdff] |
| MCP/Session/模型状态点 | 同 ChatPageContent | 同 ChatPageContent |

#### EditorPanel + CodeEditor + FileTree + TerminalPanel

| 元素 | 当前 | 改造后 |
|------|------|--------|
| 文件树背景 | bg-zinc-50 dark:bg-zinc-900 | bg-[#0f1011] |
| 文件树边框 | border-zinc-700 | border-[rgba(255,255,255,0.05)] |
| 文件树头 | text-zinc-600 dark:text-zinc-400 uppercase | text-[#62666d] uppercase letter-spacing |
| 文件选中态 | bg-blue-50 dark:bg-blue-950 text-blue-700 | bg-[rgba(94,106,210,0.08)] color:#828fff |
| 文件悬停态 | hover:bg-zinc-100 dark:hover:bg-zinc-800 | hover:bg-[rgba(255,255,255,0.03)] |
| **代码编辑器标签栏** | bg-zinc-50 dark:bg-zinc-900 border-zinc-700 | bg-[#0f1011] + border-[rgba(255,255,255,0.06)] |
| **标签页** | bg-white dark:bg-zinc-800 border-r border-zinc-700 | bg-[rgba(255,255,255,0.04)] + border-[rgba(255,255,255,0.06)] |
| **修改指示点** | bg-orange-500 | bg-[#f5a623] |
| **保存链接** | text-blue-600 | text-[#a8b1ff] |
| **Monaco fontFamily** | 'Geist Mono', 'Fira Code' | 'Berkeley Mono', ui-monospace, SF Mono, Menlo |
| 底部面板标签栏 | bg-zinc-50 dark:bg-zinc-900 | bg-[#0f1011] |
| 标签激活态 | border-blue-500 | border-[#5e6ad2] |
| 终端背景 | bg-zinc-950 | bg-[#08090a] |
| 终端 $ 符号 | text-cyan-500 | color:#7170ff |
| 终端边框 | border-zinc-800 | border-[rgba(255,255,255,0.05)] |
| 终端文字 | text-zinc-300 | text-[#d0d6e0] |
| 终端 ANSI 绿 | text-green-500 | text-[#27a644] |
| 终端 ANSI 青 | text-cyan-500 | text-[#7170ff] |
| 终端 ANSI 红 | text-red-500 | text-[#e5484d] |
| 终端 ANSI 黄 | text-yellow-500 | text-[#f5a623] |
| 终端 ANSI 灰 | text-zinc-500 | text-[#62666d] |
| 状态栏 | bg-blue-600 | bg-[#5e6ad2] |
| 底部面板关闭按钮 | text-zinc-400 hover:text-zinc-300 | text-[#62666d] hover:text-[#d0d6e0] |

#### AIPanel 详细改造

| 元素 | 当前 | 改造后 |
|------|------|--------|
| AI 面板边框 | border-zinc-700 | border-[rgba(255,255,255,0.05)] |
| AI 面板背景 | bg-white dark:bg-zinc-950 | bg-[#08090a] |
| AI 面板头栏 | bg-zinc-50 dark:bg-zinc-900 border-zinc-700 | bg-[#0f1011] + border-[rgba(255,255,255,0.05)] |
| AI 面板标题 | text-zinc-600 dark:text-zinc-400 | text-[#8a8f98] font-[510] |
| AI 状态文字 | text-blue-500 | text-[#7170ff] |
| 折叠态背景 | bg-zinc-50 dark:bg-zinc-900 | bg-[#0f1011] |
| 折叠态边框 | border-zinc-200 dark:border-zinc-700 | border-[rgba(255,255,255,0.05)] |
| 折叠态状态点 | bg-blue-500 | bg-[#7170ff] |
| **用户内联消息** | bg-blue-600 text-white | bg-[#5e6ad2] text-white |
| **系统内联消息** | bg-yellow-100 text-yellow-800 dark:bg-yellow-900 | bg-[rgba(245,166,35,0.08)] text-[#f5a623] |
| **AI 内联消息** | bg-zinc-100 text-zinc-900 dark:bg-zinc-800 | bg-[rgba(255,255,255,0.03)] text-[#d0d6e0] |
| **内联工具卡片** | bg-zinc-50 dark:bg-zinc-800/50 border-zinc-700 | bg-[rgba(255,255,255,0.02)] border-[rgba(255,255,255,0.08)] |
| **审批卡片** | border-red-200 dark:border-red-800 | border-[rgba(229,72,77,0.2)] |
| **审批允许按钮** | bg-red-600 | bg-[#e5484d] |
| **审批代码块** | bg-red-50 dark:bg-red-950 | bg-[rgba(229,72,77,0.08)] |
| **Diff 预览头** | bg-blue-50 dark:bg-blue-950 | bg-[rgba(94,106,210,0.06)] |
| 快捷指令按钮 | border-zinc-200 dark:border-zinc-700 | border-[rgba(255,255,255,0.08)] |
| 快捷指令 hover | hover:bg-zinc-100 dark:hover:bg-zinc-800 | hover:bg-[rgba(255,255,255,0.03)] |
| AI 输入框 | bg-zinc-50 border-zinc-300 | bg-[rgba(255,255,255,0.02)] border-[rgba(255,255,255,0.08)] |
| AI 发送按钮 | bg-blue-600 | bg-[#5e6ad2] |
| **提问选项卡片（选中）** | border-blue-500 bg-blue-50 | border-[#5e6ad2] bg-[rgba(94,106,210,0.08)] |
| **提问选项卡片（未选中）** | border-zinc-200 | border-[rgba(255,255,255,0.08)] |
| **提问确认按钮** | bg-blue-600 | bg-[#5e6ad2] |
| **提问选中文字** | text-blue-700 | text-[#828fff] |

### MCP 管理页 (MCPPage + ServerCard + AddServerDialog)

| 元素 | 当前 | 改造后 |
|------|------|--------|
| 页面背景 | bg-zinc-50 dark:bg-zinc-900 | #08090a |
| 返回链接 | text-zinc-500 hover:text-zinc-700 | text-[#62666d] hover:text-[#d0d6e0] |
| 页面标题 | font-bold text-zinc-100 | font-[510] text-[#f7f8f8] |
| 添加按钮 | bg-blue-600 | bg-[#5e6ad2] hover:bg-[#828fff] |
| 统计卡片 | bg-white border-zinc-200 | bg-[rgba(255,255,255,0.02)] + border-[rgba(255,255,255,0.08)] |
| 统计标签 | text-zinc-500 | text-[#62666d] |
| 统计数字 | text-zinc-900 | text-[#f7f8f8] |
| 统计数字（已连接） | text-green-600 | color:#27a644 |
| 统计数字（工具数） | text-blue-600 | color:#7170ff |
| Server 卡片 | border-zinc-200 bg-white | border-[rgba(255,255,255,0.08)] + bg-[rgba(255,255,255,0.02)] |
| Server 连接态 | border-green-200 bg-green-50 | border-[rgba(39,166,68,0.2)] + bg-[rgba(39,166,68,0.04)] |
| Server 错误态 | border-red-200 bg-red-50 | border-[rgba(229,72,77,0.2)] + bg-[rgba(229,72,77,0.04)] |
| Server 操作按钮 | bg-zinc-100 text-zinc-600 | bg-[rgba(255,255,255,0.04)] text-[#d0d6e0] |
| Server 标签 | bg-zinc-100 text-zinc-500 | bg-[rgba(255,255,255,0.04)] text-[#62666d] |
| Server 错误文字 | text-red-600 bg-red-50 | text-[#e5484d] bg-[rgba(229,72,77,0.08)] |
| 删除按钮确认态 | bg-red-500 text-white | bg-[#e5484d] text-white |
| 内置标签 | bg-blue-100 text-blue-600 | bg-[rgba(94,106,210,0.1)] text-[#828fff] |
| 添加对话框 | bg-white dark:bg-zinc-800 | bg-[#191a1b] |
| 对话框 backdrop | bg-black/50 | bg-[rgba(0,0,0,0.85)] |
| 对话框输入框 | bg-white dark:bg-zinc-700 border-zinc-600 | bg-[rgba(255,255,255,0.03)] + border-[rgba(255,255,255,0.08)] |
| 对话框标签 | text-zinc-700 | text-[#d0d6e0] |
| 对话框 select | bg-white dark:bg-zinc-700 | bg-[rgba(255,255,255,0.03)] |
| 认证头标签 | bg-zinc-100 text-zinc-600 | bg-[rgba(255,255,255,0.04)] text-[#d0d6e0] |
| 测试结果成功 | bg-green-50 text-green-700 | bg-[rgba(39,166,68,0.08)] text-[#27a644] |
| 测试结果失败 | bg-red-50 text-red-700 | bg-[rgba(229,72,77,0.08)] text-[#e5484d] |
| 说明区 | bg-blue-50 border-blue-200 | bg-[rgba(94,106,210,0.06)] + border-[rgba(94,106,210,0.2)] |
| 空状态文字 | text-zinc-500 | text-[#62666d] |

## DiffViewer 改造 (src/components/common/DiffViewer.tsx)

| 元素 | 当前 | 改造后 |
|------|------|--------|
| 容器 | border-zinc-200 | border-[rgba(255,255,255,0.08)] |
| Header | bg-zinc-50 dark:bg-zinc-800/50 | bg-[rgba(255,255,255,0.03)] |
| Header 边框 | border-zinc-700 | border-[rgba(255,255,255,0.06)] |
| 接受按钮 | bg-green-600 | bg-[#27a644] |
| 拒绝按钮 | border-zinc-300 | border-[rgba(255,255,255,0.08)] |
| 添加行背景 | bg-green-50 dark:bg-green-950/30 | bg-[rgba(39,166,68,0.06)] |
| 添加行文字 | text-green-800 dark:text-green-300 | text-[#27a644] |
| 删除行背景 | bg-red-50 dark:bg-red-950/30 | bg-[rgba(229,72,77,0.06)] |
| 删除行文字 | text-red-800 dark:text-red-300 | text-[#e5484d] |
| 行号 | text-zinc-400 border-zinc-200 | text-[#62666d] border-[rgba(255,255,255,0.06)] |
| 间隔行 | bg-zinc-100 dark:bg-zinc-800 | bg-[rgba(255,255,255,0.03)] |

## MCPStatusBadge 改造 (src/components/mcp/MCPStatusBadge.tsx)

- 状态点从 emoji 圆点改为带颜色的 `span` 元素
- 连接态 `bg-[#27a644]`，错误态 `bg-[#e5484d]`，断开态 `bg-[#3e3e44]`
- 状态文字 `text-[#62666d]`

## Typography 全局处理

由于 `layout.tsx` 会设置全局 `font-family: Inter Variable`，大部分文字会自动继承新字体。以下元素需要显式调整字重和间距：

| 元素位置 | 改造 |
|----------|------|
| 首页标题 | font-bold → font-[510], 添加 tracking |
| 各页面 h1 | font-medium/font-bold → font-[510] |
| 卡片/面板标题 | font-medium → font-[510] |
| 标签/小标题 | font-medium → font-[510] (保持 12-13px 尺寸) |
| 按钮文字 | font-medium → font-[510] |
| 正文/描述 | font-normal 保持 400 |
| 代码/mono | 确认使用 font-mono CSS 变量 |

## 不在范围内

- 功能逻辑改动 — 纯视觉改造，不改变任何行为
- 后端 API — 无改动
- 亮色模式 — 仅关注暗色主题（DESIGN.md 为暗色优先），去掉 `@media (prefers-color-scheme: dark)` 条件分支
- Monaco Editor 内部渲染样式 — 不定制 Monaco 主题
- xterm 内部样式 — TerminalPanel 使用自定义渲染，已在范围内
- 图片/Logo — 不替换品牌标识
