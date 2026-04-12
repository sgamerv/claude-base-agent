"use client";

import { useEffect, useRef, useMemo } from "react";
import type { DiffInfo } from "@/lib/types/chat";

interface DiffViewerProps {
  diff: DiffInfo;
  onAccept: (diffId: string) => void;
  onReject: (diffId: string) => void;
  compact?: boolean;
}

interface DiffLine {
  type: "unchanged" | "added" | "removed";
  content: string;
  oldLineNo?: number;
  newLineNo?: number;
}

function computeDiff(original: string, modified: string): DiffLine[] {
  const oldLines = original.split("\n");
  const newLines = modified.split("\n");
  const result: DiffLine[] = [];

  // Simple LCS-based diff
  const m = oldLines.length;
  const n = newLines.length;

  // Build LCS table
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (oldLines[i - 1] === newLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Backtrack to find diff
  let i = m, j = n;
  const ops: Array<{ type: "unchanged" | "added" | "removed"; line: string }> = [];
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      ops.unshift({ type: "unchanged", line: oldLines[i - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      ops.unshift({ type: "added", line: newLines[j - 1] });
      j--;
    } else {
      ops.unshift({ type: "removed", line: oldLines[i - 1] });
      i--;
    }
  }

  // Convert to DiffLine with line numbers
  let oldNo = 0, newNo = 0;
  for (const op of ops) {
    if (op.type === "unchanged") {
      oldNo++;
      newNo++;
      result.push({ type: "unchanged", content: op.line, oldLineNo: oldNo, newLineNo: newNo });
    } else if (op.type === "removed") {
      oldNo++;
      result.push({ type: "removed", content: op.line, oldLineNo: oldNo });
    } else {
      newNo++;
      result.push({ type: "added", content: op.line, newLineNo: newNo });
    }
  }

  return result;
}

function getStats(diffLines: DiffLine[]) {
  const added = diffLines.filter((l) => l.type === "added").length;
  const removed = diffLines.filter((l) => l.type === "removed").length;
  return { added, removed };
}

export default function DiffViewer({ diff, onAccept, onReject, compact }: DiffViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const diffLines = useMemo(
    () => computeDiff(diff.originalContent, diff.newContent),
    [diff.originalContent, diff.newContent]
  );
  const stats = useMemo(() => getStats(diffLines), [diffLines]);

  // 如果内容未加载（两个都为空），显示加载提示
  const isLoading = !diff.originalContent && !diff.newContent;

  // 只展示变更行及其上下文（compact 模式）
  const displayLines = useMemo(() => {
    if (!compact) return diffLines;
    const contextLines = 3;
    const changeIndices = new Set<number>();
    diffLines.forEach((line, idx) => {
      if (line.type !== "unchanged") {
        for (let k = Math.max(0, idx - contextLines); k <= Math.min(diffLines.length - 1, idx + contextLines); k++) {
          changeIndices.add(k);
        }
      }
    });
    if (changeIndices.size === 0) return diffLines;
    const result: (DiffLine & { isGap?: boolean })[] = [];
    let lastIdx = -1;
    const sorted = Array.from(changeIndices).sort((a, b) => a - b);
    for (const idx of sorted) {
      if (lastIdx >= 0 && idx > lastIdx + 1) {
        result.push({ type: "unchanged", content: "", isGap: true });
      }
      result.push({ ...diffLines[idx] });
      lastIdx = idx;
    }
    return result;
  }, [diffLines, compact]);

  return (
    <div className="rounded-lg border border-zinc-200 dark:border-zinc-700 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-zinc-50 dark:bg-zinc-800/50 border-b border-zinc-200 dark:border-zinc-700">
        <div className="flex items-center gap-2">
          <span className="text-sm">📝</span>
          <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300 font-mono truncate max-w-[200px]">
            {diff.filePath}
          </span>
          <span className="text-xs text-zinc-400">
            +{stats.added} -{stats.removed}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => onAccept(diff.diffId)}
            className="rounded-md bg-green-600 px-2.5 py-1 text-xs text-white hover:bg-green-700 transition-colors"
          >
            ✓ 接受
          </button>
          <button
            onClick={() => onReject(diff.diffId)}
            className="rounded-md border border-zinc-300 dark:border-zinc-600 px-2.5 py-1 text-xs text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
          >
            ✕ 拒绝
          </button>
        </div>
      </div>

      {/* Diff content */}
      {isLoading ? (
        <div className="px-3 py-3 text-center text-xs text-zinc-400">
          加载变更内容中...
        </div>
      ) : !diff.originalContent ? (
        // 新建文件：显示所有新增行
        <div
          ref={containerRef}
          className="font-mono text-xs overflow-auto"
          style={{ maxHeight: compact ? 200 : 400 }}
        >
          {diff.newContent.split("\n").map((line, idx) => (
            <div key={idx} className="flex bg-green-50 dark:bg-green-950/30">
              <span className="w-10 flex-shrink-0 text-right pr-2 text-zinc-400 select-none border-r border-zinc-200 dark:border-zinc-700" />
              <span className="w-10 flex-shrink-0 text-right pr-2 text-zinc-400 select-none border-r border-zinc-200 dark:border-zinc-700">
                {idx + 1}
              </span>
              <span className="w-5 flex-shrink-0 text-center select-none text-green-600 dark:text-green-400">+</span>
              <span className="flex-1 px-1 whitespace-pre-wrap break-all text-green-800 dark:text-green-300">
                {line}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div
          ref={containerRef}
          className="font-mono text-xs overflow-auto"
          style={{ maxHeight: compact ? 200 : 400 }}
        >
        {displayLines.map((line, idx) =>
          ("isGap" in line && line.isGap) ? (
            <div key={idx} className="px-3 py-1 bg-zinc-100 dark:bg-zinc-800 text-zinc-400 text-center text-[10px]">
              ···
            </div>
          ) : (
            <div
              key={idx}
              className={`flex ${
                line.type === "added"
                  ? "bg-green-50 dark:bg-green-950/30"
                  : line.type === "removed"
                  ? "bg-red-50 dark:bg-red-950/30"
                  : "hover:bg-zinc-50 dark:hover:bg-zinc-800/30"
              }`}
            >
              <span className="w-10 flex-shrink-0 text-right pr-2 text-zinc-400 select-none border-r border-zinc-200 dark:border-zinc-700">
                {line.oldLineNo ?? ""}
              </span>
              <span className="w-10 flex-shrink-0 text-right pr-2 text-zinc-400 select-none border-r border-zinc-200 dark:border-zinc-700">
                {line.newLineNo ?? ""}
              </span>
              <span className="w-5 flex-shrink-0 text-center select-none">
                {line.type === "added" ? (
                  <span className="text-green-600 dark:text-green-400">+</span>
                ) : line.type === "removed" ? (
                  <span className="text-red-600 dark:text-red-400">−</span>
                ) : (
                  " "
                )}
              </span>
              <span
                className={`flex-1 px-1 whitespace-pre-wrap break-all ${
                  line.type === "added"
                    ? "text-green-800 dark:text-green-300"
                    : line.type === "removed"
                    ? "text-red-800 dark:text-red-300"
                    : "text-zinc-600 dark:text-zinc-400"
                }`}
              >
                {line.content}
              </span>
            </div>
          )
        )}
      </div>
      )}
    </div>
  );
}
