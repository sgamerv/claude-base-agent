/**
 * 添加 MCP Server 对话框
 * Phase 9D: 前端 MCP 管理
 */

"use client";

import { useState } from "react";

interface AddServerDialogProps {
  open: boolean;
  onClose: () => void;
  onAdded: () => void;
}

export default function AddServerDialog({ open, onClose, onAdded }: AddServerDialogProps) {
  const [name, setName] = useState("");
  const [id, setId] = useState("");
  const [url, setUrl] = useState("");
  const [transport, setTransport] = useState<"sse" | "streamable-http">("sse");
  const [headerKey, setHeaderKey] = useState("");
  const [headerValue, setHeaderValue] = useState("");
  const [headers, setHeaders] = useState<Record<string, string>>({});
  const [tags, setTags] = useState("");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!open) return null;

  function addHeader() {
    if (headerKey && headerValue) {
      setHeaders({ ...headers, [headerKey]: headerValue });
      setHeaderKey("");
      setHeaderValue("");
    }
  }

  function removeHeader(key: string) {
    const newHeaders = { ...headers };
    delete newHeaders[key];
    setHeaders(newHeaders);
  }

  // 根据名称自动生成 ID
  function handleNameChange(value: string) {
    setName(value);
    if (!id || id === nameToId(name)) {
      setId(nameToId(value));
    }
  }

  function nameToId(n: string): string {
    return n.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  }

  async function testConnection() {
    if (!url) return;
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/mcp/servers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: id || nameToId(name),
          name: name || id,
          url,
          transport,
          headers: Object.keys(headers).length > 0 ? headers : undefined,
          tags: tags ? tags.split(",").map((t) => t.trim()).filter(Boolean) : undefined,
          enabled: false,
          testConnection: true,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setTestResult({ success: true, message: `连接成功！发现 ${data.server?.toolCount || 0} 个工具` });
      } else {
        setTestResult({ success: false, message: data.error || "连接失败" });
      }
    } catch (error) {
      setTestResult({ success: false, message: `请求失败: ${error instanceof Error ? error.message : String(error)}` });
    } finally {
      setTesting(false);
    }
  }

  async function handleSubmit() {
    if (!id || !name || !url) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/mcp/servers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          name,
          url,
          transport,
          headers: Object.keys(headers).length > 0 ? headers : undefined,
          tags: tags ? tags.split(",").map((t) => t.trim()).filter(Boolean) : undefined,
          enabled: true,
        }),
      });
      if (res.ok) {
        onAdded();
        handleClose();
      }
    } catch {
      // 忽略
    } finally {
      setSubmitting(false);
    }
  }

  function handleClose() {
    setName("");
    setId("");
    setUrl("");
    setTransport("sse");
    setHeaders({});
    setTags("");
    setTestResult(null);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(0,0,0,0.85)]">
      <div className="bg-bg-surface rounded-xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto border border-border-standard">
        <div className="p-6">
          <h2 className="text-lg font-[590] text-text-primary mb-4">
            🔌 添加 MCP 服务
          </h2>

          {/* 服务名称 */}
          <div className="mb-4">
            <label className="block text-sm font-[510] text-text-secondary mb-1">
              服务名称 *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="如：PostgreSQL MCP"
              className="w-full px-3 py-2 border border-border-standard rounded-lg bg-[rgba(255,255,255,0.03)] text-sm text-text-primary"
            />
          </div>

          {/* 服务 ID */}
          <div className="mb-4">
            <label className="block text-sm font-[510] text-text-secondary mb-1">
              服务 ID *
            </label>
            <input
              type="text"
              value={id}
              onChange={(e) => setId(e.target.value.replace(/[^a-zA-Z0-9_-]/g, ""))}
              placeholder="如：postgres-mcp"
              className="w-full px-3 py-2 border border-border-standard rounded-lg bg-[rgba(255,255,255,0.03)] text-sm text-text-primary"
            />
            <p className="text-xs text-text-muted mt-1">仅允许字母、数字、连字符、下划线</p>
          </div>

          {/* URL */}
          <div className="mb-4">
            <label className="block text-sm font-[510] text-text-secondary mb-1">
              URL *
            </label>
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="如：http://localhost:5432/mcp"
              className="w-full px-3 py-2 border border-border-standard rounded-lg bg-[rgba(255,255,255,0.03)] text-sm text-text-primary"
            />
          </div>

          {/* 传输协议 */}
          <div className="mb-4">
            <label className="block text-sm font-[510] text-text-secondary mb-1">
              传输协议
            </label>
            <select
              value={transport}
              onChange={(e) => setTransport(e.target.value as any)}
              className="w-full px-3 py-2 border border-border-standard rounded-lg bg-[rgba(255,255,255,0.03)] text-sm text-text-primary"
            >
              <option value="sse">SSE (Server-Sent Events)</option>
              <option value="streamable-http">Streamable HTTP</option>
            </select>
          </div>

          {/* 认证头 */}
          <div className="mb-4">
            <label className="block text-sm font-[510] text-text-secondary mb-1">
              认证头 (可选)
            </label>
            {Object.keys(headers).length > 0 && (
              <div className="mb-2 space-y-1">
                {Object.entries(headers).map(([key, value]) => (
                  <div key={key} className="flex items-center gap-1 text-xs">
                    <span className="px-2 py-1 bg-[rgba(255,255,255,0.04)] rounded text-text-secondary">
                      {key}: {value.slice(0, 20)}{value.length > 20 ? "..." : ""}
                    </span>
                    <button
                      onClick={() => removeHeader(key)}
                      className="text-status-error hover:text-[#d03d42]"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <input
                type="text"
                value={headerKey}
                onChange={(e) => setHeaderKey(e.target.value)}
                placeholder="Key"
                className="flex-1 px-3 py-1.5 border border-border-standard rounded-lg bg-[rgba(255,255,255,0.03)] text-sm text-text-primary"
              />
              <input
                type="text"
                value={headerValue}
                onChange={(e) => setHeaderValue(e.target.value)}
                placeholder="Value"
                className="flex-1 px-3 py-1.5 border border-border-standard rounded-lg bg-[rgba(255,255,255,0.03)] text-sm text-text-primary"
              />
              <button
                onClick={addHeader}
                className="px-3 py-1.5 text-xs bg-[rgba(255,255,255,0.04)] text-text-secondary rounded-lg hover:bg-[rgba(255,255,255,0.08)]"
              >
                +
              </button>
            </div>
          </div>

          {/* 标签 */}
          <div className="mb-4">
            <label className="block text-sm font-[510] text-text-secondary mb-1">
              标签 (可选，逗号分隔)
            </label>
            <input
              type="text"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="如：database, api"
              className="w-full px-3 py-2 border border-border-standard rounded-lg bg-[rgba(255,255,255,0.03)] text-sm text-text-primary"
            />
          </div>

          {/* 测试结果 */}
          {testResult && (
            <div className={`mb-4 px-3 py-2 rounded-lg text-sm ${
              testResult.success
                ? "bg-[rgba(39,166,68,0.08)] text-status-success"
                : "bg-[rgba(229,72,77,0.08)] text-status-error"
            }`}>
              {testResult.success ? "✅" : "❌"} {testResult.message}
            </div>
          )}

          {/* 操作按钮 */}
          <div className="flex items-center justify-end gap-2 mt-6">
            <button
              onClick={testConnection}
              disabled={testing || !url}
              className="px-4 py-2 text-sm bg-[rgba(255,255,255,0.04)] text-text-secondary rounded-lg hover:bg-[rgba(255,255,255,0.08)] disabled:opacity-50"
            >
              {testing ? "测试中..." : "测试连接"}
            </button>
            <button
              onClick={handleClose}
              className="px-4 py-2 text-sm bg-[rgba(255,255,255,0.04)] text-text-secondary rounded-lg hover:bg-[rgba(255,255,255,0.08)]"
            >
              取消
            </button>
            <button
              onClick={handleSubmit}
              disabled={submitting || !id || !name || !url}
              className="px-4 py-2 text-sm bg-accent-brand text-white rounded-lg hover:bg-accent-hover disabled:opacity-50"
            >
              {submitting ? "添加中..." : "添加"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
