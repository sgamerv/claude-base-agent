/**
 * 聊天消息类型定义
 * Phase 6: 增加 pendingDiff 支持 Diff 预览 + Accept/Reject
 */

export type MessageRole = "user" | "assistant" | "system";

export type ToolCallStatus = "calling" | "completed" | "error";

export interface ToolCallInfo {
  id: string;
  toolName: string;
  input: Record<string, string>;
  status: ToolCallStatus;
  result?: string;
}

export interface DiffInfo {
  /** 变更 ID，用于 Accept/Reject 回调 */
  diffId: string;
  /** 文件路径 */
  filePath: string;
  /** 变更前内容 */
  originalContent: string;
  /** 变更后内容 */
  newContent: string;
  /** 工具调用 ID，关联到 write_file 调用 */
  toolCallId?: string;
}

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: number;
  /** 助手消息可能包含工具调用 */
  toolCalls?: ToolCallInfo[];
  /** 是否是思考中的中间消息 */
  isThinking?: boolean;
  /** 是否等待用户输入 */
  pendingInput?: {
    question: string;
    toolCallId: string;
  };
  /** 是否等待审批 */
  pendingApproval?: {
    command: string;
    toolCallId: string;
  };
  /** 是否有文件变更等待确认 (Diff 预览) */
  pendingDiffs?: DiffInfo[];
}

export interface AgentState {
  status: "idle" | "thinking" | "executing" | "waiting_input" | "waiting_approval" | "waiting_diff" | "error";
  currentAction?: string;
}
