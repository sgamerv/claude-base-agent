/**
 * Socket.io 服务端
 * 管理与前端的 WebSocket 连接，转发 Agent 事件
 * 支持会话历史持久化 + workspace 路由 + Diff 确认流程
 * Phase 6: 集成 Skill 系统 + Diff 预览 + Accept/Reject
 */

import { Server as HttpServer } from "http";
import { Server as SocketIOServer } from "socket.io";
import { AgentOrchestrator, type AgentCallbacks } from "../agent/orchestrator";
import { initMCPClient } from "../agent/tool-executor";
import { setSessionHistoriesRef } from "./server-cleanup";
import { getSession, getWorkspaceAbsPath } from "../session/manager";
import { getEnabledSkillPromptAddons } from "../skill/registry";
import type { SelectOption } from "../types/chat";

// 存储等待用户回复的 Promise
const pendingUserReplies = new Map<string, (response: string) => void>();
// 存储等待审批的 Promise
const pendingApprovals = new Map<string, (approved: boolean) => void>();
// 存储等待 Diff 确认的 Promise
const pendingDiffResponses = new Map<string, (accepted: boolean) => void>();

// ========== 会话历史存储 ==========
interface SessionHistory {
  messages: Array<{
    role: "system" | "user" | "assistant" | "tool";
    content: string;
    tool_call_id?: string;
    tool_calls?: Array<{
      id: string;
      type: "function";
      function: { name: string; arguments: string };
    }>;
  }>;
  orchestrator: AgentOrchestrator;
  lastActiveAt: number;
  workspacePath?: string;
  // 文件变更缓存：toolCallId → { filePath, originalContent, newContent }
  pendingFileChanges: Map<string, { filePath: string; originalContent: string; newContent: string }>;
}

const sessionHistories = new Map<string, SessionHistory>();

// 注入清理引用，供 API Route 删除 session 时调用
setSessionHistoriesRef(sessionHistories);

// 清理超过 30 分钟不活跃的会话
const SESSION_TTL = 30 * 60 * 1000;
setInterval(() => {
  const now = Date.now();
  for (const [id, session] of sessionHistories) {
    if (now - session.lastActiveAt > SESSION_TTL) {
      sessionHistories.delete(id);
      console.log(`[Session] Cleaned up expired session: ${id}`);
    }
  }
}, 5 * 60 * 1000);

let io: SocketIOServer;

export function initSocketServer(httpServer: HttpServer): SocketIOServer {
  io = new SocketIOServer(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
    },
  });

  const apiKey = process.env.ZHIPU_API_KEY || "";

  if (!apiKey || apiKey === "your_zhipu_api_key_here") {
    console.warn(
      "[WARN] ZHIPU_API_KEY not configured. Agent will not work until API key is set in .env.local"
    );
  }

  // 初始化 MCP 客户端（异步，不阻塞）
  initMCPClient().then((available) => {
    if (available) {
      console.log("[MCP] Remote execution mode enabled");
    } else {
      console.log("[MCP] Local fallback mode (MCP Server not available)");
    }
  });

  io.on("connection", (socket) => {
    console.log(`[Socket] Client connected: ${socket.id}`);

    // 加入会话房间
    socket.on("join_session", (sessionId: string) => {
      socket.join(sessionId);
      console.log(`[Socket] ${socket.id} joined session: ${sessionId}`);

      const history = sessionHistories.get(sessionId);
      if (history) {
        history.lastActiveAt = Date.now();
        console.log(`[Session] Session ${sessionId} rejoined, history preserved (${history.messages.length} messages)`);
      }
    });

    // 离开会话房间
    socket.on("leave_session", (sessionId: string) => {
      socket.leave(sessionId);
      console.log(`[Socket] ${socket.id} left session: ${sessionId}`);
    });

    // 用户中止 Agent
    socket.on("stop_agent", (data: { sessionId: string }) => {
      const session = sessionHistories.get(data.sessionId);
      if (session) {
        session.orchestrator.abort();

        // 释放所有挂起的 Promise，让 agent 循环解除阻塞
        for (const [id, resolve] of pendingUserReplies) {
          resolve("__stopped__");
          pendingUserReplies.delete(id);
        }
        for (const [id, resolve] of pendingApprovals) {
          resolve(false);
          pendingApprovals.delete(id);
        }
        for (const [id, resolve] of pendingDiffResponses) {
          resolve(false);
          pendingDiffResponses.delete(id);
        }

        // 清理该 session 的文件变更缓存
        session.pendingFileChanges.clear();

        console.log(`[Agent] Session ${data.sessionId}: Agent stopped by user`);
      }
    });

    // 处理用户消息
    socket.on("send_message", async (data: { sessionId: string; message: string }) => {
      const { sessionId, message } = data;
      console.log(`[Agent] Session ${sessionId}: User message received`);

      if (!apiKey || apiKey === "your_zhipu_api_key_here") {
        io.to(sessionId).emit("agent_error", {
          sessionId,
          error: "API Key 未配置。请在 .env.local 中设置 ZHIPU_API_KEY",
        });
        return;
      }

      // 获取或创建会话历史
      let session = sessionHistories.get(sessionId);
      if (!session) {
        // 查找 session 的 workspace 路径
        let workspacePath: string | undefined;
        try {
          const sessionData = await getSession(sessionId);
          if (sessionData) {
            workspacePath = getWorkspaceAbsPath(sessionData);
          }
        } catch {
          // 如果查询失败（session 不在 JSON 中），使用默认路径
        }

        const orchestrator = new AgentOrchestrator(apiKey);
        session = {
          messages: [{ role: "system", content: "" }], // system prompt 由 orchestrator 动态构建
          orchestrator,
          lastActiveAt: Date.now(),
          workspacePath,
          pendingFileChanges: new Map(),
        };
        sessionHistories.set(sessionId, session);
        console.log(`[Session] Created new session: ${sessionId}, workspace: ${workspacePath || "default"}`);
      }

      session.lastActiveAt = Date.now();

      // 添加用户消息到历史
      session.messages.push({ role: "user", content: message });

      const callbacks: AgentCallbacks = {
        onThinkingDelta: (delta: string) => {
          io.to(sessionId).emit("agent_thinking_delta", { sessionId, delta });
        },
        onThinkingEnd: (fullContent: string) => {
          io.to(sessionId).emit("agent_thinking_end", { sessionId, fullContent });
        },
        onToolCall: (toolCallId: string, toolName: string, input: Record<string, string>) => {
          io.to(sessionId).emit("agent_tool_call", { sessionId, toolCallId, toolName, input });
        },
        onToolResult: (toolName: string, result) => {
          io.to(sessionId).emit("agent_tool_result", {
            sessionId,
            toolName,
            success: result.success,
            content: result.success ? result.content : result.error,
          });
        },
        onAskUser: async (question: string, toolCallId: string, options?: SelectOption[], multiple?: boolean): Promise<string> => {
          io.to(sessionId).emit("agent_needs_input", { sessionId, question, toolCallId, options, multiple });
          return new Promise((resolve) => {
            pendingUserReplies.set(toolCallId, resolve);
          });
        },
        onApprovalRequired: async (command: string, toolCallId: string): Promise<boolean> => {
          io.to(sessionId).emit("approval_required", { sessionId, command, toolCallId });
          return new Promise((resolve) => {
            pendingApprovals.set(toolCallId, resolve);
          });
        },
        onDiffRequired: async (filePath: string, originalContent: string, newContent: string, toolCallId: string): Promise<boolean> => {
          const diffId = `diff-${toolCallId}`;
          const stats = computeDiffStats(originalContent, newContent);

          // 缓存文件变更详情（供前端按需请求完整 Diff）
          if (session) {
            session.pendingFileChanges.set(toolCallId, {
              filePath,
              originalContent,
              newContent,
            });
          }

          // 推送 file_change 事件给前端
          io.to(sessionId).emit("file_change", {
            sessionId,
            diffId,
            filePath,
            toolCallId,
            stats,
          });

          // 挂起等待用户确认
          return new Promise((resolve) => {
            pendingDiffResponses.set(diffId, resolve);
          });
        },
        onFinalResponse: (content: string) => {
          io.to(sessionId).emit("agent_response", { sessionId, content });
        },
        onError: (error: string) => {
          io.to(sessionId).emit("agent_error", { sessionId, error });
        },
      };

      // 使用持久化的历史进行对话，传入 workspace 路径
      await session.orchestrator.handleUserTaskWithHistory(
        session.messages,
        sessionId,
        callbacks,
        session.workspacePath
      );
    });

    // 用户回复 Agent 提问
    socket.on("user_reply", (data: { toolCallId: string; answer: string }) => {
      const resolve = pendingUserReplies.get(data.toolCallId);
      if (resolve) {
        resolve(data.answer);
        pendingUserReplies.delete(data.toolCallId);
      }
    });

    // 用户审批结果
    socket.on("approval_response", (data: { toolCallId: string; approved: boolean }) => {
      const resolve = pendingApprovals.get(data.toolCallId);
      if (resolve) {
        resolve(data.approved);
        pendingApprovals.delete(data.toolCallId);
      }
    });

    // 用户 Diff 确认结果
    socket.on("diff_response", (data: { sessionId: string; diffId: string; accepted: boolean }) => {
      const resolve = pendingDiffResponses.get(data.diffId);
      if (resolve) {
        resolve(data.accepted);
        pendingDiffResponses.delete(data.diffId);
      }

      // 清除服务端缓存（回滚由 orchestrator 负责）
      const session = sessionHistories.get(data.sessionId);
      if (session) {
        const toolCallId = data.diffId.replace("diff-", "");
        session.pendingFileChanges.delete(toolCallId);
      }
    });

    // 用户请求完整 Diff 详情（用于编辑器入口查看）
    socket.on("get_diff_detail", (data: { sessionId: string; diffId: string }, callback: (detail: {
      filePath: string;
      originalContent: string;
      newContent: string;
    } | null) => void) => {
      const session = sessionHistories.get(data.sessionId);
      if (!session) {
        callback(null);
        return;
      }
      const toolCallId = data.diffId.replace("diff-", "");
      const change = session.pendingFileChanges.get(toolCallId);
      if (change) {
        callback({
          filePath: change.filePath,
          originalContent: change.originalContent,
          newContent: change.newContent,
        });
      } else {
        callback(null);
      }
    });

    socket.on("disconnect", () => {
      console.log(`[Socket] Client disconnected: ${socket.id}`);
    });
  });

  return io;
}

/**
 * 计算 Diff 统计信息
 */
function computeDiffStats(original: string, modified: string): { added: number; removed: number } {
  const oldLines = original.split("\n");
  const newLines = modified.split("\n");

  // 简单统计：新增行数和删除行数
  const m = oldLines.length;
  const n = newLines.length;

  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (oldLines[i - 1] === newLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  const lcs = dp[m][n];
  return {
    removed: m - lcs,
    added: n - lcs,
  };
}

export function getIO(): SocketIOServer | undefined {
  return io;
}
