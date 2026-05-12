process.title = "csm-server";

import express from "express";
import cors from "cors";
import * as path from "path";
import * as fs from "fs";
import * as http from "http";
import { WebSocketServer } from "ws";
import sessionsRouter from "./routes/sessions";
import githubRouter from "./routes/github";
import nodesRouter from "./routes/nodes";
import filesRouter from "./routes/files";
import monitorRouter from "./routes/monitor";
import proxyPoolRouter from "./routes/proxy-pool";
import deployRouter from "./routes/deploy";
import usersRouter from "./routes/users";
import usageRouter from "./routes/usage";
import { attachTerminalHandler } from "./ws/terminal";
import { seedDefaultPresets } from "./services/presets";

const app = express();
const PORT = parseInt(process.env.PORT || "3457");
const HOST = process.env.HOST || "0.0.0.0";

app.use(cors());
app.use(express.json());

// API routes
app.use("/api/sessions", sessionsRouter);
app.use("/api/github", githubRouter);
app.use("/api/nodes", nodesRouter);
app.use("/api/nodes/:nodeId/files", filesRouter);
app.use("/api/nodes/:nodeId/monitor", monitorRouter);
app.use("/api/nodes/:nodeId/proxy-pool", proxyPoolRouter);
app.use("/api/deploy", deployRouter);
app.use("/api/users", usersRouter);
app.use("/api/usage", usageRouter);

// Health check
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", uptime: process.uptime() });
});

// Serve static frontend in production
const clientDist = "/home/ctyun/apps/claude-sessions-manager/client/dist";
if (fs.existsSync(path.join(clientDist, "index.html"))) {
  app.use(express.static(clientDist));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(clientDist, "index.html"));
  });
}

// Create HTTP server (shared by Express + WebSocket)
const server = http.createServer(app);

// WebSocket server for terminal
const wss = new WebSocketServer({ server, path: "/ws/terminal" });
attachTerminalHandler(wss);

server.listen(PORT, HOST, () => {
  seedDefaultPresets();
  console.log(`Claude Sessions Manager running on http://${HOST}:${PORT}`);
});
