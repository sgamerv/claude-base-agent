"use client";

import { useState, useCallback } from "react";
import FileTree from "./FileTree";
import CodeEditor from "./CodeEditor";
import TerminalPanel from "./TerminalPanel";
import AIPanel from "./AIPanel";

interface EditorPanelProps {
  sessionId: string;
  workspacePath: string | null;
  diffId?: string | null;
}

type BottomTab = "terminal" | "problems" | "output";

export default function EditorPanel({ sessionId, workspacePath, diffId }: EditorPanelProps) {
  const [selectedFile, setSelectedFile] = useState<string | undefined>();
  const [fileContent, setFileContent] = useState<string>("");
  const [bottomTab, setBottomTab] = useState<BottomTab>("terminal");
  const [showBottomPanel, setShowBottomPanel] = useState(true);
  const [showAIPanel, setShowAIPanel] = useState(true);

  // 加载文件内容
  const handleFileSelect = useCallback(async (filePath: string) => {
    setSelectedFile(filePath);
    try {
      const args: Record<string, string> = { path: filePath };
      if (workspacePath) args.workspacePath = workspacePath;
      const res = await fetch("http://localhost:3001/call", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tool: "read_file", args }),
      });
      const data = await res.json();
      setFileContent(data.content || "");
    } catch {
      setFileContent("// 加载文件失败");
    }
  }, [workspacePath]);

  // 保存文件
  const handleSave = useCallback(
    async (content: string) => {
      if (!selectedFile) return;
      try {
        const args: Record<string, string> = { path: selectedFile, content };
        if (workspacePath) args.workspacePath = workspacePath;
        await fetch("http://localhost:3001/call", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tool: "write_file", args }),
        });
        setFileContent(content);
      } catch {
        // 保存失败
      }
    },
    [selectedFile, workspacePath]
  );

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* 左侧：文件树 */}
      <div className="w-56 flex-shrink-0 border-r border-border-subtle bg-bg-panel overflow-hidden">
        <FileTree onFileSelect={handleFileSelect} selectedFile={selectedFile} workspacePath={workspacePath} />
      </div>

      {/* 中间：编辑器 + 底部面板 */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* 编辑器区域 */}
        <div className="flex-1 overflow-hidden">
          <CodeEditor
            filePath={selectedFile}
            content={fileContent}
            onSave={handleSave}
          />
        </div>

        {/* 底部面板 */}
        {showBottomPanel && (
          <div className="h-56 flex-shrink-0 border-t border-border-subtle flex flex-col">
            {/* 底部标签栏 */}
            <div className="flex items-center border-b border-border-subtle bg-bg-panel px-2">
              {(["terminal", "problems", "output"] as BottomTab[]).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setBottomTab(tab)}
                  className={`px-3 py-1.5 text-xs transition-colors ${
                    bottomTab === tab
                      ? "text-text-primary border-b-2 border-accent-brand"
                      : "text-text-muted hover:text-text-secondary"
                  }`}
                >
                  {tab === "terminal" ? "终端" : tab === "problems" ? "问题" : "输出"}
                </button>
              ))}
              <div className="flex-1" />
              <button
                onClick={() => setShowBottomPanel(false)}
                className="text-text-muted hover:text-text-secondary text-xs px-2"
              >
                ✕
              </button>
            </div>

            {/* 底部内容 */}
            <div className="flex-1 overflow-hidden">
              {bottomTab === "terminal" && <TerminalPanel sessionId={sessionId} workspacePath={workspacePath} />}
              {bottomTab === "problems" && (
                <div className="h-full flex items-center justify-center text-xs text-text-muted">
                  暂无问题
                </div>
              )}
              {bottomTab === "output" && (
                <div className="h-full flex items-center justify-center text-xs text-text-muted">
                  暂无输出
                </div>
              )}
            </div>
          </div>
        )}

        {/* 状态栏 */}
        <div className="flex items-center justify-between px-3 py-1 bg-accent-brand text-white text-xs select-none">
          <div className="flex items-center gap-3">
            {!showBottomPanel && (
              <button
                onClick={() => setShowBottomPanel(true)}
                className="hover:bg-accent-hover px-1.5 py-0.5 rounded transition-colors"
              >
                终端
              </button>
            )}
            <span>主分支</span>
          </div>
          <div className="flex items-center gap-3">
            {selectedFile && (
              <span className="font-mono">{selectedFile.split("/").pop()}</span>
            )}
            <button
              onClick={() => setShowAIPanel(!showAIPanel)}
              className="hover:bg-accent-hover px-1.5 py-0.5 rounded transition-colors"
            >
              🤖 AI
            </button>
          </div>
        </div>
      </div>

      {/* 右侧：AI 操作面板 */}
      {showAIPanel && (
        <div className="w-80 flex-shrink-0 overflow-hidden">
          <AIPanel sessionId={sessionId} onFileOpen={handleFileSelect} diffId={diffId} />
        </div>
      )}
    </div>
  );
}
