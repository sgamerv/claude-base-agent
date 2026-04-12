## 为何要将现有基础工具（filesystem / terminal / git）重构为内置 Skill？请解释原因

1. 统一的工具发现和注入管道
如果不重构，系统中会存在两条并行路径：
旧架构（两条路径）:
  基础工具 → tools.ts 硬编码 → toGLMTools() 直接返回
  Skill 工具 → registry.ts 动态查询 → 需要额外合并逻辑

新架构（一条路径）:
  所有工具 → Skill Registry 统一查询 → getEnabledSkillTools() 一次返回

orchestrator.ts 只需调用 getEnabledSkillTools() 一次就能拿到全部工具定义，不需要区分"基础工具从哪来、Skill 工具从哪来"。

2. 支持按类别启用/禁用
将工具归类为 Skill 后，用户可以在首页一键禁用整个 git 或 terminal 类别。如果工具是扁平列表，禁用 git 就需要逐个禁用 git_status、git_diff，且无法在 UI 上归类展示。

3. Prompt 与工具的绑定关系
每个 Skill 的 systemPromptAddon 和它的工具是绑定的。例如：

filesystem Skill → 工具：read_directory/read_file/write_file/list_files + Prompt："修改代码前，先读取相关文件了解上下文"
terminal Skill → 工具：execute_bash + Prompt："执行危险命令前需要获得用户确认"
如果工具和 Prompt 分开管理，当用户禁用 terminal 时，对应的 Prompt 也应该一并移除。Skill 模型天然保证了这种绑定。

保留 ask_user 不归入 Skill 的原因
ask_user 保留在 BASE_TOOL_DEFINITIONS 中，因为它不是"能力扩展"，而是系统级交互原语——它在 orchestrator 中有特殊的挂起逻辑（await callbacks.onAskUser()），不走 tool-executor 的普通执行路径。