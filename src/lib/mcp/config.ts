/**
 * MCP Server 配置持久化
 * 读写 data/mcp-servers.json
 */

import { promises as fs } from "fs";
import path from "path";
import type { MCPServerConfig } from "./types";

const DATA_DIR = path.join(process.cwd(), "data");
const CONFIG_FILE = path.join(DATA_DIR, "mcp-servers.json");

/** 读取所有 MCP Server 配置 */
export async function loadServerConfigs(): Promise<MCPServerConfig[]> {
  try {
    const content = await fs.readFile(CONFIG_FILE, "utf-8");
    const configs = JSON.parse(content);
    if (!Array.isArray(configs)) return [];
    return configs;
  } catch {
    // 文件不存在或解析失败，返回空数组
    return [];
  }
}

/** 保存所有 MCP Server 配置 */
export async function saveServerConfigs(configs: MCPServerConfig[]): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(CONFIG_FILE, JSON.stringify(configs, null, 2), "utf-8");
}

/** 添加 MCP Server 配置 */
export async function addServerConfig(config: MCPServerConfig): Promise<void> {
  const configs = await loadServerConfigs();
  // 检查 ID 是否重复
  if (configs.some((c) => c.id === config.id)) {
    throw new Error(`MCP Server with id "${config.id}" already exists`);
  }
  configs.push({ ...config, addedAt: Date.now() });
  await saveServerConfigs(configs);
}

/** 更新 MCP Server 配置 */
export async function updateServerConfig(
  id: string,
  updates: Partial<MCPServerConfig>
): Promise<MCPServerConfig | null> {
  const configs = await loadServerConfigs();
  const index = configs.findIndex((c) => c.id === id);
  if (index === -1) return null;
  // 不允许修改 id
  const { id: _, ...safeUpdates } = updates;
  configs[index] = { ...configs[index], ...safeUpdates };
  await saveServerConfigs(configs);
  return configs[index];
}

/** 删除 MCP Server 配置 */
export async function removeServerConfig(id: string): Promise<boolean> {
  const configs = await loadServerConfigs();
  const filtered = configs.filter((c) => c.id !== id);
  if (filtered.length === configs.length) return false;
  await saveServerConfigs(filtered);
  return true;
}

/** 获取单个 MCP Server 配置 */
export async function getServerConfig(id: string): Promise<MCPServerConfig | null> {
  const configs = await loadServerConfigs();
  return configs.find((c) => c.id === id) || null;
}
