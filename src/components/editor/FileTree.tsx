"use client";

import { useState, useEffect, useCallback } from "react";

interface FileNode {
  name: string;
  path: string;
  type: "file" | "directory";
  children?: FileNode[];
}

interface FileTreeProps {
  onFileSelect: (path: string) => void;
  selectedFile?: string;
  workspacePath: string | null;
}

async function fetchDirectory(path: string, workspacePath?: string | null): Promise<FileNode[]> {
  try {
    const args: Record<string, string> = { path };
    if (workspacePath) args.workspacePath = workspacePath;
    const res = await fetch("http://localhost:3001/call", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tool: "read_directory", args }),
    });
    const data = await res.json();
    const lines = (data.content || "").split("\n").filter(Boolean);

    return lines.map((line: string) => {
      const spaceIdx = line.indexOf(" ");
      const name = spaceIdx >= 0 ? line.slice(spaceIdx + 1).trim() : line.trim();
      const prefix = spaceIdx >= 0 ? line.slice(0, spaceIdx) : "";
      const isDir = prefix.includes("📁") || prefix === "dir";
      return {
        name,
        path: path === "." ? name : `${path}/${name}`,
        type: isDir ? "directory" : "file",
      };
    });
  } catch {
    return [];
  }
}

function FileTreeNode({
  node,
  depth,
  onFileSelect,
  selectedFile,
  workspacePath,
}: {
  node: FileNode;
  depth: number;
  onFileSelect: (path: string) => void;
  selectedFile?: string;
  workspacePath?: string | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const [children, setChildren] = useState<FileNode[]>([]);
  const [loaded, setLoaded] = useState(false);

  const handleClick = useCallback(async () => {
    if (node.type === "file") {
      onFileSelect(node.path);
    } else {
      if (!loaded) {
        const nodes = await fetchDirectory(node.path, workspacePath);
        setChildren(nodes);
        setLoaded(true);
      }
      setExpanded(!expanded);
    }
  }, [node, loaded, expanded, onFileSelect, workspacePath]);

  const isSelected = selectedFile === node.path;
  const icon = node.type === "directory" ? (expanded ? "📂" : "📁") : getFileIcon(node.name);

  return (
    <div>
      <button
        onClick={handleClick}
        className={`w-full flex items-center gap-1.5 py-1 px-2 text-left text-xs hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors ${
          isSelected ? "bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300" : "text-zinc-700 dark:text-zinc-300"
        }`}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
      >
        <span className="text-xs flex-shrink-0">{icon}</span>
        <span className="truncate">{node.name}</span>
      </button>
      {expanded && node.type === "directory" && (
        <div>
          {children.length === 0 && loaded && (
            <div
              className="text-xs text-zinc-400 py-1"
              style={{ paddingLeft: `${(depth + 1) * 12 + 8}px` }}
            >
              (空目录)
            </div>
          )}
          {children.map((child) => (
            <FileTreeNode
              key={child.path}
              node={child}
              depth={depth + 1}
              onFileSelect={onFileSelect}
              selectedFile={selectedFile}
              workspacePath={workspacePath}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function getFileIcon(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase();
  const icons: Record<string, string> = {
    ts: "📘",
    tsx: "⚛️",
    js: "📙",
    jsx: "⚛️",
    json: "📋",
    css: "🎨",
    scss: "🎨",
    html: "🌐",
    md: "📝",
    py: "🐍",
    rs: "🦀",
    go: "🔵",
    yml: "⚙️",
    yaml: "⚙️",
    toml: "⚙️",
    env: "🔒",
    gitignore: "🙈",
    dockerfile: "🐳",
  };
  return icons[ext || ""] || "📄";
}

export default function FileTree({ onFileSelect, selectedFile, workspacePath }: FileTreeProps) {
  const [rootNodes, setRootNodes] = useState<FileNode[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDirectory(".", workspacePath).then((nodes) => {
      setRootNodes(nodes);
      setLoading(false);
    });
  }, [workspacePath]);

  const handleRefresh = async () => {
    setLoading(true);
    const nodes = await fetchDirectory(".", workspacePath);
    setRootNodes(nodes);
    setLoading(false);
  };

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-200 dark:border-zinc-700">
        <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400 uppercase tracking-wider">
          资源管理器
        </span>
        <button
          onClick={handleRefresh}
          className="text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
          title="刷新"
        >
          ↻
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="text-xs text-zinc-400 px-3 py-4">加载中...</div>
        ) : rootNodes.length === 0 ? (
          <div className="text-xs text-zinc-400 px-3 py-4">无法加载文件树</div>
        ) : (
          rootNodes.map((node) => (
            <FileTreeNode
              key={node.path}
              node={node}
              depth={0}
              onFileSelect={onFileSelect}
              selectedFile={selectedFile}
              workspacePath={workspacePath}
            />
          ))
        )}
      </div>
    </div>
  );
}
