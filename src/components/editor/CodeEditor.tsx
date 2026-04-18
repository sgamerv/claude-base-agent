"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";

// 动态导入 Monaco Editor 避免 SSR
const MonacoEditor = dynamic(() => import("@monaco-editor/react"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full text-text-muted text-sm">
      加载编辑器...
    </div>
  ),
});

interface CodeEditorProps {
  filePath?: string;
  content?: string;
  onSave?: (content: string) => void;
}

function getLanguage(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase() || "";
  const mapping: Record<string, string> = {
    ts: "typescript",
    tsx: "typescript",
    js: "javascript",
    jsx: "javascript",
    json: "json",
    css: "css",
    scss: "scss",
    html: "html",
    md: "markdown",
    py: "python",
    rs: "rust",
    go: "go",
    yml: "yaml",
    yaml: "yaml",
    toml: "ini",
    sh: "shell",
    bash: "shell",
    sql: "sql",
    dockerfile: "dockerfile",
  };
  return mapping[ext] || "plaintext";
}

export default function CodeEditor({ filePath, content, onSave }: CodeEditorProps) {
  const [localContent, setLocalContent] = useState(content || "");
  const [modified, setModified] = useState(false);

  useEffect(() => {
    setLocalContent(content || "");
    setModified(false);
  }, [content, filePath]);

  const handleEditorChange = (value: string | undefined) => {
    const newContent = value || "";
    setLocalContent(newContent);
    setModified(newContent !== (content || ""));
  };

  // Ctrl/Cmd + S 保存
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        if (modified && onSave) {
          onSave(localContent);
          setModified(false);
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [modified, localContent, onSave]);

  if (!filePath) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-text-muted">
        <div className="text-4xl mb-4">📝</div>
        <p className="text-sm">选择文件开始编辑</p>
        <p className="text-xs mt-1 text-text-muted">从左侧文件树点击文件打开</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* 文件标签栏 */}
      <div className="flex items-center border-b border-border-subtle bg-bg-panel">
        <div className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-[rgba(255,255,255,0.04)] border-r border-border-subtle">
          <span>{getLanguage(filePath) === "typescript" ? "📘" : "📄"}</span>
          <span className="text-text-secondary max-w-[150px] truncate">
            {filePath.split("/").pop()}
          </span>
          {modified && (
            <span className="w-2 h-2 rounded-full bg-status-warning" />
          )}
        </div>
        <div className="flex-1" />
        {modified && (
          <button
            onClick={() => {
              if (onSave) {
                onSave(localContent);
                setModified(false);
              }
            }}
            className="text-xs text-accent-link hover:text-accent-link-hover px-3 py-1"
          >
            保存
          </button>
        )}
      </div>

      {/* Monaco Editor */}
      <div className="flex-1">
        <MonacoEditor
          height="100%"
          language={getLanguage(filePath)}
          value={localContent}
          onChange={handleEditorChange}
          theme="vs-dark"
          options={{
            fontSize: 13,
            fontFamily: "'Berkeley Mono', ui-monospace, 'SF Mono', Menlo, monospace",
            minimap: { enabled: false },
            lineNumbers: "on",
            scrollBeyondLastLine: false,
            wordWrap: "on",
            padding: { top: 8 },
            renderLineHighlight: "line",
            smoothScrolling: true,
            cursorSmoothCaretAnimation: "on",
            bracketPairColorization: { enabled: true },
          }}
        />
      </div>
    </div>
  );
}
