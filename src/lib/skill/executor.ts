/**
 * Skill 工具执行器
 * 处理扩展 Skill 的本地工具调用
 * Phase 5: 可插拔能力扩展
 */

import type { ToolResult } from "../agent/tool-executor";

/**
 * 执行 Skill 的本地工具
 * @returns ToolResult
 */
export async function executeSkillTool(
  toolName: string,
  input: Record<string, string>
): Promise<ToolResult | null> {
  const handler = SKILL_LOCAL_HANDLERS[toolName];
  if (!handler) return null; // 不是 Skill 工具，交给其他执行器
  return handler(input);
}

// ========== Skill 工具处理器 ==========

type SkillHandler = (input: Record<string, string>) => Promise<ToolResult>;

const SKILL_LOCAL_HANDLERS: Record<string, SkillHandler> = {
  // ===== Web Search Skill =====
  async web_search(input) {
    const query = input.query;
    if (!query) {
      return { success: false, content: "", error: "Missing required parameter: query" };
    }
    try {
      // 使用 DuckDuckGo Instant Answer API（无需 API Key）
      const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1`;
      const res = await fetch(url, {
        headers: { "User-Agent": "CloudCDE-Agent/1.0" },
        signal: AbortSignal.timeout(10000),
      });
      const data = await res.json();

      const parts: string[] = [];
      if (data.Abstract) {
        parts.push(`## ${data.Heading}\n${data.Abstract}`);
        if (data.AbstractURL) parts.push(`参考链接: ${data.AbstractURL}`);
      }
      if (data.RelatedTopics?.length > 0) {
        parts.push("## 相关话题");
        for (const topic of data.RelatedTopics.slice(0, 5)) {
          if (topic.Text) {
            parts.push(`- ${topic.Text}`);
          }
        }
      }
      if (parts.length === 0) {
        parts.push(`未找到与 "${query}" 相关的结果。`);
      }

      return { success: true, content: parts.join("\n\n") };
    } catch (error) {
      return {
        success: false,
        content: "",
        error: `Web search failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },

  // ===== API Testing Skill =====
  async http_request(input) {
    const url = input.url;
    const method = (input.method || "GET").toUpperCase();
    if (!url) {
      return { success: false, content: "", error: "Missing required parameter: url" };
    }
    try {
      const headers: Record<string, string> = {};
      if (input.headers) {
        try {
          Object.assign(headers, JSON.parse(input.headers));
        } catch {
          // 忽略无效 headers
        }
      }

      const fetchOptions: RequestInit = {
        method,
        headers,
        signal: AbortSignal.timeout(30000),
      };

      if (input.body && ["POST", "PUT", "PATCH"].includes(method)) {
        fetchOptions.body = input.body;
        if (!headers["Content-Type"]) {
          headers["Content-Type"] = "application/json";
        }
      }

      const res = await fetch(url, fetchOptions);
      const contentType = res.headers.get("content-type") || "";
      let body: string;
      if (contentType.includes("json")) {
        const json = await res.json();
        body = JSON.stringify(json, null, 2);
      } else {
        body = await res.text();
      }

      const result = [
        `HTTP ${res.status} ${res.statusText}`,
        `URL: ${res.url}`,
        "",
        body.slice(0, 5000), // 限制响应长度
      ].join("\n");

      return { success: true, content: result };
    } catch (error) {
      return {
        success: false,
        content: "",
        error: `HTTP request failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },

  // ===== Code Review Skill =====
  async review_file(input) {
    const filePath = input.path;
    if (!filePath) {
      return { success: false, content: "", error: "Missing required parameter: path" };
    }
    // 代码审查基于 LLM 自身能力，这里返回文件内容让 LLM 自行审查
    // 通过返回特殊指令，让 Orchestrator 知道需要 LLM 审查
    return {
      success: true,
      content: `请审查文件 ${filePath} 的代码质量。请先使用 read_file 工具读取文件内容，然后从以下维度进行审查：\n1. 代码风格和可读性\n2. 潜在的 Bug 和错误处理\n3. 性能优化建议\n4. 安全性问题\n5. 最佳实践建议`,
    };
  },

  // ===== Deploy Skill =====
  async deploy_trigger(input) {
    const environment = input.environment || "dev";
    // 模拟部署流程
    return {
      success: true,
      content: `部署已触发！\n环境: ${environment}\n状态: 部署中...\n\n请使用 deploy_status 工具查看部署进度。`,
    };
  },

  async deploy_status(_input) {
    // 模拟部署状态
    return {
      success: true,
      content: `最近部署状态:\n状态: 已完成 ✅\n时间: ${new Date().toISOString()}\n环境: dev\n版本: latest`,
    };
  },
};
