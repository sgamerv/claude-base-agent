/**
 * Session Manager
 * 管理 Session 的 CRUD 操作，JSON 文件持久化，workspace 目录管理
 */

import { promises as fs } from "fs";
import path from "path";
import { v4 as uuidv4 } from "uuid";

// ========== 数据模型 ==========

export interface Session {
  id: string;
  name: string;
  createdAt: number;
  lastActiveAt: number;
  workspacePath: string; // 相对路径: workspaces/{id}
  entryMode: "chat" | "editor";
}

// ========== 存储路径 ==========

const PROJECT_ROOT = process.cwd();
const DATA_DIR = path.join(PROJECT_ROOT, "data");
const SESSIONS_FILE = path.join(DATA_DIR, "sessions.json");
const WORKSPACES_DIR = path.join(PROJECT_ROOT, "workspaces");

// ========== 文件读写 ==========

async function ensureDataDir(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.mkdir(WORKSPACES_DIR, { recursive: true });
}

async function readSessionsFile(): Promise<Session[]> {
  try {
    const content = await fs.readFile(SESSIONS_FILE, "utf-8");
    return JSON.parse(content);
  } catch {
    return [];
  }
}

async function writeSessionsFile(sessions: Session[]): Promise<void> {
  await ensureDataDir();
  await fs.writeFile(SESSIONS_FILE, JSON.stringify(sessions, null, 2), "utf-8");
}

// ========== CRUD 操作 ==========

/**
 * 列出所有 session（按 lastActiveAt 降序）
 */
export async function listSessions(): Promise<Session[]> {
  const sessions = await readSessionsFile();
  return sessions.sort((a, b) => b.lastActiveAt - a.lastActiveAt);
}

/**
 * 获取单个 session
 */
export async function getSession(id: string): Promise<Session | null> {
  const sessions = await readSessionsFile();
  return sessions.find((s) => s.id === id) || null;
}

/**
 * 创建新 session
 * 自动创建 workspace 目录
 */
export async function createSession(name?: string): Promise<Session> {
  const id = uuidv4().slice(0, 8);
  const now = Date.now();
  const workspacePath = `workspaces/${id}`;

  const session: Session = {
    id,
    name: name || "新会话",
    createdAt: now,
    lastActiveAt: now,
    workspacePath,
    entryMode: "chat",
  };

  // 创建 workspace 目录
  const absWorkspaceDir = path.join(PROJECT_ROOT, workspacePath);
  await fs.mkdir(absWorkspaceDir, { recursive: true });

  // 写入 sessions.json
  const sessions = await readSessionsFile();
  sessions.push(session);
  await writeSessionsFile(sessions);

  console.log(`[Session] Created: ${id} → ${workspacePath}`);
  return session;
}

/**
 * 更新 session（重命名等）
 */
export async function updateSession(
  id: string,
  updates: Partial<Pick<Session, "name" | "entryMode">>
): Promise<Session | null> {
  const sessions = await readSessionsFile();
  const idx = sessions.findIndex((s) => s.id === id);
  if (idx === -1) return null;

  sessions[idx] = {
    ...sessions[idx],
    ...updates,
    lastActiveAt: Date.now(),
  };

  await writeSessionsFile(sessions);
  return sessions[idx];
}

/**
 * 删除 session
 * 清理 workspace 目录 + sessions.json 记录
 */
export async function deleteSession(id: string): Promise<boolean> {
  const sessions = await readSessionsFile();
  const idx = sessions.findIndex((s) => s.id === id);
  if (idx === -1) return false;

  const session = sessions[idx];

  // 递归删除 workspace 目录
  const absWorkspaceDir = path.join(PROJECT_ROOT, session.workspacePath);
  try {
    await fs.rm(absWorkspaceDir, { recursive: true, force: true });
    console.log(`[Session] Deleted workspace: ${absWorkspaceDir}`);
  } catch (err) {
    console.warn(`[Session] Failed to delete workspace: ${absWorkspaceDir}`, err);
  }

  // 从 sessions.json 中移除
  sessions.splice(idx, 1);
  await writeSessionsFile(sessions);

  console.log(`[Session] Deleted: ${id}`);
  return true;
}

/**
 * 获取 session 的 workspace 绝对路径
 */
export function getWorkspaceAbsPath(session: Session): string {
  return path.join(PROJECT_ROOT, session.workspacePath);
}

/**
 * 根据 session ID 获取 workspace 绝对路径
 */
export async function getWorkspacePathBySessionId(sessionId: string): Promise<string | null> {
  const session = await getSession(sessionId);
  if (!session) return null;
  return getWorkspaceAbsPath(session);
}
