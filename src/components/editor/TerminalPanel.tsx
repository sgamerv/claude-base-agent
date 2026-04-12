"use client";

import { useEffect, useRef, useState } from "react";

interface TerminalPanelProps {
  sessionId: string;
  workspacePath: string | null;
}

export default function TerminalPanel({ sessionId, workspacePath }: TerminalPanelProps) {
  const [output, setOutput] = useState<string[]>([
    "\x1b[32mCloud CDE Agent — 终端\x1b[0m",
    `\x1b[90mSession: ${sessionId}\x1b[0m`,
    "",
  ]);
  const [input, setInput] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const terminalRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // 自动滚动
  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [output]);

  const executeCommand = async (command: string) => {
    const newOutput = [...output, `\x1b[36m$\x1b[0m ${command}`];
    setOutput(newOutput);
    setInput("");
    setHistory((prev) => [...prev, command]);
    setHistoryIndex(-1);

    try {
      const args: Record<string, string> = { command };
      if (workspacePath) args.workspacePath = workspacePath;
      const res = await fetch("http://localhost:3001/call", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tool: "execute_command", args }),
      });
      const data = await res.json();
      const result = data.content || "(no output)";
      setOutput((prev) => [...prev, ...result.split("\n")]);
    } catch (err) {
      setOutput((prev) => [
        ...prev,
        `\x1b[31mError: ${err instanceof Error ? err.message : String(err)}\x1b[0m`,
      ]);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && input.trim()) {
      executeCommand(input.trim());
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (history.length > 0) {
        const newIndex = historyIndex === -1 ? history.length - 1 : Math.max(0, historyIndex - 1);
        setHistoryIndex(newIndex);
        setInput(history[newIndex]);
      }
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (historyIndex >= 0) {
        const newIndex = historyIndex + 1;
        if (newIndex >= history.length) {
          setHistoryIndex(-1);
          setInput("");
        } else {
          setHistoryIndex(newIndex);
          setInput(history[newIndex]);
        }
      }
    }
  };

  // 简单 ANSI 转义处理
  const renderLine = (line: string) => {
    return line
      .replace(/\x1b\[32m/g, '<span class="text-green-500">')
      .replace(/\x1b\[36m/g, '<span class="text-cyan-500">')
      .replace(/\x1b\[31m/g, '<span class="text-red-500">')
      .replace(/\x1b\[33m/g, '<span class="text-yellow-500">')
      .replace(/\x1b\[90m/g, '<span class="text-zinc-500">')
      .replace(/\x1b\[0m/g, "</span>");
  };

  return (
    <div
      className="h-full flex flex-col bg-zinc-950 font-mono text-xs"
      onClick={() => inputRef.current?.focus()}
    >
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-zinc-800 bg-zinc-900">
        <span className="text-zinc-400 text-xs">终端</span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setOutput([])}
            className="text-zinc-500 hover:text-zinc-300 transition-colors"
            title="清空"
          >
            ✕
          </button>
        </div>
      </div>
      <div
        ref={terminalRef}
        className="flex-1 overflow-y-auto p-3 leading-relaxed"
      >
        {output.map((line, i) => (
          <div
            key={i}
            className="text-zinc-300 whitespace-pre-wrap break-all"
            dangerouslySetInnerHTML={{ __html: renderLine(line) }}
          />
        ))}
      </div>
      <div className="flex items-center border-t border-zinc-800 px-3 py-2">
        <span className="text-cyan-500 mr-2">$</span>
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          className="flex-1 bg-transparent text-zinc-200 outline-none text-xs font-mono"
          placeholder="输入命令..."
          autoFocus
        />
      </div>
    </div>
  );
}
