import { WebSocketServer, WebSocket } from "ws";
import { getNode } from "../services/nodes";
import {
  createShellSession,
  writeToSession,
  resizeSession,
  closeSession,
} from "../services/ssh";

export function attachTerminalHandler(wss: WebSocketServer): void {
  wss.on("connection", (ws: WebSocket, req) => {
    const url = new URL(req.url || "/", `http://${req.headers.host}`);
    const nodeId = url.searchParams.get("node");
    if (!nodeId) {
      ws.send("\r\n\x1b[31mError: missing ?node=<id> parameter\x1b[0m\r\n");
      ws.close();
      return;
    }

    const node = getNode(nodeId);
    if (!node) {
      ws.send(`\r\n\x1b[31mError: node "${nodeId}" not found\x1b[0m\r\n`);
      ws.close();
      return;
    }

    let sessionId: string | null = null;
    let alive = true;

    ws.on("message", (raw) => {
      const str = raw.toString();
      try {
        const msg = JSON.parse(str);
        if (msg.type === "resize" && sessionId) {
          resizeSession(sessionId, msg.cols, msg.rows);
          return;
        }
      } catch {
        // Not JSON, treat as terminal input
      }
      if (sessionId) {
        writeToSession(sessionId, str);
      }
    });

    ws.on("close", () => {
      alive = false;
      if (sessionId) closeSession(sessionId);
    });

    ws.on("error", () => {
      alive = false;
      if (sessionId) closeSession(sessionId);
    });

    createShellSession(
      node,
      80,
      24,
      (sid, data) => {
        if (alive && ws.readyState === WebSocket.OPEN) {
          ws.send(data);
        }
      },
      () => {
        if (alive && ws.readyState === WebSocket.OPEN) {
          ws.send("\r\n\x1b[33mSSH session ended.\x1b[0m\r\n");
          ws.close();
        }
      }
    )
      .then(({ sessionId: sid }) => {
        sessionId = sid;
        console.log(`[WS] Terminal session ${sid} for node ${node.name}`);
      })
      .catch((err) => {
        console.error(`[WS] SSH connection failed for ${node.name}:`, err.message);
        if (alive && ws.readyState === WebSocket.OPEN) {
          ws.send(`\r\n\x1b[31mSSH connection failed: ${err.message}\x1b[0m\r\n`);
          ws.close();
        }
      });
  });
}
