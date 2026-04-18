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
    <div className="rounded-lg border border-border-standard overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-[rgba(255,255,255,0.03)] border-b border-border-subtle">
        <div className="flex items-center gap-2">
          <span className="text-sm">📝</span>
          <span className="text-xs font-[510] text-text-secondary font-mono truncate max-w-[200px]">
            {diff.filePath}
          </span>
          <span className="text-xs text-text-muted">
            +{stats.added} -{stats.removed}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => onAccept(diff.diffId)}
            className="rounded-md bg-status-success px-2.5 py-1 text-xs text-white hover:bg-[#2db84e] transition-colors"
          >
            ✓ 接受
          </button>
          <button
            onClick={() => onReject(diff.diffId)}
            className="rounded-md border border-border-standard px-2.5 py-1 text-xs text-text-muted hover:bg-[rgba(255,255,255,0.04)] transition-colors"
          >
            ✕ 拒绝
          </button>
        </div>
      </div>

      {/* Diff content */}
      {isLoading ? (
        <div className="px-3 py-3 text-center text-xs text-text-muted">
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
            <div key={idx} className="flex bg-[rgba(39,166,68,0.06)]">
              <span className="w-10 flex-shrink-0 text-right pr-2 text-text-muted select-none border-r border-border-subtle" />
              <span className="w-10 flex-shrink-0 text-right pr-2 text-text-muted select-none border-r border-border-subtle">
                {idx + 1}
              </span>
              <span className="w-5 flex-shrink-0 text-center select-none text-status-success">+</span>
              <span className="flex-1 px-1 whitespace-pre-wrap break-all text-status-success">
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
            <div key={idx} className="px-3 py-1 bg-[rgba(255,255,255,0.03)] text-text-muted text-center text-[10px]">
              ···
            </div>
          ) : (
            <div
              key={idx}
              className={`flex ${
                line.type === "added"
                  ? "bg-[rgba(39,166,68,0.06)]"
                  : line.type === "removed"
                  ? "bg-[rgba(229,72,77,0.06)]"
                  : "hover:bg-[rgba(255,255,255,0.03)]"
              }`}
            >
              <span className="w-10 flex-shrink-0 text-right pr-2 text-text-muted select-none border-r border-border-subtle">
                {line.oldLineNo ?? ""}
              </span>
              <span className="w-10 flex-shrink-0 text-right pr-2 text-text-muted select-none border-r border-border-subtle">
                {line.newLineNo ?? ""}
              </span>
              <span className="w-5 flex-shrink-0 text-center select-none">
                {line.type === "added" ? (
                  <span className="text-status-success">+</span>
                ) : line.type === "removed" ? (
                  <span className="text-status-error">−</span>
                ) : (
                  " "
                )}
              </span>
              <span
                className={`flex-1 px-1 whitespace-pre-wrap break-all ${
                  line.type === "added"
                    ? "text-status-success"
                    : line.type === "removed"
                    ? "text-status-error"
                    : "text-text-muted"
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
