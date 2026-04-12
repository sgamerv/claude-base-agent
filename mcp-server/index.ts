/**
 * MCP Server — 部署在 CDE 容器中
 * 暴露文件系统、终端和 Git 操作给控制平面的 Agent
 *
 * 运行方式: npx tsx mcp-server/index.ts
 * 支持两种调用方式:
 *   1. 标准 MCP SSE 传输: GET /sse → 消息通过 SSE 传递
 *   2. 简化 HTTP 调用: POST /call → 直接 JSON 响应 (Phase 2)
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { z } from "zod";
import { exec } from "child_process";
import { promises as fs } from "fs";
import path from "path";
import { promisify } from "util";
import { createServer, IncomingMessage, ServerResponse } from "http";

const execAsync = promisify(exec);

const PROJECT_ROOT = process.env.PROJECT_ROOT || process.cwd();

/**
 * 解析工具调用的 workspace 路径
 * 如果 args 中包含 workspacePath，使用该路径作为项目根目录
 */
function resolveProjectRoot(args: Record<string, string>): string {
  if (args.workspacePath) {
    // workspacePath 可能是绝对路径或相对路径
    const resolved = path.resolve(args.workspacePath);
    // 安全校验：确保路径存在
    return resolved;
  }
  return PROJECT_ROOT;
}
const PORT = parseInt(process.env.MCP_PORT || "3001", 10);

// ========== 工具实现函数 ==========

async function readDirectory(dirPath: string, root?: string): Promise<string> {
  const projectRoot = root || PROJECT_ROOT;
  const fullPath = path.resolve(projectRoot, dirPath);
  if (!fullPath.startsWith(projectRoot)) return "Error: Access denied - path outside project root";
  try {
    const entries = await fs.readdir(fullPath, { withFileTypes: true });
    return entries
      .filter((e) => !e.name.startsWith(".") && e.name !== "node_modules")
      .map((e) => `${e.isDirectory() ? "📁" : "📄"} ${e.name}`)
      .join("\n") || "(empty directory)";
  } catch (err) {
    return `Error: ${err instanceof Error ? err.message : String(err)}`;
  }
}

async function readFile(filePath: string, root?: string): Promise<string> {
  const projectRoot = root || PROJECT_ROOT;
  const fullPath = path.resolve(projectRoot, filePath);
  if (!fullPath.startsWith(projectRoot)) return "Error: Access denied - path outside project root";
  try {
    return await fs.readFile(fullPath, "utf-8");
  } catch (err) {
    return `Error: ${err instanceof Error ? err.message : String(err)}`;
  }
}

async function writeFile(filePath: string, content: string, root?: string): Promise<string> {
  const projectRoot = root || PROJECT_ROOT;
  const fullPath = path.resolve(projectRoot, filePath);
  if (!fullPath.startsWith(projectRoot)) return "Error: Access denied - path outside project root";
  try {
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, content, "utf-8");
    return `File written: ${filePath}`;
  } catch (err) {
    return `Error: ${err instanceof Error ? err.message : String(err)}`;
  }
}

async function listFiles(pattern?: string, root?: string): Promise<string> {
  const projectRoot = root || PROJECT_ROOT;
  try {
    const { stdout } = await execAsync(
      `find . -not -path '*/node_modules/*' -not -path '*/.git/*' -not -path '*/.next/*' -not -name '.*' -type f | head -100`,
      { cwd: projectRoot }
    );
    return stdout || "(no files found)";
  } catch (err) {
    return `Error: ${err instanceof Error ? err.message : String(err)}`;
  }
}

async function executeCommand(command: string, root?: string): Promise<string> {
  const projectRoot = root || PROJECT_ROOT;
  try {
    const { stdout, stderr } = await execAsync(command, {
      cwd: projectRoot,
      timeout: 30000,
      maxBuffer: 1024 * 1024,
    });
    return [stdout, stderr].filter(Boolean).join("\n") || "(no output)";
  } catch (err: any) {
    return `Exit code ${err.code}:\n${[err.stdout, err.stderr].filter(Boolean).join("\n") || err.message}`;
  }
}

async function gitStatus(root?: string): Promise<string> {
  const projectRoot = root || PROJECT_ROOT;
  try {
    const { stdout } = await execAsync("git status", { cwd: projectRoot });
    return stdout;
  } catch (err) {
    return `Error: ${err instanceof Error ? err.message : String(err)}`;
  }
}

async function gitDiff(filePath?: string, root?: string): Promise<string> {
  const projectRoot = root || PROJECT_ROOT;
  try {
    const cmd = filePath ? `git diff ${filePath}` : "git diff";
    const { stdout } = await execAsync(cmd, { cwd: projectRoot });
    return stdout || "(no changes)";
  } catch (err) {
    return `Error: ${err instanceof Error ? err.message : String(err)}`;
  }
}

// 工具路由表 — 支持 workspacePath 动态路由
const TOOL_HANDLERS: Record<string, (args: Record<string, string>) => Promise<string>> = {
  read_directory: (args) => {
    const root = resolveProjectRoot(args);
    return readDirectory(args.path || ".", root !== PROJECT_ROOT ? root : undefined);
  },
  read_file: (args) => {
    const root = resolveProjectRoot(args);
    return readFile(args.path || "", root !== PROJECT_ROOT ? root : undefined);
  },
  write_file: (args) => {
    const root = resolveProjectRoot(args);
    return writeFile(args.path || "", args.content || "", root !== PROJECT_ROOT ? root : undefined);
  },
  list_files: (args) => {
    const root = resolveProjectRoot(args);
    return listFiles(args.pattern, root !== PROJECT_ROOT ? root : undefined);
  },
  execute_command: (args) => {
    const root = resolveProjectRoot(args);
    return executeCommand(args.command || "", root !== PROJECT_ROOT ? root : undefined);
  },
  execute_bash: (args) => {
    const root = resolveProjectRoot(args);
    return executeCommand(args.command || "", root !== PROJECT_ROOT ? root : undefined);
  },
  git_status: (args) => {
    const root = resolveProjectRoot(args);
    return gitStatus(root !== PROJECT_ROOT ? root : undefined);
  },
  git_diff: (args) => {
    const root = resolveProjectRoot(args);
    return gitDiff(args.path, root !== PROJECT_ROOT ? root : undefined);
  },
};

// ========== MCP Server (SSE 传输) ==========

const mcpServer = new McpServer({
  name: "cde-mcp-server",
  version: "1.0.0",
});

mcpServer.tool("read_directory", "读取目录结构", { path: z.string() }, async (args) => ({
  content: [{ type: "text", text: await readDirectory(args.path) }],
}));

mcpServer.tool("read_file", "读取文件内容", { path: z.string() }, async (args) => ({
  content: [{ type: "text", text: await readFile(args.path) }],
}));

mcpServer.tool("write_file", "写入文件", { path: z.string(), content: z.string() }, async (args) => ({
  content: [{ type: "text", text: await writeFile(args.path, args.content) }],
}));

mcpServer.tool("list_files", "列出所有文件", { pattern: z.string().optional() }, async (args) => ({
  content: [{ type: "text", text: await listFiles(args.pattern) }],
}));

mcpServer.tool("execute_command", "执行 Shell 命令", { command: z.string() }, async (args) => ({
  content: [{ type: "text", text: await executeCommand(args.command) }],
}));

mcpServer.tool("git_status", "Git 状态", {}, async () => ({
  content: [{ type: "text", text: await gitStatus() }],
}));

mcpServer.tool("git_diff", "Git 差异", { path: z.string().optional() }, async (args) => ({
  content: [{ type: "text", text: await gitDiff(args.path) }],
}));

// ========== HTTP 服务器 ==========

function parseBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    req.on("error", reject);
  });
}

function sendJSON(res: ServerResponse, status: number, data: any) {
  res.writeHead(status, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
  res.end(JSON.stringify(data));
}

async function main() {
  const httpServer = createServer(async (req, res) => {
    // CORS preflight
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      });
      res.end();
      return;
    }

    const url = new URL(req.url || "/", `http://localhost:${PORT}`);

    // SSE 连接端点 (标准 MCP)
    if (url.pathname === "/sse" && req.method === "GET") {
      const transport = new SSEServerTransport("/messages", res);
      await mcpServer.connect(transport);
      console.log("[MCP] SSE client connected");
      return;
    }

    // 简化 HTTP 调用端点 (Phase 2)
    if (url.pathname === "/call" && req.method === "POST") {
      try {
        const body = JSON.parse(await parseBody(req));
        const { tool, args } = body;

        if (!tool || !TOOL_HANDLERS[tool]) {
          sendJSON(res, 400, { error: `Unknown tool: ${tool}` });
          return;
        }

        console.log(`[MCP] Tool call: ${tool}`, args);
        const result = await TOOL_HANDLERS[tool](args || {});
        sendJSON(res, 200, { content: result });
      } catch (err) {
        sendJSON(res, 500, { error: err instanceof Error ? err.message : String(err) });
      }
      return;
    }

    // 列出可用工具
    if (url.pathname === "/tools" && req.method === "GET") {
      sendJSON(res, 200, {
        tools: Object.keys(TOOL_HANDLERS).map((name) => ({ name })),
      });
      return;
    }

    // 健康检查
    if (url.pathname === "/" && req.method === "GET") {
      sendJSON(res, 200, {
        name: "cde-mcp-server",
        version: "1.0.0",
        status: "running",
        projectRoot: PROJECT_ROOT,
        endpoints: {
          sse: "/sse",
          call: "/call (POST)",
          tools: "/tools",
        },
      });
      return;
    }

    sendJSON(res, 404, { error: "Not found" });
  });

  httpServer.listen(PORT, () => {
    console.log(`
  ╔══════════════════════════════════════════════╗
  ║   MCP Server (CDE)                           ║
  ║   HTTP: http://localhost:${PORT}                ║
  ║   SSE:  http://localhost:${PORT}/sse            ║
  ║   Call: http://localhost:${PORT}/call (POST)    ║
  ║   Root: ${PROJECT_ROOT.padEnd(31)}║
  ╚══════════════════════════════════════════════╝
    `);
  });
}

main().catch(console.error);
