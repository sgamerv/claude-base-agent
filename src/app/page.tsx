"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import MCPStatusBadge from "@/components/mcp/MCPStatusBadge";

interface Session {
  id: string;
  name: string;
  createdAt: number;
  lastActiveAt: number;
  workspacePath: string;
  entryMode: "chat" | "editor";
}

interface SkillSource {
  type: "market" | "zip" | "github" | "local" | "url";
  url?: string;
  ref?: string;
  installedAt: number;
  checksum?: string;
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
  source?: SkillSource;
  skillMdPath?: string;
}

interface SecurityIssue {
  level: "warning" | "block";
  file: string;
  message: string;
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

/** 获取 Skill 来源标识 */
function getSourceBadge(source?: SkillSource): { label: string; color: string } | null {
  if (!source) return null;
  switch (source.type) {
    case "github":
      return { label: "GitHub", color: "bg-[rgba(255,255,255,0.05)] text-text-secondary" };
    case "zip":
      return { label: "ZIP", color: "bg-[rgba(245,166,35,0.1)] text-status-warning" };
    case "local":
      return { label: "本地", color: "bg-[rgba(39,166,68,0.1)] text-status-success" };
    case "url":
      return { label: "URL", color: "bg-[rgba(113,112,255,0.1)] text-accent-interactive" };
    default:
      return null;
  }
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

  // 自定义安装状态
  const [showInstallDialog, setShowInstallDialog] = useState(false);
  const [installTab, setInstallTab] = useState<"url" | "local" | "zip">("url");
  const [installUrl, setInstallUrl] = useState("");
  const [installLocalPath, setInstallLocalPath] = useState("");
  const [installing, setInstalling] = useState(false);
  const [installError, setInstallError] = useState<string | null>(null);
  const [installPreview, setInstallPreview] = useState<{
    name: string; description: string; author: string; version: string;
  } | null>(null);
  const [installScanIssues, setInstallScanIssues] = useState<SecurityIssue[]>([]);
  const [installScanStatus, setInstallScanStatus] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [zipFile, setZipFile] = useState<File | null>(null);

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
      await fetch("/api/skills/install", {
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

  // ========== 自定义安装 ==========

  const resetInstallDialog = () => {
    setInstallUrl("");
    setInstallLocalPath("");
    setZipFile(null);
    setInstallError(null);
    setInstallPreview(null);
    setInstallScanIssues([]);
    setInstallScanStatus(null);
  };

  const handleOpenInstallDialog = () => {
    resetInstallDialog();
    setShowInstallDialog(true);
  };

  /** 预览 Skill（安装前扫描） */
  const handlePreviewInstall = async () => {
    setInstallError(null);
    setInstallPreview(null);
    setInstallScanIssues([]);
    setInstallScanStatus(null);

    try {
      let source;
      if (installTab === "url") {
        if (!installUrl.trim()) { setInstallError("请输入 URL"); return; }
        const isGitHub = installUrl.includes("github.com");
        source = { type: isGitHub ? "github" : "url", url: installUrl.trim() };
      } else if (installTab === "local") {
        if (!installLocalPath.trim()) { setInstallError("请输入本地路径"); return; }
        source = { type: "local", path: installLocalPath.trim() };
      } else {
        setInstallError("ZIP 上传不支持预览，请直接安装");
        return;
      }

      const res = await fetch("/api/skills/install", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source, preview: true }),
      });
      const data = await res.json();

      if (data.error) {
        setInstallError(data.error);
        return;
      }

      if (data.preview) {
        setInstallPreview(data.preview);
      }
      if (data.scanResult) {
        setInstallScanStatus(data.scanResult.status);
        setInstallScanIssues(data.scanResult.issues || []);
      }
      if (data.skills) {
        // GitHub 仓库根扫描返回多个 Skill
        setInstallError(`找到 ${data.skills.length} 个 Skill: ${data.skills.map((s: { name: string }) => s.name).join(", ")}。请使用指向特定 Skill 子目录的 URL 安装。`);
      }
    } catch (err) {
      setInstallError(err instanceof Error ? err.message : "预览失败");
    }
  };

  /** 执行安装 */
  const handleCustomInstall = async () => {
    setInstalling(true);
    setInstallError(null);

    try {
      if (installTab === "zip" && zipFile) {
        // ZIP 上传安装
        const formData = new FormData();
        formData.append("file", zipFile);

        const res = await fetch("/api/skills/install/upload", {
          method: "POST",
          body: formData,
        });
        const data = await res.json();

        if (!res.ok) {
          setInstallError(data.error || "安装失败");
          return;
        }

        if (data.securityScan?.status === "warning") {
          const confirmed = confirm(
            `安全扫描发现 ${data.securityScan.issues.length} 个警告项：\n` +
            data.securityScan.issues.map((i: SecurityIssue) => `- ${i.file}: ${i.message}`).join("\n") +
            "\n\n是否继续安装？"
          );
          if (!confirmed) return;
        }

        setShowInstallDialog(false);
        await fetchSkills();
        return;
      }

      // URL / 本地路径安装
      let source;
      if (installTab === "url") {
        if (!installUrl.trim()) { setInstallError("请输入 URL"); return; }
        const isGitHub = installUrl.includes("github.com");
        source = { type: isGitHub ? "github" : "url", url: installUrl.trim() };
      } else if (installTab === "local") {
        if (!installLocalPath.trim()) { setInstallError("请输入本地路径"); return; }
        source = { type: "local", path: installLocalPath.trim() };
      } else {
        setInstallError("请选择安装方式");
        return;
      }

      const res = await fetch("/api/skills/install", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source }),
      });
      const data = await res.json();

      if (!res.ok) {
        setInstallError(data.error || "安装失败");
        return;
      }

      if (data.securityScan?.status === "warning") {
        const confirmed = confirm(
          `安全扫描发现 ${data.securityScan.issues.length} 个警告项：\n` +
          data.securityScan.issues.map((i: SecurityIssue) => `- ${i.file}: ${i.message}`).join("\n") +
          "\n\n是否继续？"
        );
        if (!confirmed) {
          // 卸载刚安装的
          if (data.skill?.id) {
            await fetch(`/api/skills/${data.skill.id}`, { method: "DELETE" });
          }
          return;
        }
      }

      setShowInstallDialog(false);
      await fetchSkills();
    } catch (err) {
      setInstallError(err instanceof Error ? err.message : "安装失败");
    } finally {
      setInstalling(false);
    }
  };

  return (
    <div className="min-h-screen bg-bg-marketing px-4 py-12">
      <div className="max-w-3xl mx-auto">
        {/* 标题 */}
        <div className="text-center mb-10">
          <div className="text-5xl mb-4">🤖</div>
          <h1 className="text-2xl font-[510] text-text-primary mb-2">
            Cloud CDE Agent
          </h1>
          <p className="text-text-tertiary text-sm">
            基于 GLM-5.1 的 AI 编程助手，支持独立沙箱环境
          </p>
          <div className="mt-3 flex items-center justify-center gap-3">
            <MCPStatusBadge />
            <button
              onClick={() => router.push("/mcp")}
              className="text-xs text-accent-link hover:underline"
            >
              管理 MCP 服务 →
            </button>
          </div>
        </div>

        {/* 会话列表 */}
        <div className="bg-[rgba(255,255,255,0.02)] rounded-xl border border-border-standard overflow-hidden mb-6">
          {/* 列表头 */}
          <div className="flex items-center justify-between px-5 py-3 border-b border-border-subtle">
            <h2 className="text-sm font-[510] text-text-secondary">
              我的会话
            </h2>
            <button
              onClick={() => setShowNewForm(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-accent-brand px-3 py-1.5 text-xs font-[510] text-white hover:bg-accent-hover transition-colors"
            >
              <span className="text-sm leading-none">+</span>
              新建
            </button>
          </div>

          {/* 新建表单 */}
          {showNewForm && (
            <div className="px-5 py-3 border-b border-border-subtle bg-[rgba(94,106,210,0.06)]">
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
                  className="flex-1 rounded-lg border border-border-standard bg-[rgba(255,255,255,0.03)] px-3 py-1.5 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-brand"
                />
                <button
                  onClick={handleCreate}
                  disabled={creating}
                  className="rounded-lg bg-accent-brand px-4 py-1.5 text-xs font-[510] text-white hover:bg-accent-hover disabled:opacity-50 transition-colors"
                >
                  {creating ? "创建中..." : "创建"}
                </button>
                <button
                  onClick={() => {
                    setShowNewForm(false);
                    setNewName("");
                  }}
                  className="rounded-lg border border-border-standard px-4 py-1.5 text-xs text-text-muted hover:bg-[rgba(255,255,255,0.04)] transition-colors"
                >
                  取消
                </button>
              </div>
            </div>
          )}

          {/* 列表内容 */}
          {loading ? (
            <div className="px-5 py-8 text-center text-text-muted text-sm">
              加载中...
            </div>
          ) : sessions.length === 0 ? (
            <div className="px-5 py-12 text-center">
              <div className="text-3xl mb-3">📂</div>
              <p className="text-text-muted text-sm mb-1">还没有会话</p>
              <p className="text-text-muted text-xs">点击上方「新建」创建你的第一个沙箱工作区</p>
            </div>
          ) : (
            <ul className="divide-y divide-[rgba(255,255,255,0.03)]">
              {sessions.map((session) => (
                <li
                  key={session.id}
                  className="group px-5 py-3.5 hover:bg-[rgba(255,255,255,0.04)] transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm">📁</span>
                        <span
                          className="text-sm font-[510] text-text-primary truncate cursor-text outline-none border-b border-transparent hover:border-border-standard focus:border-accent-brand transition-colors"
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
                      <div className="flex items-center gap-3 mt-1 text-xs text-text-muted">
                        <span>{relativeTime(session.lastActiveAt)}</span>
                        <span className="font-mono text-text-muted">
                          {session.id}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 ml-4">
                      <button
                        onClick={() => router.push(`/chat/${session.id}`)}
                        className="rounded-md px-2.5 py-1.5 text-xs text-text-muted hover:bg-[rgba(255,255,255,0.04)] border border-border-standard transition-colors"
                        title="打开聊天界面"
                      >
                        💬 聊天
                      </button>
                      <button
                        onClick={() => router.push(`/editor/${session.id}`)}
                        className="rounded-md px-2.5 py-1.5 text-xs text-text-muted hover:bg-[rgba(255,255,255,0.04)] border border-border-standard transition-colors"
                        title="打开编辑器"
                      >
                        📝 编辑器
                      </button>
                      <button
                        onClick={() => handleDelete(session.id)}
                        disabled={deletingId === session.id}
                        className="rounded-md px-2.5 py-1.5 text-xs text-status-error hover:bg-[rgba(229,72,77,0.08)] border border-transparent hover:border-[rgba(229,72,77,0.2)] disabled:opacity-50 transition-colors"
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
        <div className="bg-[rgba(255,255,255,0.02)] rounded-xl border border-border-standard overflow-hidden">
          {/* 面板头 */}
          <div className="flex items-center justify-between px-5 py-3 border-b border-border-subtle">
            <h2 className="text-sm font-[510] text-text-secondary">
              🧩 已安装技能
            </h2>
            <div className="flex items-center gap-3">
              <button
                onClick={handleOpenInstallDialog}
                className="inline-flex items-center gap-1 rounded-lg bg-status-success px-3 py-1.5 text-xs font-[510] text-white hover:bg-[#2db84e] transition-colors"
              >
                ➕ 安装自定义
              </button>
              {marketSkills.length > 0 && (
                <button
                  onClick={() => setShowMarket(!showMarket)}
                  className="text-xs text-accent-link hover:underline"
                >
                  {showMarket ? "收起市场" : `市场 (${marketSkills.length})`}
                </button>
              )}
            </div>
          </div>

          {/* 已安装 Skill 列表 */}
          {installedSkills.length === 0 ? (
            <div className="px-5 py-8 text-center text-text-muted text-sm">
              暂无技能
            </div>
          ) : (
            <div className="p-4 grid grid-cols-2 sm:grid-cols-3 gap-3">
              {installedSkills.map((skill) => (
                <div
                  key={skill.id}
                  className={`relative rounded-lg border p-3 transition-colors ${
                    skill.enabled
                      ? "border-border-standard bg-[rgba(255,255,255,0.03)]"
                      : "border-border-standard bg-[rgba(255,255,255,0.02)] opacity-60"
                  }`}
                >
                  {/* Skill 信息 */}
                  <div className="flex items-start gap-2">
                    <span className="text-xl leading-none mt-0.5">{skill.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-[510] text-text-primary truncate">
                          {skill.name}
                        </span>
                      </div>
                      <p className="text-xs text-text-tertiary mt-0.5 line-clamp-2">
                        {skill.description}
                      </p>
                      <div className="flex items-center gap-2 mt-1.5">
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded-full font-[510] ${
                            skill.category === "built-in"
                              ? "bg-[rgba(94,106,210,0.1)] text-accent-hover"
                              : "bg-[rgba(113,112,255,0.1)] text-accent-link"
                          }`}
                        >
                          {skill.category === "built-in" ? "内置" : "扩展"}
                        </span>
                        {getSourceBadge(skill.source) && (
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-[510] ${getSourceBadge(skill.source)!.color}`}>
                            {getSourceBadge(skill.source)!.label}
                          </span>
                        )}
                        {skill.skillMdPath && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full font-[510] bg-[rgba(229,72,77,0.1)] text-status-error">
                            SKILL.md
                          </span>
                        )}
                        <span className="text-[10px] text-text-muted">
                          {skill.tools.length > 0 ? `${skill.tools.length} 工具` : "Prompt 增强"}
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
                          ? "bg-accent-brand"
                          : "bg-[#3e3e44]"
                      }`}
                      title={skill.enabled ? "点击禁用" : "点击启用"}
                    >
                      <span
                        className={`absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-white transition-transform ${
                          skill.enabled ? "translate-x-4" : "translate-x-0"
                        }`}
                      />
                    </button>
                  </div>

                  {/* 扩展 Skill 的卸载按钮 */}
                  {skill.category === "extension" && (
                    <button
                      onClick={() => handleUninstall(skill.id)}
                      disabled={uninstallingId === skill.id}
                      className="mt-2 w-full text-[10px] text-status-error hover:text-status-error border border-[rgba(229,72,77,0.2)] rounded px-2 py-0.5 hover:bg-[rgba(229,72,77,0.08)] disabled:opacity-50 transition-colors"
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
            <div className="border-t border-border-subtle">
              <div className="px-5 py-2.5 bg-[rgba(255,255,255,0.03)] border-b border-border-standard">
                <h3 className="text-xs font-[510] text-text-muted">
                  可安装技能
                </h3>
              </div>
              <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                {marketSkills.map((skill) => (
                  <div
                    key={skill.id}
                    className="rounded-lg border border-dashed border-border-standard p-3 hover:border-accent-brand transition-colors"
                  >
                    <div className="flex items-start gap-2">
                      <span className="text-xl leading-none mt-0.5">{skill.icon}</span>
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-[510] text-text-primary">
                          {skill.name}
                        </span>
                        <p className="text-xs text-text-tertiary mt-0.5 line-clamp-2">
                          {skill.description}
                        </p>
                        <div className="flex items-center gap-2 mt-1.5">
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full font-[510] bg-[rgba(113,112,255,0.1)] text-accent-link">
                            扩展
                          </span>
                          <span className="text-[10px] text-text-muted">
                            {skill.tools.length} 工具
                          </span>
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => handleInstall(skill.id)}
                      disabled={installingId === skill.id}
                      className="mt-2 w-full text-xs text-accent-link border border-[rgba(94,106,210,0.2)] rounded px-3 py-1 hover:bg-[rgba(94,106,210,0.08)] disabled:opacity-50 transition-colors"
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
        <div className="mt-6 text-center text-xs text-text-muted">
          每个 session 拥有独立的沙箱工作区，互不影响
        </div>
      </div>

      {/* 自定义安装对话框 */}
      {showInstallDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(0,0,0,0.85)]">
          <div className="bg-bg-surface rounded-xl border border-border-standard shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
            {/* 对话框头部 */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-border-subtle">
              <h3 className="text-sm font-[510] text-text-primary">
                ➕ 安装自定义 Skill
              </h3>
              <button
                onClick={() => setShowInstallDialog(false)}
                className="text-text-muted hover:text-text-secondary text-lg leading-none"
              >
                ×
              </button>
            </div>

            {/* Tab 切换 */}
            <div className="flex border-b border-border-subtle">
              {(["url", "local", "zip"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => { setInstallTab(tab); setInstallError(null); setInstallPreview(null); setInstallScanIssues([]); }}
                  className={`flex-1 px-4 py-2.5 text-xs font-[510] transition-colors ${
                    installTab === tab
                      ? "text-accent-interactive border-b-2 border-accent-brand"
                      : "text-text-tertiary hover:text-text-secondary"
                  }`}
                >
                  {tab === "url" ? "🔗 URL / GitHub" : tab === "local" ? "📁 本地路径" : "📦 ZIP 上传"}
                </button>
              ))}
            </div>

            {/* Tab 内容 */}
            <div className="px-5 py-4 space-y-4">
              {installTab === "url" && (
                <div>
                  <label className="block text-xs font-[510] text-text-secondary mb-1.5">
                    GitHub URL 或 ZIP 下载链接
                  </label>
                  <input
                    type="text"
                    value={installUrl}
                    onChange={(e) => setInstallUrl(e.target.value)}
                    placeholder="https://github.com/owner/repo/tree/main/skills/brainstorming"
                    className="w-full rounded-lg border border-border-standard bg-[rgba(255,255,255,0.03)] px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-brand"
                  />
                  <p className="text-[10px] text-text-muted mt-1">
                    支持 GitHub 仓库 URL（自动检测）或 ZIP 下载链接
                  </p>
                </div>
              )}

              {installTab === "local" && (
                <div>
                  <label className="block text-xs font-[510] text-text-secondary mb-1.5">
                    本地 Skill 目录路径
                  </label>
                  <input
                    type="text"
                    value={installLocalPath}
                    onChange={(e) => setInstallLocalPath(e.target.value)}
                    placeholder="/path/to/skill-directory (需包含 SKILL.md)"
                    className="w-full rounded-lg border border-border-standard bg-[rgba(255,255,255,0.03)] px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-brand"
                  />
                </div>
              )}

              {installTab === "zip" && (
                <div>
                  <label className="block text-xs font-[510] text-text-secondary mb-1.5">
                    上传 ZIP 包（需包含 SKILL.md）
                  </label>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".zip"
                    onChange={(e) => setZipFile(e.target.files?.[0] || null)}
                    className="w-full text-sm text-text-muted file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-[510] file:bg-[rgba(94,106,210,0.06)] file:text-accent-link hover:file:bg-[rgba(94,106,210,0.12)]"
                  />
                  {zipFile && (
                    <p className="text-[10px] text-text-tertiary mt-1">
                      已选择: {zipFile.name} ({(zipFile.size / 1024).toFixed(1)}KB)
                    </p>
                  )}
                </div>
              )}

              {/* 错误提示 */}
              {installError && (
                <div className="rounded-lg bg-[rgba(229,72,77,0.08)] border border-[rgba(229,72,77,0.2)] px-3 py-2 text-xs text-status-error">
                  {installError}
                </div>
              )}

              {/* 预览结果 */}
              {installPreview && (
                <div className="rounded-lg bg-[rgba(39,166,68,0.08)] border border-[rgba(39,166,68,0.2)] px-3 py-2">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-[510] text-status-success">
                      {installPreview.name}
                    </span>
                    <span className="text-[10px] text-status-success">
                      v{installPreview.version}
                    </span>
                  </div>
                  <p className="text-xs text-status-success">
                    {installPreview.description}
                  </p>
                  <p className="text-[10px] text-status-success mt-1">
                    作者: {installPreview.author}
                  </p>
                </div>
              )}

              {/* 安全扫描结果 */}
              {installScanIssues.length > 0 && (
                <div className={`rounded-lg border px-3 py-2 ${
                  installScanStatus === "block"
                    ? "bg-[rgba(229,72,77,0.08)] border-[rgba(229,72,77,0.2)]"
                    : "bg-[rgba(245,166,35,0.08)] border-[rgba(245,166,35,0.2)]"
                }`}>
                  <p className={`text-xs font-[510] mb-1 ${
                    installScanStatus === "block"
                      ? "text-status-error"
                      : "text-status-warning"
                  }`}>
                    安全扫描: {installScanStatus === "block" ? "❌ 已阻止" : "⚠️ 存在警告"}
                  </p>
                  {installScanIssues.map((issue, idx) => (
                    <p key={idx} className="text-[10px] text-text-muted">
                      {issue.level === "block" ? "🔴" : "🟡"} {issue.file}: {issue.message}
                    </p>
                  ))}
                </div>
              )}
            </div>

            {/* 操作按钮 */}
            <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border-subtle">
              {installTab !== "zip" && (
                <button
                  onClick={handlePreviewInstall}
                  disabled={installing}
                  className="rounded-lg border border-border-standard px-4 py-1.5 text-xs text-text-muted hover:bg-[rgba(255,255,255,0.04)] disabled:opacity-50 transition-colors"
                >
                  预览
                </button>
              )}
              <button
                onClick={handleCustomInstall}
                disabled={installing || (installScanStatus === "block")}
                className="rounded-lg bg-accent-brand px-4 py-1.5 text-xs font-[510] text-white hover:bg-accent-hover disabled:opacity-50 transition-colors"
              >
                {installing ? "安装中..." : "安装"}
              </button>
              <button
                onClick={() => setShowInstallDialog(false)}
                className="rounded-lg border border-border-standard px-4 py-1.5 text-xs text-text-muted hover:bg-[rgba(255,255,255,0.04)] transition-colors"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
