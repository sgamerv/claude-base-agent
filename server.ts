/**
 * 自定义 Next.js Server
 * 集成 Socket.io，支持 WebSocket 实时通信
 */

import { createServer } from "http";
import { parse } from "url";
import next from "next";

const dev = process.env.NODE_ENV !== "production";
const hostname = "localhost";
const port = parseInt(process.env.PORT || "3000", 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(async () => {
  const { initSocketServer } = await import("./src/lib/socket/server");

  const server = createServer((req, res) => {
    const parsedUrl = parse(req.url!, true);
    handle(req, res, parsedUrl);
  });

  // 初始化 Socket.io
  initSocketServer(server);

  server.listen(port, () => {
    console.log(`
  ╔══════════════════════════════════════════════╗
  ║   Cloud CDE Agent — Phase 1 Demo            ║
  ║   Server running at http://${hostname}:${port}      ║
  ╚══════════════════════════════════════════════╝
    `);
  });
});
