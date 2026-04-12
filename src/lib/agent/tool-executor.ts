/**
 * Agent 工具执行器
 * 支持三种模式：
 *   1. Skill 本地模式: 执行 Skill 注册的本地工具
 *   2. MCP 模式 (推荐): 通过 MCP Client 调用远程 CDE 容器
 *   3. 本地模式 (fallback): 直接在 Node.js 进程中执行
 * Phase 5: 集成 Skill 工具路由
 */

import { MCPClient, type MCPToolResult } from "../mcp/client";
import { executeSkillTool } from "../skill/executor";

export interface ToolResult {
  success: boolean;
  content: string;
  error?: string;
}

let mcpClient: MCPClient | null = null;
let mcpAvailable = false;

/**
 * 初始化 MCP 客户端
 * 在控制平面启动时调用
 */
export async function initMCPClient(serverUrl?: string): Promise<boolean> {
  const url = serverUrl || process.env.MCP_SERVER_URL || "http://localhost:3001";
  mcpClient = new MCPClient(url);

  mcpAvailable = await mcpClient.healthCheck();
  if (mcpAvailable) {
    console.log(`[MCP] Connected to MCP Server at ${url}`);
  } else {
    console.log(`[MCP] MCP Server not available at ${url}, using local fallback`);
  }

  return mcpAvailable;
}

/**
 * 执行工具调用
 * 优先级：Skill 本地 → MCP 远程 → 本地 Fallback
 * workspacePath: 指定 session 的工作目录，为空则使用默认 PROJECT_ROOT
 */
export async function executeTool(
  toolName: string,
  input: Record<string, string>,
  workspacePath?: string
): Promise<ToolResult> {
  // 1. 尝试 Skill 本地工具
  const skillResult = await executeSkillTool(toolName, input);
  if (skillResult) return skillResult;

  // 2. 尝试 MCP 远程执行
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
  return executeLocally(toolName, input, workspacePath);
}

// ========== 本地执行 (Fallback) ==========

import { exec } from "child_process";
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
  workspacePath?: string
): Promise<ToolResult> {
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
        return await executeBash(input.command, effectiveRoot);
      case "git_status":
        return await gitStatus(effectiveRoot);
      case "git_diff":
        return await gitDiff(input.path, effectiveRoot);
      default:
        return { success: false, content: "", error: `Unknown tool: ${toolName}` };
    }
  } catch (error) {
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

async function executeBash(command: string, root: string = PROJECT_ROOT): Promise<ToolResult> {
  if (!isCommandSafe(command)) {
    return { success: false, content: "", error: `Command blocked by security policy: "${command}"` };
  }
  try {
    const { stdout, stderr } = await execAsync(command, {
      cwd: root,
      timeout: 30000,
      maxBuffer: 1024 * 1024,
    });
    return { success: true, content: stdout || stderr || "Command executed (no output)" };
  } catch (error) {
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
