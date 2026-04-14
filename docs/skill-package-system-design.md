# Skill 包管理系统设计文档

> **版本**: v1.0  
> **日期**: 2026-04-12  
> **状态**: 设计中  
> **依赖**: Phase 5 Skill 系统（已完成）

---

## 1. 背景与动机

当前 Skill 市场是**硬编码**在 `src/lib/skill/market.ts` 中的，新增 Skill 必须修改源码并重新部署。这导致：

1. **无法动态扩展** — 用户不能按需安装第三方 Skill
2. **无法复用生态** — 业界已有大量成熟 Skill（如 Anthropic 官方 skills 仓库、SkillHub 市场等），它们遵循 `SKILL.md` 规范
3. **安装方式单一** — 只有前端 UI 点击安装，不支持从 URL、ZIP、GitHub 仓库等来源安装

### 业界现状

| 平台 | Skill 格式 | 安装方式 | Skill 市场 |
|------|-----------|---------|-----------|
| **Claude Code** | `SKILL.md` (YAML frontmatter + Markdown) | `.claude/skills/` 目录 / GitHub 仓库 | anthropics/skills |
| **CodeBuddy** | `SKILL.md` (YAML frontmatter + Markdown) | `.codebuddy/skills/` 目录 / SkillHub | SkillHub (1.2万+ Skills) |
| **OpenClaw** | `SKILL.md` (AgentSkills 兼容) | `skills/` 目录 | 内置 |
| **AgentSkills.io** | `SKILL.md` (标准化规范) | 目录 + ZIP | 开放市场 |

**核心共识**：业界统一的 Skill 格式是 `SKILL.md`，包含 YAML frontmatter（元数据）+ Markdown（指令）。

---

## 2. 设计目标

| 目标 | 说明 |
|------|------|
| **兼容 SKILL.md 规范** | 支持解析业界标准的 SKILL.md 文件，自动转换为内部 Skill 模型 |
| **多来源安装** | 支持从 ZIP 包、GitHub 仓库 URL、本地目录安装 |
| **安全扫描** | 安装前扫描 Skill 内容，检测潜在风险 |
| **零代码安装** | 用户无需修改源码，通过 UI 或 API 即可完成安装 |
| **向后兼容** | 现有硬编码的内置 Skill 和扩展 Skill 继续正常工作 |

---

## 3. SKILL.md 规范与内部模型映射

### 3.1 SKILL.md 格式（AgentSkills 兼容）

```markdown
---
name: brainstorming
description: "探索用户意图、需求和设计，在实现之前进行头脑风暴"
license: MIT
compatibility: 无特殊依赖
metadata:
  author: anthropics
  version: "1.0"
  category: design
allowed-tools: Read Write Bash
---

# 头脑风暴

你是一个创意思维专家。当用户需要...

## 工作流程
1. 探索项目上下文
2. 提出澄清问题
3. 提出 2-3 个方案
...
```

### 3.2 内部模型扩展

现有 `Skill` 接口需要扩展，增加 `source` 和 `skillMd` 字段：

```typescript
interface Skill {
  id: string;
  name: string;
  description: string;
  icon: string;
  version: string;
  author: string;
  category: "built-in" | "extension";
  tools: SkillToolDefinition[];
  systemPromptAddon?: string;
  installedAt?: number;
  enabled: boolean;

  // === 新增：包管理字段 ===
  source?: SkillSource;          // 安装来源
  skillMdPath?: string;          // SKILL.md 文件在 skills/ 目录中的相对路径
}

interface SkillSource {
  type: "market" | "zip" | "github" | "local" | "url";
  url?: string;        // GitHub URL 或 ZIP 下载 URL
  ref?: string;        // Git 分支/tag/commit
  installedAt: number; // 安装时间
  checksum?: string;   // ZIP 包 SHA256 校验和
}
```

### 3.3 SKILL.md → Skill 转换规则

SKILL.md 本质是**纯 Prompt 型 Skill**（不包含工具定义），它通过增强 System Prompt 来赋予 LLM 新能力。转换规则：

| SKILL.md 字段 | 映射到 Skill 字段 | 说明 |
|---------------|------------------|------|
| `name` | `id` + `name` | id 取 kebab-case，name 取原文 |
| `description` | `description` | 直接映射 |
| `metadata.author` | `author` | 默认 "unknown" |
| `metadata.version` | `version` | 默认 "1.0.0" |
| `metadata.category` | `category` | 非标准字段，默认 "extension" |
| Markdown 正文 | `systemPromptAddon` | SKILL.md 的指令内容注入到 System Prompt |
| `allowed-tools` | `tools` | 转换为虚拟工具定义（见 3.4） |

### 3.4 allowed-tools → 工具定义转换

SKILL.md 的 `allowed-tools` 声明了该 Skill 需要使用哪些已有工具。这不是"新工具定义"，而是**权限声明**。我们将其转换为一个虚拟工具，让 LLM 知道可以使用这些能力：

```typescript
// SKILL.md 中: allowed-tools: Read Write Bash
// 转换为:
{
  name: "skill_brainstorming",  // skill_{skillId}
  description: `头脑风暴技能。${description}。可用工具: Read, Write, Bash`,
  parameters: {
    type: "object",
    properties: {
      action: {
        type: "string",
        description: "执行的动作（自动推断，无需指定）",
      },
    },
    required: [],
  },
  handler: "local",
}
```

在 executor 中，`skill_*` 工具的处理器直接返回 SKILL.md 的 Prompt 内容，引导 LLM 按照指令执行：

```typescript
async skill_brainstorming(input: Record<string, string>): Promise<ToolResult> {
  const prompt = loadSkillPrompt("brainstorming"); // 读取 SKILL.md 正文
  return { success: true, content: prompt };
}
```

**更优方案**：不创建虚拟工具，而是将 SKILL.md 的内容直接注入到 System Prompt（通过 `systemPromptAddon`），让 LLM 自然地使用已有工具。这与 CodeBuddy / Claude Code 的行为一致。此时 `tools` 数组为空，Skill 纯粹作为 Prompt 增强存在。

**选择方案 2**（Prompt 注入），因为：
- 业界主流做法（Claude Code、CodeBuddy 都是这么工作的）
- 避免创建无意义的虚拟工具
- LLM 根据 Prompt 指令自然调用已有工具

---

## 4. Skill 包目录结构

安装后的 Skill 存放在 `skills/` 目录（项目根目录下）：

```
项目根目录/
├── skills/                          # Skill 包存储目录
│   ├── brainstorming/               # 一个已安装的 Skill
│   │   ├── SKILL.md                 # 必需：元数据 + 指令
│   │   ├── scripts/                 # 可选：脚本
│   │   ├── references/              # 可选：参考文档
│   │   └── assets/                  # 可选：资源文件
│   ├── documentation-writer/
│   │   └── SKILL.md
│   └── pdf/
│       ├── SKILL.md
│       └── scripts/
│           └── pdf-tool.py
├── data/
│   └── skills.json                  # 持久化：已安装 Skill 的元数据
└── ...
```

`skills/` 目录纳入 `.gitignore`（类似 `node_modules/`），安装是运行时操作。

---

## 5. 安装来源与流程

### 5.1 从 ZIP 包安装

```
用户上传 ZIP 包
    │
    ▼
解压到临时目录
    │
    ├── 验证 SKILL.md 存在
    ├── 解析 YAML frontmatter
    ├── 安全扫描（检查 scripts/ 中的可疑代码）
    │
    ▼
复制到 skills/{skill-name}/
    │
    ├── 更新 data/skills.json
    └── 返回安装结果
```

ZIP 包结构要求：
```
skill-name.zip
├── SKILL.md          # 必需
├── scripts/          # 可选
├── references/       # 可选
└── assets/           # 可选
```

### 5.2 从 GitHub 仓库安装

支持以下 URL 格式：

| 格式 | 示例 |
|------|------|
| 仓库根目录 | `https://github.com/anthropics/skills` |
| 子目录 | `https://github.com/anthropics/skills/tree/main/skills/brainstorming` |
| 带 ref | `https://github.com/anthropics/skills/tree/v1.0/skills/brainstorming` |

安装流程：

```
用户输入 GitHub URL
    │
    ▼
解析 URL → 提取 owner/repo/path/ref
    │
    ▼
通过 GitHub API 获取仓库内容
    │
    ├── URL 指向仓库根 → 扫描 skills/ 子目录 → 展示可安装列表
    ├── URL 指向单个 Skill 目录 → 直接下载该目录
    │
    ▼
下载文件内容到临时目录
    │
    ├── 验证 SKILL.md 存在
    ├── 解析 + 安全扫描
    │
    ▼
复制到 skills/{skill-name}/
    │
    ├── 更新 data/skills.json
    └── 返回安装结果
```

### 5.3 从本地目录安装

```
用户指定本地路径
    │
    ▼
验证路径存在且包含 SKILL.md
    │
    ▼
复制到 skills/{skill-name}/
    │
    ├── 更新 data/skills.json
    └── 返回安装结果
```

### 5.4 从 URL 安装（ZIP 下载链接）

```
用户输入 ZIP 下载 URL
    │
    ▼
下载 ZIP 到临时文件
    │
    ▼
走 ZIP 包安装流程
```

---

## 6. 安全扫描

安装前对 Skill 内容进行安全检查：

| 检查项 | 级别 | 说明 |
|--------|------|------|
| SKILL.md 格式 | 必须 | 验证 YAML frontmatter 的 name/description 字段 |
| 脚本文件扫描 | 警告 | 检查 scripts/ 中的可执行文件，标记 `rm -rf`、`curl|sh`、`eval` 等危险模式 |
| Prompt 注入检测 | 警告 | 检测 SKILL.md 中是否有试图覆盖系统指令的内容 |
| 文件大小限制 | 必须 | 单个 Skill 包不超过 5MB |
| 文件数量限制 | 必须 | 单个 Skill 包不超过 50 个文件 |

安全扫描结果分为三级：
- **通过** — 无风险项，自动安装
- **警告** — 存在潜在风险，向用户展示风险项，等待确认
- **拒绝** — 存在严重风险（如恶意代码），拒绝安装

---

## 7. API 设计

### 7.1 安装 API

```
POST /api/skills/install
Content-Type: application/json

// 从 GitHub 安装
{ "source": { "type": "github", "url": "https://github.com/anthropics/skills/tree/main/skills/brainstorming" } }

// 从 ZIP URL 安装
{ "source": { "type": "url", "url": "https://example.com/skills/brainstorming.zip" } }

// 从本地路径安装
{ "source": { "type": "local", "path": "/tmp/brainstorming" } }

// Response
{
  "skill": { "id": "brainstorming", "name": "brainstorming", ... },
  "securityScan": {
    "status": "pass" | "warning" | "block",
    "issues": [{ "level": "warning", "message": "..." }]
  }
}
```

### 7.2 ZIP 上传安装

```
POST /api/skills/install/upload
Content-Type: multipart/form-data

file: <zip-file>

// Response 同上
```

### 7.3 卸载 API（已有，扩展支持）

```
DELETE /api/skills/{id}

// 扩展：同时删除 skills/{id}/ 目录和 data/skills.json 中的记录
```

### 7.4 扫描 Skill 包（预览）

```
POST /api/skills/scan
Content-Type: application/json

{ "source": { "type": "github", "url": "..." } }

// Response
{
  "skillPreview": { "name": "...", "description": "..." },
  "securityScan": {
    "status": "pass" | "warning" | "block",
    "issues": [...]
  },
  "fileCount": 5,
  "totalSize": "12KB"
}
```

---

## 8. 核心模块设计

### 8.1 新增文件清单

| 文件 | 职责 |
|------|------|
| `src/lib/skill/parser.ts` | SKILL.md 解析器：YAML frontmatter + Markdown 提取 |
| `src/lib/skill/installer.ts` | 安装引擎：多来源下载、解压、安全扫描、注册 |
| `src/lib/skill/scanner.ts` | 安全扫描器：脚本检测、Prompt 注入检测 |
| `src/app/api/skills/install/route.ts` | 安装 API Route（JSON body） |
| `src/app/api/skills/install/upload/route.ts` | ZIP 上传安装 API Route |

### 8.2 修改文件清单

| 文件 | 修改内容 |
|------|---------|
| `src/lib/skill/types.ts` | 新增 `SkillSource` 接口，`Skill` 接口增加 `source`、`skillMdPath` 字段 |
| `src/lib/skill/registry.ts` | `getEnabledSkillPromptAddons()` 增加从 `skills/` 目录读取 SKILL.md 内容 |
| `src/lib/skill/market.ts` | 保留现有硬编码市场，新增"已安装自定义 Skill"合并逻辑 |
| `src/lib/skill/executor.ts` | 无需修改（SKILL.md 型 Skill 不注册工具处理器） |
| `src/app/api/skills/[id]/route.ts` | `DELETE` 处理增加删除 `skills/{id}/` 目录 |
| `src/app/page.tsx` | 首页 Skill 面板增加"安装自定义 Skill"入口 |
| `.gitignore` | 添加 `skills/` 目录 |

### 8.3 SKILL.md 解析器 (`parser.ts`)

```typescript
interface ParsedSkillMd {
  name: string;
  description: string;
  license?: string;
  compatibility?: string;
  metadata: Record<string, string>;
  allowedTools: string[];
  promptContent: string;  // Markdown 正文
}

function parseSkillMd(content: string): ParsedSkillMd;
function convertToSkill(parsed: ParsedSkillMd, source: SkillSource): Skill;
```

### 8.4 安装引擎 (`installer.ts`)

```typescript
interface InstallSource {
  type: "zip" | "github" | "local" | "url";
  url?: string;
  path?: string;
  ref?: string;
}

interface InstallResult {
  skill: Skill;
  scanResult: SecurityScanResult;
}

async function installSkillFromSource(source: InstallSource): Promise<InstallResult>;
async function installFromZip(zipPath: string): Promise<InstallResult>;
async function installFromGitHub(url: string, ref?: string): Promise<InstallResult>;
async function installFromLocal(localPath: string): Promise<InstallResult>;
```

### 8.5 Registry 改造 (`registry.ts`)

核心改动：`getEnabledSkillPromptAddons()` 需要从两个来源合并 Prompt：

```typescript
async function getEnabledSkillPromptAddons(): Promise<string[]> {
  const addons: string[] = [];
  const skills = await getInstalledSkills();
  
  for (const skill of skills) {
    if (!skill.enabled) continue;
    
    // 1. 传统 Skill：使用硬编码的 systemPromptAddon
    if (skill.systemPromptAddon) {
      addons.push(skill.systemPromptAddon);
    }
    
    // 2. SKILL.md 型 Skill：从 skills/ 目录读取 Prompt 内容
    if (skill.skillMdPath) {
      const promptContent = await readSkillMdPrompt(skill.skillMdPath);
      if (promptContent) {
        addons.push(promptContent);
      }
    }
  }
  
  return addons;
}
```

---

## 9. 前端 UI 设计

### 9.1 首页 Skill 面板扩展

在现有 Skill 面板底部增加"安装自定义 Skill"入口：

```
┌─────────────────────────────────────────────────────────┐
│  🧩 已安装技能                          [浏览更多 →]    │
├─────────────────────────────────────────────────────────┤
│  ...已有 Skill 卡片...                                   │
│                                                         │
│  ┌───────────────────────────────────────────────────┐ │
│  │  ➕ 安装自定义 Skill                               │ │
│  │                                                   │ │
│  │  [📦 上传 ZIP]  [🔗 从 URL 安装]  [📁 本地路径]    │ │
│  │                                                   │ │
│  │  ┌─────────────────────────────────────────────┐ │ │
│  │  │ GitHub URL 或 ZIP 下载链接                    │ │ │
│  │  └─────────────────────────────────────────────┘ │ │
│  │                                        [安装 →]   │ │
│  └───────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

### 9.2 安装流程交互

1. 用户选择安装方式（ZIP 上传 / URL / 本地路径）
2. 填写来源信息
3. 点击"安装"→ 调用 `/api/skills/scan` 预览
4. 展示预览信息（Skill 名称、描述、文件数、安全扫描结果）
5. 如果有安全警告，展示警告项，等待确认
6. 确认安装 → 调用 `/api/skills/install`
7. 安装成功 → 刷新 Skill 列表

---

## 10. 开发路线

### Phase 7A: SKILL.md 解析与 Prompt 注入（核心） ✅

**目标**：支持将 SKILL.md 格式的 Skill 安装到系统，并通过 Prompt 注入让 LLM 使用

- [x] **7A.1 扩展数据模型**
  - [x] `src/lib/skill/types.ts` — 新增 `SkillSource` 接口，`Skill` 增加 `source`、`skillMdPath` 字段
  - [x] `.gitignore` — 添加 `skills/` 目录

- [x] **7A.2 SKILL.md 解析器**
  - [x] `src/lib/skill/parser.ts` — `parseSkillMd()` 解析 YAML frontmatter + Markdown 正文
  - [x] `convertToSkill()` — 将解析结果转换为内部 Skill 模型（无工具，Prompt 注入模式）

- [x] **7A.3 Registry 改造**
  - [x] `src/lib/skill/registry.ts` — `getEnabledSkillPromptAddons()` 增加从 `skills/` 目录读取 SKILL.md
  - [x] `getInstalledSkills()` 合并硬编码 Skill 和 `skills/` 目录中的自定义 Skill

- [x] **7A.4 安装引擎 — 本地路径**
  - [x] `src/lib/skill/installer.ts` — `installFromLocal()` 复制目录到 `skills/` + 注册到 JSON
  - [x] 安全扫描基础框架 (`scanner.ts`) — 文件大小/数量检查 + 危险脚本模式 + Prompt 注入检测

- [x] **7A.5 API Route**
  - [x] `POST /api/skills/install` — 安装入口（支持 `local` 类型 + Phase 5 兼容）
  - [x] `DELETE /api/skills/{id}` — 扩展卸载逻辑，删除 `skills/{id}/` 目录

- [x] **7A.6 验证**
  - [x] 创建 `skills/brainstorming/SKILL.md` 测试解析和 Prompt 注入
  - [x] 构建通过，API 路由正常注册

### Phase 7B: 多来源安装（ZIP + GitHub + URL） ✅

**目标**：支持从 ZIP 包和 GitHub 仓库安装 Skill

- [x] **7B.1 ZIP 包安装**
  - [x] `installer.ts` — `installFromZip()` 解压 + 解析 SKILL.md + 安全扫描 + 注册
  - [x] `POST /api/skills/install/upload` — multipart/form-data 上传 ZIP
  - [x] 前端增加 ZIP 上传组件

- [x] **7B.2 GitHub 仓库安装**
  - [x] `installer.ts` — `installFromGitHub()` URL 解析 + GitHub API 调用 + 目录递归下载
  - [x] 支持仓库根目录（扫描 skills/ 子目录，展示列表）和子目录（直接安装单个 Skill）
  - [x] 前端增加 GitHub URL 输入框

- [x] **7B.3 URL 安装**
  - [x] `installer.ts` — `installFromUrl()` 下载 ZIP → 走 ZIP 安装流程
  - [x] 前端复用 URL 输入框（自动检测 GitHub URL vs ZIP URL）

- [x] **7B.4 安全扫描增强**
  - [x] `scanner.ts` — 脚本文件危险模式检测
  - [x] `scanner.ts` — Prompt 注入检测
  - [x] `POST /api/skills/install` preview 模式 — 安装前预览

### Phase 7C: 前端体验优化 ✅

**目标**：完善安装流程交互和安全提示

- [x] **7C.1 安装对话框**
  - [x] 统一安装入口，支持多种来源切换（URL/GitHub / 本地路径 / ZIP 上传）
  - [x] 安装预览：展示 Skill 元数据、安全扫描结果
  - [x] 安全警告确认弹窗

- [x] **7C.2 Skill 来源标识**
  - [x] Skill 卡片增加来源标识（内置 / GitHub / ZIP / 本地 / SKILL.md）
  - [x] SKILL.md 型 Skill 显示"Prompt 增强"而非"工具"数量

---

## 11. 风险与缓解

| 风险 | 缓解措施 |
|------|---------|
| 恶意 Skill 包含危险脚本 | 安全扫描 + 用户确认 + 文件大小/数量限制 |
| Prompt 注入攻击 | 检测 SKILL.md 中的系统指令覆盖尝试 |
| GitHub API 速率限制 | 使用 `GITHUB_TOKEN` 环境变量认证，添加缓存 |
| Skill 间 Prompt 冲突 | 每个 Skill 的 Prompt 用分隔标记隔离，LLM 可区分 |
| 大量 Skill 导致 Token 超限 | Prompt 注入时计算 Token 数，超出时截断或警告 |
| ZIP 解压安全（Zip Slip） | 校验解压路径不超出目标目录 |

---

## 12. 与现有系统的兼容性

| 现有功能 | 影响 | 说明 |
|---------|------|------|
| 内置 Skill (filesystem/terminal/git) | 无影响 | 继续从 `BUILT_IN_SKILLS` 硬编码加载 |
| 扩展 Skill (web-search/api-testing等) | 无影响 | 继续从 `EXTENSION_SKILLS` 硬编码加载 |
| `data/skills.json` | 扩展 | 新增 `source` 和 `skillMdPath` 字段，旧数据无此字段则忽略 |
| `SKILL_LOCAL_HANDLERS` | 无影响 | SKILL.md 型 Skill 不注册工具处理器 |
| 首页 Skill 面板 | 扩展 | 增加安装入口，已有 Skill 卡片不变 |
| Agent 循环 | 无影响 | Prompt 注入通过现有 `systemPromptAddon` 机制 |
