"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";

interface Session {
  id: string;
  name: string;
  createdAt: number;
  lastActiveAt: number;
  workspacePath: string;
  entryMode: "chat" | "editor";
}

interface Skill {
  id: string;
  name: string;
  description: string;
  icon: string;
  version: string;
  author: string;
  category: "built-in" | "extension";
  tools: { name: string; description: string }[];
  enabled: boolean;
  installedAt?: number;
}

function relativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes}分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}小时前`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}天前`;
  return new Date(timestamp).toLocaleDateString("zh-CN");
}

export default function HomePage() {
  const router = useRouter();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewForm, setShowNewForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Skill 状态
  const [installedSkills, setInstalledSkills] = useState<Skill[]>([]);
  const [marketSkills, setMarketSkills] = useState<Skill[]>([]);
  const [showMarket, setShowMarket] = useState(false);
  const [installingId, setInstallingId] = useState<string | null>(null);
  const [uninstallingId, setUninstallingId] = useState<string | null>(null);

  const fetchSessions = useCallback(async () => {
    try {
      const res = await fetch("/api/sessions");
      const data = await res.json();
      setSessions(data.sessions || []);
    } catch (err) {
      console.error("Failed to fetch sessions:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchSkills = useCallback(async () => {
    try {
      const res = await fetch("/api/skills");
      const data = await res.json();
      setInstalledSkills(data.installed || []);
      setMarketSkills(data.market || []);
    } catch (err) {
      console.error("Failed to fetch skills:", err);
    }
  }, []);

  useEffect(() => {
    fetchSessions();
    fetchSkills();
  }, [fetchSessions, fetchSkills]);

  const handleCreate = async () => {
    if (creating) return;
    setCreating(true);
    try {
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim() || "新会话" }),
      });
      const data = await res.json();
      if (data.session) {
        router.push(`/chat/${data.session.id}`);
      }
    } catch (err) {
      console.error("Failed to create session:", err);
    } finally {
      setCreating(false);
      setShowNewForm(false);
      setNewName("");
    }
  };

  const handleDelete = async (id: string) => {
    if (deletingId) return;
    if (!confirm("确定删除此会话？此操作将同时清理对应的沙箱工作区，不可恢复。")) return;
    setDeletingId(id);
    try {
      await fetch(`/api/sessions/${id}`, { method: "DELETE" });
      setSessions((prev) => prev.filter((s) => s.id !== id));
    } catch (err) {
      console.error("Failed to delete session:", err);
    } finally {
      setDeletingId(null);
    }
  };

  const handleRename = async (id: string, newName: string) => {
    if (!newName.trim()) return;
    try {
      await fetch(`/api/sessions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim() }),
      });
      setSessions((prev) =>
        prev.map((s) => (s.id === id ? { ...s, name: newName.trim() } : s))
      );
    } catch (err) {
      console.error("Failed to rename session:", err);
    }
  };

  const handleInstall = async (skillId: string) => {
    if (installingId) return;
    setInstallingId(skillId);
    try {
      await fetch("/api/skills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skillId }),
      });
      await fetchSkills();
    } catch (err) {
      console.error("Failed to install skill:", err);
    } finally {
      setInstallingId(null);
    }
  };

  const handleUninstall = async (skillId: string) => {
    if (uninstallingId) return;
    if (!confirm("确定卸载此技能？")) return;
    setUninstallingId(skillId);
    try {
      await fetch(`/api/skills/${skillId}`, { method: "DELETE" });
      await fetchSkills();
    } catch (err) {
      console.error("Failed to uninstall skill:", err);
    } finally {
      setUninstallingId(null);
    }
  };

  const handleToggle = async (skillId: string, enabled: boolean) => {
    try {
      await fetch(`/api/skills/${skillId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
      await fetchSkills();
    } catch (err) {
      console.error("Failed to toggle skill:", err);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 px-4 py-12">
      <div className="max-w-3xl mx-auto">
        {/* 标题 */}
        <div className="text-center mb-10">
          <div className="text-5xl mb-4">🤖</div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50 mb-2">
            Cloud CDE Agent
          </h1>
          <p className="text-zinc-500 dark:text-zinc-400 text-sm">
            基于 GLM-5.1 的 AI 编程助手，支持独立沙箱环境
          </p>
        </div>

        {/* 会话列表 */}
        <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden mb-6">
          {/* 列表头 */}
          <div className="flex items-center justify-between px-5 py-3 border-b border-zinc-200 dark:border-zinc-800">
            <h2 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              我的会话
            </h2>
            <button
              onClick={() => setShowNewForm(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 transition-colors"
            >
              <span className="text-sm leading-none">+</span>
              新建
            </button>
          </div>

          {/* 新建表单 */}
          {showNewForm && (
            <div className="px-5 py-3 border-b border-zinc-200 dark:border-zinc-800 bg-blue-50 dark:bg-blue-950/30">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleCreate();
                    if (e.key === "Escape") {
                      setShowNewForm(false);
                      setNewName("");
                    }
                  }}
                  placeholder="输入会话名称..."
                  autoFocus
                  className="flex-1 rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-3 py-1.5 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  onClick={handleCreate}
                  disabled={creating}
                  className="rounded-lg bg-blue-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {creating ? "创建中..." : "创建"}
                </button>
                <button
                  onClick={() => {
                    setShowNewForm(false);
                    setNewName("");
                  }}
                  className="rounded-lg border border-zinc-300 dark:border-zinc-600 px-4 py-1.5 text-xs text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                >
                  取消
                </button>
              </div>
            </div>
          )}

          {/* 列表内容 */}
          {loading ? (
            <div className="px-5 py-8 text-center text-zinc-400 text-sm">
              加载中...
            </div>
          ) : sessions.length === 0 ? (
            <div className="px-5 py-12 text-center">
              <div className="text-3xl mb-3">📂</div>
              <p className="text-zinc-400 text-sm mb-1">还没有会话</p>
              <p className="text-zinc-400 text-xs">点击上方「新建」创建你的第一个沙箱工作区</p>
            </div>
          ) : (
            <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {sessions.map((session) => (
                <li
                  key={session.id}
                  className="group px-5 py-3.5 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm">📁</span>
                        <span
                          className="text-sm font-medium text-zinc-800 dark:text-zinc-200 truncate cursor-text outline-none border-b border-transparent hover:border-zinc-300 dark:hover:border-zinc-600 focus:border-blue-500 transition-colors"
                          contentEditable
                          suppressContentEditableWarning
                          onBlur={(e) => {
                            const newName = e.currentTarget.textContent?.trim();
                            if (newName && newName !== session.name) {
                              handleRename(session.id, newName);
                            }
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              e.currentTarget.blur();
                            }
                          }}
                        >
                          {session.name}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs text-zinc-400">
                        <span>{relativeTime(session.lastActiveAt)}</span>
                        <span className="font-mono text-zinc-300 dark:text-zinc-600">
                          {session.id}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 ml-4">
                      <button
                        onClick={() => router.push(`/chat/${session.id}`)}
                        className="rounded-md px-2.5 py-1.5 text-xs text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 transition-colors"
                        title="打开聊天界面"
                      >
                        💬 聊天
                      </button>
                      <button
                        onClick={() => router.push(`/editor/${session.id}`)}
                        className="rounded-md px-2.5 py-1.5 text-xs text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 transition-colors"
                        title="打开编辑器"
                      >
                        📝 编辑器
                      </button>
                      <button
                        onClick={() => handleDelete(session.id)}
                        disabled={deletingId === session.id}
                        className="rounded-md px-2.5 py-1.5 text-xs text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 border border-transparent hover:border-red-200 dark:hover:border-red-800 disabled:opacity-50 transition-colors"
                        title="删除会话及沙箱"
                      >
                        {deletingId === session.id ? "删除中..." : "🗑"}
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Skill 面板 */}
        <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
          {/* 面板头 */}
          <div className="flex items-center justify-between px-5 py-3 border-b border-zinc-200 dark:border-zinc-800">
            <h2 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              🧩 已安装技能
            </h2>
            {marketSkills.length > 0 && (
              <button
                onClick={() => setShowMarket(!showMarket)}
                className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
              >
                {showMarket ? "收起市场" : `浏览更多 (${marketSkills.length})`}
              </button>
            )}
          </div>

          {/* 已安装 Skill 列表 */}
          {installedSkills.length === 0 ? (
            <div className="px-5 py-8 text-center text-zinc-400 text-sm">
              暂无技能
            </div>
          ) : (
            <div className="p-4 grid grid-cols-2 sm:grid-cols-3 gap-3">
              {installedSkills.map((skill) => (
                <div
                  key={skill.id}
                  className={`relative rounded-lg border p-3 transition-colors ${
                    skill.enabled
                      ? "border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/50"
                      : "border-zinc-200 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800/30 opacity-60"
                  }`}
                >
                  {/* Skill 信息 */}
                  <div className="flex items-start gap-2">
                    <span className="text-xl leading-none mt-0.5">{skill.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200 truncate">
                          {skill.name}
                        </span>
                      </div>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 line-clamp-2">
                        {skill.description}
                      </p>
                      <div className="flex items-center gap-2 mt-1.5">
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                            skill.category === "built-in"
                              ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
                              : "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300"
                          }`}
                        >
                          {skill.category === "built-in" ? "内置" : "扩展"}
                        </span>
                        <span className="text-[10px] text-zinc-400">
                          {skill.tools.length} 工具
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* 操作按钮 */}
                  <div className="absolute top-2 right-2 flex items-center gap-1">
                    {/* 启用/禁用开关 */}
                    <button
                      onClick={() => handleToggle(skill.id, !skill.enabled)}
                      className={`w-8 h-4 rounded-full transition-colors relative ${
                        skill.enabled
                          ? "bg-blue-600"
                          : "bg-zinc-300 dark:bg-zinc-600"
                      }`}
                      title={skill.enabled ? "点击禁用" : "点击启用"}
                    >
                      <span
                        className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform ${
                          skill.enabled ? "translate-x-4" : "translate-x-0.5"
                        }`}
                      />
                    </button>
                  </div>

                  {/* 扩展 Skill 的卸载按钮 */}
                  {skill.category === "extension" && (
                    <button
                      onClick={() => handleUninstall(skill.id)}
                      disabled={uninstallingId === skill.id}
                      className="mt-2 w-full text-[10px] text-red-500 hover:text-red-600 dark:hover:text-red-400 border border-red-200 dark:border-red-800 rounded px-2 py-0.5 hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-50 transition-colors"
                    >
                      {uninstallingId === skill.id ? "卸载中..." : "卸载"}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Skill 市场弹窗 */}
          {showMarket && marketSkills.length > 0 && (
            <div className="border-t border-zinc-200 dark:border-zinc-800">
              <div className="px-5 py-2.5 bg-zinc-50 dark:bg-zinc-800/30 border-b border-zinc-200 dark:border-zinc-700">
                <h3 className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                  可安装技能
                </h3>
              </div>
              <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                {marketSkills.map((skill) => (
                  <div
                    key={skill.id}
                    className="rounded-lg border border-dashed border-zinc-300 dark:border-zinc-600 p-3 hover:border-blue-400 dark:hover:border-blue-500 transition-colors"
                  >
                    <div className="flex items-start gap-2">
                      <span className="text-xl leading-none mt-0.5">{skill.icon}</span>
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                          {skill.name}
                        </span>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 line-clamp-2">
                          {skill.description}
                        </p>
                        <div className="flex items-center gap-2 mt-1.5">
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300">
                            扩展
                          </span>
                          <span className="text-[10px] text-zinc-400">
                            {skill.tools.length} 工具
                          </span>
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => handleInstall(skill.id)}
                      disabled={installingId === skill.id}
                      className="mt-2 w-full text-xs text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800 rounded px-3 py-1 hover:bg-blue-50 dark:hover:bg-blue-950/30 disabled:opacity-50 transition-colors"
                    >
                      {installingId === skill.id ? "安装中..." : "安装"}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 底部信息 */}
        <div className="mt-6 text-center text-xs text-zinc-400">
          每个 session 拥有独立的沙箱工作区，互不影响
        </div>
      </div>
    </div>
  );
}
