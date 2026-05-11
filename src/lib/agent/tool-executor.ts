/**
 * Agent 工具执行器
 * 支持三种模式：
 *   1. Skill 本地模式: 执行 Skill 注册的本地工具
 *   2. MCP Hub 统一路由: 内置 CDE MCP + 外部 MCP Server
 *   3. 本地模式 (fallback): 直接在 Node.js 进程中执行
 * Phase 9: 集成 MCP Hub 统一路由
 */

import { MCPClient, type MCPToolResult } from "../mcp/client";
import { getMCPHub, initMCPHub } from "../mcp/hub";
import { executeSkillTool } from "../skill/executor";

export interface ToolResult {
  success: boolean;
  content: string;
  error?: string;
}

let mcpClient: MCPClient | null = null;
let mcpAvailable = false;

/**
 * 初始化 MCP 客户端（兼容旧调用）
 * Phase 9: 改为初始化 MCPHub
 */
export async function initMCPClient(serverUrl?: string): Promise<boolean> {
  const url = serverUrl || process.env.MCP_SERVER_URL || "http://localhost:3001";

  try {
    const hub = await initMCPHub(url);
    mcpAvailable = hub.isBuiltInAvailable();

    if (mcpAvailable) {
      console.log(`[MCP] Connected to MCP Server at ${url} (via Hub)`);
    } else {
      console.log(`[MCP] MCP Server not available at ${url}, using local fallback`);
    }
  } catch (error) {
    console.error("[MCP] Failed to initialize MCPHub, falling back to direct client:", error);
    // 降级：直接使用 MCPClient
    mcpClient = new MCPClient(url);
    mcpAvailable = await mcpClient.healthCheck();
    if (mcpAvailable) {
      console.log(`[MCP] Connected to MCP Server at ${url} (direct)`);
    } else {
      console.log(`[MCP] MCP Server not available at ${url}, using local fallback`);
    }
  }

  return mcpAvailable;
}

/**
 * 执行工具调用
 * 优先级：Skill 本地 → MCP Hub 统一路由 → 本地 Fallback
 * workspacePath: 指定 session 的工作目录，为空则使用默认 PROJECT_ROOT
 */
export async function executeTool(
  toolName: string,
  input: Record<string, string>,
  workspacePath?: string,
  signal?: AbortSignal
): Promise<ToolResult> {
  if (signal?.aborted) {
    return { success: false, content: "", error: "Aborted" };
  }

  // 1. 尝试 Skill 本地工具
  const skillResult = await executeSkillTool(toolName, input);
  if (skillResult) return skillResult;

  // 2. 尝试 MCP Hub 统一路由
  const hub = getMCPHub();
  if (hub) {
    const hubResult = await hub.executeTool(toolName, input, workspacePath, signal);
    if (hubResult) {
      return {
        success: hubResult.success,
        content: hubResult.content,
        error: hubResult.error,
      };
    }
  }

  // 2.5 兼容：直接 MCP Client（Hub 初始化失败时的降级路径）
  if (mcpClient && mcpAvailable) {
    const mcpArgs = workspacePath ? { ...input, workspacePath } : input;
    const mcpResult = await mcpClient.executeTool(toolName, mcpArgs);
    return {
      success: mcpResult.success,
      content: mcpResult.content,
      error: mcpResult.error,
    };
  }

  // 3. Fallback: 本地执行
  return executeLocally(toolName, input, workspacePath, signal);
}

// ========== 本地执行 (Fallback) ==========

import { exec, type ChildProcess } from "child_process";
import { promises as fs } from "fs";
import path from "path";
import { promisify } from "util";

const execAsync = promisify(exec);
const DANGEROUS_COMMANDS = ["rm -rf /", "mkfs", "dd if=", ":(){ :|:& };:"];
const PROJECT_ROOT = process.cwd();

function isCommandSafe(command: string): boolean {
  return !DANGEROUS_COMMANDS.some((cmd) => command.includes(cmd));
}

async function executeLocally(
  toolName: string,
  input: Record<string, string>,
  workspacePath?: string,
  signal?: AbortSignal
): Promise<ToolResult> {
  if (signal?.aborted) {
    return { success: false, content: "", error: "Aborted" };
  }
  // 如果指定了 workspacePath，使用该路径作为项目根目录
  const effectiveRoot = workspacePath || PROJECT_ROOT;
  try {
    switch (toolName) {
      case "read_directory":
        return await readDirectory(input.path, effectiveRoot);
      case "read_file":
        return await readFile(input.path, effectiveRoot);
      case "write_file":
        return await writeFile(input.path, input.content, effectiveRoot);
      case "list_files":
        return await listFiles(effectiveRoot);
      case "execute_bash":
      case "execute_command":
        return await executeBash(input.command, effectiveRoot, signal);
      case "git_status":
        return await gitStatus(effectiveRoot);
      case "git_diff":
        return await gitDiff(input.path, effectiveRoot);
      default:
        return { success: false, content: "", error: `Unknown tool: ${toolName}` };
    }
  } catch (error) {
    if (signal?.aborted) {
      return { success: false, content: "", error: "Aborted" };
    }
    return {
      success: false,
      content: "",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function readDirectory(dirPath: string, root: string = PROJECT_ROOT): Promise<ToolResult> {
  const fullPath = path.resolve(root, dirPath || ".");
  if (!fullPath.startsWith(root)) {
    return { success: false, content: "", error: "Access denied: path outside project root" };
  }
  try {
    const entries = await fs.readdir(fullPath, { withFileTypes: true });
    const result = entries
      .filter((e) => !e.name.startsWith(".") && e.name !== "node_modules")
      .map((e) => `${e.isDirectory() ? "📁" : "📄"} ${e.name}`);
    return { success: true, content: result.join("\n") || "(empty directory)" };
  } catch (error) {
    return { success: false, content: "", error: `Failed to read directory: ${error instanceof Error ? error.message : String(error)}` };
  }
}

async function readFile(filePath: string, root: string = PROJECT_ROOT): Promise<ToolResult> {
  const fullPath = path.resolve(root, filePath);
  if (!fullPath.startsWith(root)) {
    return { success: false, content: "", error: "Access denied: path outside project root" };
  }
  try {
    const content = await fs.readFile(fullPath, "utf-8");
    return { success: true, content };
  } catch (error) {
    return { success: false, content: "", error: `Failed to read file: ${error instanceof Error ? error.message : String(error)}` };
  }
}

async function writeFile(filePath: string, content: string, root: string = PROJECT_ROOT): Promise<ToolResult> {
  const fullPath = path.resolve(root, filePath);
  if (!fullPath.startsWith(root)) {
    return { success: false, content: "", error: "Access denied: path outside project root" };
  }
  try {
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, content, "utf-8");
    return { success: true, content: `File written: ${filePath}` };
  } catch (error) {
    return { success: false, content: "", error: `Failed to write file: ${error instanceof Error ? error.message : String(error)}` };
  }
}

async function listFiles(root: string = PROJECT_ROOT): Promise<ToolResult> {
  try {
    const { stdout } = await execAsync(
      `find . -not -path '*/node_modules/*' -not -path '*/.git/*' -not -path '*/.next/*' -not -name '.*' -type f | head -100`,
      { cwd: root }
    );
    return { success: true, content: stdout || "(no files found)" };
  } catch (error) {
    return { success: false, content: "", error: `Failed to list files: ${error instanceof Error ? error.message : String(error)}` };
  }
}

async function executeBash(command: string, root: string = PROJECT_ROOT, signal?: AbortSignal): Promise<ToolResult> {
  if (!isCommandSafe(command)) {
    return { success: false, content: "", error: `Command blocked by security policy: "${command}"` };
  }
  try {
    const child: ChildProcess = exec(command, {
      cwd: root,
      timeout: 30000,
      maxBuffer: 1024 * 1024,
    });

    // 中止时 kill 子进程
    const onAbort = () => child.kill("SIGTERM");
    signal?.addEventListener("abort", onAbort, { once: true });

    const result = await new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
      let stdout = "";
      let stderr = "";
      child.stdout?.on("data", (d) => { stdout += d; });
      child.stderr?.on("data", (d) => { stderr += d; });
      child.on("close", (code) => {
        signal?.removeEventListener("abort", onAbort);
        if (code === 0 || signal?.aborted) {
          resolve({ stdout, stderr });
        } else {
          reject(new Error(stderr || `Exit code ${code}`));
        }
      });
      child.on("error", (err) => {
        signal?.removeEventListener("abort", onAbort);
        reject(err);
      });
    });

    if (signal?.aborted) {
      return { success: false, content: "", error: "Aborted" };
    }

    return { success: true, content: result.stdout || result.stderr || "Command executed (no output)" };
  } catch (error) {
    if (signal?.aborted) {
      return { success: false, content: "", error: "Aborted" };
    }
    return { success: false, content: "", error: `Command failed: ${error instanceof Error ? error.message : String(error)}` };
  }
}

async function gitStatus(root: string = PROJECT_ROOT): Promise<ToolResult> {
  try {
    const { stdout } = await execAsync("git status", { cwd: root });
    return { success: true, content: stdout };
  } catch (error) {
    return { success: false, content: "", error: `Git status failed: ${error instanceof Error ? error.message : String(error)}` };
  }
}

async function gitDiff(filePath?: string, root: string = PROJECT_ROOT): Promise<ToolResult> {
  try {
    const cmd = filePath ? `git diff ${filePath}` : "git diff";
    const { stdout } = await execAsync(cmd, { cwd: root });
    return { success: true, content: stdout || "(no changes)" };
  } catch (error) {
    return { success: false, content: "", error: `Git diff failed: ${error instanceof Error ? error.message : String(error)}` };
  }
}
