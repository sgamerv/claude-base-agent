/**
 * Agent 控制平面核心
 * 实现 Plan-Act-Observe 代理循环
 * 基于 GLM-5.1 模型 — 流式响应
 * Phase 5: 集成 Skill 系统工具定义和 Prompt 注入
 */

import { toGLMTools } from "./tools";
import { executeTool, type ToolResult } from "./tool-executor";
import { getEnabledSkillTools, getEnabledSkillPromptAddons } from "../skill/registry";

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
  onAskUser: (question: string, toolCallId: string) => Promise<string>;
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
5. 用中文回复用户`;

const MAX_ITERATIONS = 15;
const GLM_API_URL = "https://open.bigmodel.cn/api/paas/v4/chat/completions";
const API_RETRY_DELAYS = [2000, 5000, 10000]; // 429 重试退避：2s, 5s, 10s
const LOOP_MIN_INTERVAL = 1500; // 循环最小间隔 (ms)，避免请求过快触发速率限制

export class AgentOrchestrator {
  private apiKey: string;
  private model: string;

  constructor(apiKey: string, model: string = "glm-5.1") {
    this.apiKey = apiKey;
    this.model = model;
  }

  /**
   * 构建完整的 System Prompt（基础 + Skill Prompt Addons）
   */
  private async buildSystemPrompt(): Promise<string> {
    const addons = await getEnabledSkillPromptAddons();
    const toolsDesc = addons.length > 0
      ? `\n\n你可以使用以下扩展能力：\n${addons.map((a, i) => `${i + 1}. ${a}`).join("\n")}`
      : "";
    return BASE_SYSTEM_PROMPT + toolsDesc;
  }

  /**
   * 获取所有可用的工具定义（基础 + Skill 工具）
   */
  private async getAllToolDefinitions() {
    const skillTools = await getEnabledSkillTools();
    return skillTools.map((t) => ({
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    }));
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
    // 注意：用户消息已由调用方添加到 messages，这里直接进入代理循环
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

    let iterations = 0;
    let lastLoopTime = 0;

    try {
      while (iterations < MAX_ITERATIONS) {
        // 循环最小间隔控制：避免请求过快触发速率限制
        const now = Date.now();
        const elapsed = now - lastLoopTime;
        if (lastLoopTime > 0 && elapsed < LOOP_MIN_INTERVAL) {
          await new Promise((r) => setTimeout(r, LOOP_MIN_INTERVAL - elapsed));
        }
        lastLoopTime = Date.now();

        iterations++;

        // 获取最新的工具定义（Skill 可能动态变更）
        const skillToolDefs = await this.getAllToolDefinitions();
        const tools = toGLMTools(skillToolDefs);

        // 流式调用 GLM-5.1
        const { fullContent, toolCalls } = await this.callGLMStreaming(messages, callbacks, tools);

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

        // 处理所有工具调用
        for (const toolCall of toolCalls) {
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
            const userAnswer = await callbacks.onAskUser(question, toolCall.id);
            result = userAnswer;
          }
          // write_file 特殊处理：先推送 Diff 等待确认，用户接受后才写入
          else if (toolName === "write_file") {
            const filePath = toolInput.path || "";
            // 先读取原始文件内容
            const readResult = await executeTool("read_file", { path: filePath }, workspacePath);
            const originalContent = readResult.success ? readResult.content : "";
            const newContent = toolInput.content || "";

            // 只有有实际变更时才需要 Diff 确认
            if (originalContent !== newContent) {
              // 推送 Diff 给前端，等待用户确认（此时文件尚未写入）
              const accepted = await callbacks.onDiffRequired(
                filePath,
                originalContent,
                newContent,
                toolCall.id
              );

              if (accepted) {
                // 用户接受：执行写入
                const toolResult = await executeTool(toolName, toolInput, workspacePath);
                callbacks.onToolResult(toolName, toolResult);
                result = toolResult.success ? toolResult.content : `Error: ${toolResult.error}`;
              } else {
                // 用户拒绝：不写入，告知 Agent 不要重试
                callbacks.onToolResult(toolName, { success: false, content: "", error: "File change rejected by user" });
                result = "File change rejected by user. No changes were made. DO NOT retry writing to this file with similar content. Ask the user for clarification or try a different approach instead.";
              }
            } else {
              // 无实际变更，直接执行（空写或内容相同）
              const toolResult = await executeTool(toolName, toolInput, workspacePath);
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
              if (!approved) {
                result = "ERROR: Command blocked by user. The command was not executed.";
              } else {
                const toolResult = await executeTool(toolName, toolInput, workspacePath);
                callbacks.onToolResult(toolName, toolResult);
                result = toolResult.success ? toolResult.content : `Error: ${toolResult.error}`;
              }
            } else {
              const toolResult = await executeTool(toolName, toolInput, workspacePath);
              callbacks.onToolResult(toolName, toolResult);
              result = toolResult.success ? toolResult.content : `Error: ${toolResult.error}`;
            }
          }
          // 普通工具执行
          else {
            const toolResult = await executeTool(toolName, toolInput, workspacePath);
            callbacks.onToolResult(toolName, toolResult);
            result = toolResult.success ? toolResult.content : `Error: ${toolResult.error}`;
          }

          // 将工具结果添加到消息历史
          messages.push({
            role: "tool",
            content: result,
            tool_call_id: toolCall.id,
          });
        }

        // 继续循环让 Agent 处理工具结果
      }

      if (iterations >= MAX_ITERATIONS) {
        callbacks.onError("Agent 达到最大迭代次数，任务终止");
      }
    } catch (error) {
      callbacks.onError(
        `Agent 执行出错: ${error instanceof Error ? error.message : String(error)}`
      );
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
    tools: ReturnType<typeof toGLMTools>
  ): Promise<{ fullContent: string; toolCalls: GLMToolCall[] }> {
    for (let attempt = 0; attempt <= API_RETRY_DELAYS.length; attempt++) {
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
      });

      if (!response.ok) {
        // 429 速率限制：自动退避重试
        if (response.status === 429 && attempt < API_RETRY_DELAYS.length) {
          const delay = API_RETRY_DELAYS[attempt];
          console.log(`[Agent] Rate limited (429), retrying in ${delay}ms (attempt ${attempt + 1}/${API_RETRY_DELAYS.length})`);
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }
        const errorText = await response.text();
        throw new Error(`GLM API error (${response.status}): ${errorText}`);
      }

      return this.parseGLMStream(response, callbacks);
    }

    // 不应到达这里，但以防万一
    throw new Error("GLM API error (429): Max retries exceeded");
  }

  /**
   * 解析 GLM 流式响应
   */
  private async parseGLMStream(
    response: Response,
    callbacks: AgentCallbacks
  ): Promise<{ fullContent: string; toolCalls: GLMToolCall[] }> {

    let fullContent = "";
    const toolCallsMap = new Map<number, GLMToolCall>();

    const reader = response.body?.getReader();
    if (!reader) throw new Error("No response body");

    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
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
