/**
 * Agent 控制平面核心
 * 实现 Plan-Act-Observe 代理循环
 * 基于 GLM-5.1 模型 — 流式响应
 * Phase 5: 集成 Skill 系统工具定义和 Prompt 注入
 */

import { toGLMTools } from "./tools";
import { executeTool, type ToolResult } from "./tool-executor";
import { getEnabledSkillTools, getEnabledSkillPromptAddons } from "../skill/registry";
import { getMCPHub } from "../mcp/hub";
import type { SelectOption } from "../types/chat";

// GLM API 类型定义
interface GLMMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_call_id?: string;
  tool_calls?: GLMToolCall[];
}

interface GLMToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

// 事件回调类型
export interface AgentCallbacks {
  onThinkingDelta: (delta: string) => void;
  onThinkingEnd: (fullContent: string) => void;
  onToolCall: (toolCallId: string, toolName: string, input: Record<string, string>) => void;
  onToolResult: (toolName: string, result: ToolResult) => void;
  onAskUser: (question: string, toolCallId: string, options?: SelectOption[], multiple?: boolean) => Promise<string>;
  onApprovalRequired: (command: string, toolCallId: string) => Promise<boolean>;
  /** write_file 执行后，推送 Diff 通知并等待用户确认。返回 true=接受, false=拒绝并回滚 */
  onDiffRequired: (filePath: string, originalContent: string, newContent: string, toolCallId: string) => Promise<boolean>;
  onFinalResponse: (content: string) => void;
  onError: (error: string) => void;
}

const BASE_SYSTEM_PROMPT = `你是一个经验丰富的 AI 编程助手，运行在一个远程协作开发平台中。你可以帮助用户编写代码、调试问题、重构项目等。

工作原则：
1. 先理解项目结构，再动手修改
2. 修改代码前，先读取相关文件了解上下文
3. 遇到不确定的情况，主动向用户提问
4. 给出的建议要具体、可执行
5. 用中文回复用户

【重要】使用 ask_user 工具时的规范：
- 当需要用户从多个选项中选择时，必须使用 options 参数传递结构化选项列表，不要把选项写在 question 文本中
- 每个 option 需要有 label（显示文本）和 value（选择值），可选 description（补充说明）
- 单选用 multiple=false（默认），多选用 multiple=true
- question 中只写提问的引导语，不要包含选项列表
- 正确示例：question="请选择您遇到的问题类型", options=[{label:"🔧 技术问题",value:"技术问题",description:"如性能瓶颈、架构设计"}]
- 错误示例：question="请选择问题类型：\n- 🔧 技术问题\n- 📊 业务问题"（不要这样写！）`;

const MAX_ITERATIONS = 15;
const GLM_API_URL = "https://open.bigmodel.cn/api/paas/v4/chat/completions";
const API_RETRY_DELAYS = [2000, 5000, 10000]; // 429 重试退避：2s, 5s, 10s
const LOOP_MIN_INTERVAL = 1500; // 循环最小间隔 (ms)，避免请求过快触发速率限制

export class AgentOrchestrator {
  private apiKey: string;
  private model: string;
  private abortController: AbortController | null = null;

  constructor(apiKey: string, model: string = "glm-4.7") {
    this.apiKey = apiKey;
    this.model = model;
  }

  /** 中止当前运行的 Agent 循环 */
  abort(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }

  /**
   * 构建完整的 System Prompt（基础 + Skill Prompt Addons + MCP 工具提示）
   */
  private async buildSystemPrompt(): Promise<string> {
    const addons = await getEnabledSkillPromptAddons();
    const toolsDesc = addons.length > 0
      ? `\n\n你可以使用以下扩展能力：\n${addons.map((a, i) => `${i + 1}. ${a}`).join("\n")}`
      : "";

    // Phase 9: 添加外部 MCP 工具提示
    let mcpDesc = "";
    const hub = getMCPHub();
    if (hub) {
      const mcpTools = hub.getAllToolDefinitions();
      if (mcpTools.length > 0) {
        mcpDesc = `\n\n你可以使用以下外部 MCP 工具：\n${mcpTools.map((t, i) => `${i + 1}. ${t.name} — ${t.description}`).join("\n")}`;
      }
    }

    return BASE_SYSTEM_PROMPT + toolsDesc + mcpDesc;
  }

  /**
   * 获取所有可用的工具定义（基础 + Skill 工具 + MCP Hub 外部工具）
   */
  private async getAllToolDefinitions(): Promise<Array<{
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  }>> {
    const skillTools = await getEnabledSkillTools();
    const tools: Array<{
      name: string;
      description: string;
      parameters: Record<string, unknown>;
    }> = skillTools.map((t) => ({
      name: t.name,
      description: t.description,
      parameters: t.parameters as Record<string, unknown>,
    }));

    // Phase 9: 添加 MCP Hub 外部工具
    const hub = getMCPHub();
    if (hub) {
      const mcpTools = hub.getAllToolDefinitions();
      tools.push(...mcpTools);
    }

    return tools;
  }

  /**
   * 处理用户任务 — 使用外部传入的历史消息（支持会话持久化）
   * messages 数组由调用方持有和持久化，本方法只追加不重建
   * workspacePath: 指定 session 的 workspace 路径，传递给工具执行器
   */
  async handleUserTaskWithHistory(
    messages: GLMMessage[],
    sessionId: string,
    callbacks: AgentCallbacks,
    workspacePath?: string
  ): Promise<void> {
    // 动态更新 system prompt（包含 Skill + MCP 工具提示）
    const systemPrompt = await this.buildSystemPrompt();
    if (messages.length > 0 && messages[0].role === "system") {
      messages[0].content = systemPrompt;
    } else {
      messages.unshift({ role: "system", content: systemPrompt });
    }

    await this.runAgentLoop(messages, callbacks, workspacePath);
  }

  /**
   * 处理用户任务 — 核心代理循环（流式）
   * 无历史版本，每次新建 messages
   */
  async handleUserTask(
    userPrompt: string,
    sessionId: string,
    callbacks: AgentCallbacks
  ): Promise<void> {
    const systemPrompt = await this.buildSystemPrompt();
    const messages: GLMMessage[] = [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ];

    await this.runAgentLoop(messages, callbacks);
  }

  /**
   * 核心代理循环 — 流式 Plan-Act-Observe
   */
  private async runAgentLoop(
    messages: GLMMessage[],
    callbacks: AgentCallbacks,
    workspacePath?: string
  ): Promise<void> {

    this.abortController = new AbortController();
    const signal = this.abortController.signal;

    let iterations = 0;
    let lastLoopTime = 0;

    try {
      while (iterations < MAX_ITERATIONS) {
        if (signal.aborted) {
          callbacks.onError("Agent 已被用户手动停止");
          return;
        }

        // 循环最小间隔控制：避免请求过快触发速率限制
        const now = Date.now();
        const elapsed = now - lastLoopTime;
        if (lastLoopTime > 0 && elapsed < LOOP_MIN_INTERVAL) {
          await new Promise((r) => setTimeout(r, LOOP_MIN_INTERVAL - elapsed));
          if (signal.aborted) {
            callbacks.onError("Agent 已被用户手动停止");
            return;
          }
        }
        lastLoopTime = Date.now();

        iterations++;

        // 获取最新的工具定义（Skill 可能动态变更）
        const skillToolDefs = await this.getAllToolDefinitions();
        const tools = toGLMTools(skillToolDefs);

        // 流式调用 GLM-5.1
        const { fullContent, toolCalls } = await this.callGLMStreaming(messages, callbacks, tools, signal);

        // 构建助手消息用于历史
        const assistantMsg: GLMMessage = {
          role: "assistant",
          content: fullContent,
        };

        if (toolCalls.length > 0) {
          assistantMsg.tool_calls = toolCalls;
        }

        messages.push(assistantMsg);

        // 无工具调用 → 任务完成
        if (toolCalls.length === 0) {
          callbacks.onThinkingEnd(fullContent);
          if (fullContent) {
            callbacks.onFinalResponse(fullContent);
          }
          break;
        }

        // 有工具调用 → 标记思考段结束
        callbacks.onThinkingEnd(fullContent);

        // 用户中止后不再执行工具
        if (signal.aborted) {
          callbacks.onError("Agent 已被用户手动停止");
          return;
        }

        // 处理所有工具调用
        for (const toolCall of toolCalls) {
          if (signal.aborted) break;

          const toolName = toolCall.function.name;
          let toolInput: Record<string, string>;

          try {
            toolInput = JSON.parse(toolCall.function.arguments);
          } catch {
            toolInput = {};
          }

          callbacks.onToolCall(toolCall.id, toolName, toolInput);

          let result: string;

          // ask_user 特殊处理：挂起等待用户回复
          if (toolName === "ask_user") {
            const question = toolInput.question || "请提供更多信息";
            // Phase 8: 解析结构化选项
            let options: SelectOption[] | undefined;
            let multiple: boolean | undefined;
            if (toolInput.options) {
              try {
                const rawOptions = typeof toolInput.options === "string"
                  ? JSON.parse(toolInput.options)
                  : toolInput.options;
                if (Array.isArray(rawOptions)) {
                  options = rawOptions.map((opt: Record<string, string>) => ({
                    label: opt.label || opt.value || "",
                    value: opt.value || opt.label || "",
                    description: opt.description,
                  }));
                }
              } catch {
                // options 解析失败，忽略
              }
            }
            if (String(toolInput.multiple) === "true") {
              multiple = true;
            }
            // Phase 8 补充：当 LLM 未使用 options 参数但 question 中包含 Markdown 列表时，
            // 自动提取为结构化选项，确保前端能以卡片形式展示
            if (!options || options.length === 0) {
              const extracted = extractOptionsFromQuestion(question);
              if (extracted.options.length > 0) {
                options = extracted.options;
                if (multiple === undefined) {
                  multiple = false;
                }
              }
            }
            const userAnswer = await callbacks.onAskUser(question, toolCall.id, options, multiple);
            result = userAnswer;
          }
          // write_file 特殊处理：先推送 Diff 等待确认，用户接受后才写入
          else if (toolName === "write_file") {
            const filePath = toolInput.path || "";
            // 先读取原始文件内容
            const readResult = await executeTool("read_file", { path: filePath }, workspacePath, signal);
            const originalContent = readResult.success ? readResult.content : "";
            const newContent = toolInput.content || "";

            if (signal.aborted) break;

            // 只有有实际变更时才需要 Diff 确认
            if (originalContent !== newContent) {
              // 推送 Diff 给前端，等待用户确认（此时文件尚未写入）
              const accepted = await callbacks.onDiffRequired(
                filePath,
                originalContent,
                newContent,
                toolCall.id
              );

              if (signal.aborted) break;

              if (accepted) {
                // 用户接受：执行写入
                const toolResult = await executeTool(toolName, toolInput, workspacePath, signal);
                callbacks.onToolResult(toolName, toolResult);
                result = toolResult.success ? toolResult.content : `Error: ${toolResult.error}`;
              } else {
                // 用户拒绝：不写入，告知 Agent 不要重试
                callbacks.onToolResult(toolName, { success: false, content: "", error: "File change rejected by user" });
                result = "File change rejected by user. No changes were made. DO NOT retry writing to this file with similar content. Ask the user for clarification or try a different approach instead.";
              }
            } else {
              // 无实际变更，直接执行（空写或内容相同）
              const toolResult = await executeTool(toolName, toolInput, workspacePath, signal);
              callbacks.onToolResult(toolName, toolResult);
              result = toolResult.success ? toolResult.content : `Error: ${toolResult.error}`;
            }
          }
          // execute_bash 安全拦截
          else if (toolName === "execute_bash") {
            const command = toolInput.command || "";
            const isDangerous = [
              "rm -rf",
              "mkfs",
              "chmod",
              "chown",
              "format",
            ].some((cmd) => command.includes(cmd));

            if (isDangerous) {
              const approved = await callbacks.onApprovalRequired(command, toolCall.id);
              if (signal.aborted) break;
              if (!approved) {
                result = "ERROR: Command blocked by user. The command was not executed.";
              } else {
                const toolResult = await executeTool(toolName, toolInput, workspacePath, signal);
                callbacks.onToolResult(toolName, toolResult);
                result = toolResult.success ? toolResult.content : `Error: ${toolResult.error}`;
              }
            } else {
              const toolResult = await executeTool(toolName, toolInput, workspacePath, signal);
              callbacks.onToolResult(toolName, toolResult);
              result = toolResult.success ? toolResult.content : `Error: ${toolResult.error}`;
            }
          }
          // 普通工具执行
          else {
            const toolResult = await executeTool(toolName, toolInput, workspacePath, signal);
            callbacks.onToolResult(toolName, toolResult);
            result = toolResult.success ? toolResult.content : `Error: ${toolResult.error}`;
          }

          if (signal.aborted) break;

          // 将工具结果添加到消息历史
          messages.push({
            role: "tool",
            content: result,
            tool_call_id: toolCall.id,
          });
        }

        // 中止后退出外层 while
        if (signal.aborted) {
          callbacks.onError("Agent 已被用户手动停止");
          return;
        }

        // 继续循环让 Agent 处理工具结果
      }

      if (iterations >= MAX_ITERATIONS) {
        callbacks.onError("Agent 达到最大迭代次数，任务终止");
      }
    } catch (error) {
      if (signal.aborted) {
        callbacks.onError("Agent 已被用户手动停止");
      } else {
        callbacks.onError(
          `Agent 执行出错: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    } finally {
      this.abortController = null;
    }
  }

  /**
   * 流式调用 GLM-5.1 API
   * 返回完整的文本内容和工具调用列表
   * 包含 429 速率限制的自动重试和退避
   */
  private async callGLMStreaming(
    messages: GLMMessage[],
    callbacks: AgentCallbacks,
    tools: ReturnType<typeof toGLMTools>,
    signal?: AbortSignal
  ): Promise<{ fullContent: string; toolCalls: GLMToolCall[] }> {
    for (let attempt = 0; attempt <= API_RETRY_DELAYS.length; attempt++) {
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

      const response = await fetch(GLM_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages,
          tools,
          max_tokens: 4096,
          temperature: 0.7,
          stream: true,
        }),
        signal,
      });

      if (!response.ok) {
        const errorText = await response.text();

        // 429：区分余额不足和频率限制
        if (response.status === 429) {
          let reason = "请求频率过高";
          try {
            const parsed = JSON.parse(errorText);
            if (parsed?.error?.code === "1113") {
              reason = "余额不足或无可用资源包，请前往 open.bigmodel.cn 充值";
            } else if (parsed?.error?.message) {
              reason = parsed.error.message;
            }
          } catch {}

          // 余额不足等非临时错误直接抛出，不重试
          if (errorText.includes('"1113"')) {
            throw new Error(`GLM API 错误: ${reason}`);
          }

          // 频率限制：退避重试
          if (attempt < API_RETRY_DELAYS.length) {
            const delay = API_RETRY_DELAYS[attempt];
            console.log(`[Agent] Rate limited (429), retrying in ${delay}ms (attempt ${attempt + 1}/${API_RETRY_DELAYS.length})`);
            await new Promise((r) => setTimeout(r, delay));
            continue;
          }
          throw new Error(`GLM API 请求频率受限: ${reason}`);
        }

        throw new Error(`GLM API error (${response.status}): ${errorText}`);
      }

      return this.parseGLMStream(response, callbacks, signal);
    }

    // 不应到达这里，但以防万一
    throw new Error("GLM API error (429): Max retries exceeded");
  }

  /**
   * 解析 GLM 流式响应
   */
  private async parseGLMStream(
    response: Response,
    callbacks: AgentCallbacks,
    signal?: AbortSignal
  ): Promise<{ fullContent: string; toolCalls: GLMToolCall[] }> {

    let fullContent = "";
    const toolCallsMap = new Map<number, GLMToolCall>();

    const reader = response.body?.getReader();
    if (!reader) throw new Error("No response body");

    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      if (signal?.aborted) {
        reader.cancel().catch(() => {});
        break;
      }
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // 按行解析 SSE
      const lines = buffer.split("\n");
      buffer = lines.pop() || ""; // 保留最后一个不完整的行

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith("data:")) continue;

        const data = trimmed.slice(5).trim();
        if (data === "[DONE]") continue;

        try {
          const parsed = JSON.parse(data);
          const delta = parsed.choices?.[0]?.delta;
          if (!delta) continue;

          // 处理文本增量
          if (delta.content) {
            fullContent += delta.content;
            callbacks.onThinkingDelta(delta.content);
          }

          // 处理工具调用增量
          if (delta.tool_calls) {
            for (const tc of delta.tool_calls) {
              const idx = tc.index ?? 0;
              if (!toolCallsMap.has(idx)) {
                toolCallsMap.set(idx, {
                  id: tc.id || "",
                  type: "function",
                  function: { name: "", arguments: "" },
                });
              }
              const existing = toolCallsMap.get(idx)!;
              if (tc.id) existing.id = tc.id;
              if (tc.function?.name) existing.function.name += tc.function.name;
              if (tc.function?.arguments) existing.function.arguments += tc.function.arguments;
            }
          }
        } catch {
          // 忽略解析错误（不完整的 JSON）
        }
      }
    }

    const toolCalls = Array.from(toolCallsMap.values()).filter(
      (tc) => tc.id && tc.function.name
    );

    return { fullContent, toolCalls };
  }
}

/**
 * Phase 8 补充：从 question 文本中自动提取结构化选项
 * 当 LLM 未使用 options 参数但把列表写在 question 中时触发
 * 支持格式：
 *   - 🔧 技术问题（如性能瓶颈）
 *   - 📊 业务问题（如用户增长停滞）
 *   - 项目A: 描述文本
 *   1. 选项一
 *   2. 选项二
 */
function extractOptionsFromQuestion(question: string): { options: SelectOption[] } {
  const options: SelectOption[] = [];
  const lines = question.split("\n");
  
  // 匹配常见的列表格式：
  // - emoji 文本（描述）
  // - dash 文本
  // - 数字. 文本
  const listItemRegex = /^\s*[-*•]\s+(.+)$/;
  const numberedItemRegex = /^\s*\d+[.)]\s+(.+)$/;
  
  let foundListStart = -1;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const dashMatch = line.match(listItemRegex);
    const numMatch = line.match(numberedItemRegex);
    const match = dashMatch || numMatch;
    
    if (match) {
      if (foundListStart === -1) foundListStart = i;
      const rawText = match[1].trim();
      
      // 解析 emoji + 标签 + 描述
      // 格式: "🔧 技术问题（如性能瓶颈、架构设计）"
      // 或: "技术问题（如性能瓶颈）"
      // 或: "技术问题: 描述文本"
      const emojiMatch = rawText.match(/^([\p{Emoji_Presentation}\p{Extended_Pictographic}])\s*(.+)$/u);
      let label = rawText;
      let description: string | undefined;
      
      if (emojiMatch) {
        // 带有 emoji 前缀
        const afterEmoji = emojiMatch[2].trim();
        // 尝试分离标题和描述：括号或冒号分隔
        const partsMatch = afterEmoji.match(/^(.+?)[（(：:]\s*(.+)[）)]?\s*$/);
        if (partsMatch) {
          label = emojiMatch[1] + " " + partsMatch[1].trim();
          description = partsMatch[2].trim();
        } else {
          label = rawText;
        }
      } else {
        // 无 emoji，尝试括号/冒号分隔
        const partsMatch = rawText.match(/^(.+?)[（(：:]\s*(.+)[）)]?\s*$/);
        if (partsMatch) {
          label = partsMatch[1].trim();
          description = partsMatch[2].trim();
        }
      }
      
      // value: 去掉 emoji 和括号描述的纯文本
      const value = label.replace(/^[\p{Emoji_Presentation}\p{Extended_Pictographic}]\s*/u, "").trim();
      
      options.push({
        label,
        value: value || label,
        ...(description ? { description } : {}),
      });
    }
  }
  
  // 至少需要 2 个选项才认为是有效列表
  if (options.length < 2) {
    return { options: [] };
  }
  
  return { options };
}
