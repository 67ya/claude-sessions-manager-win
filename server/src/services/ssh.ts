import { Client, ClientChannel, SFTPWrapper } from "ssh2";
import * as fs from "fs";
import type { ManagedNode } from "../types";

function buildSshConfig(node: ManagedNode) {
  const config: any = {
    host: node.host,
    port: node.port || 22,
    username: node.username,
    readyTimeout: 10000,
  };
  if (node.authMethod === "key") {
    const key = node.privateKey || "";
    // Support both inline key content and file paths
    if (key.startsWith("/") || key.startsWith("~/") || key.startsWith("./")) {
      config.privateKey = fs.readFileSync(key, "utf-8");
    } else {
      config.privateKey = key;
    }
  } else {
    config.password = node.password;
  }
  return config;
}

export function connectNode(node: ManagedNode): Promise<Client> {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    const timeout = setTimeout(() => {
      conn.destroy();
      reject(new Error("SSH connection timeout"));
    }, 15000);

    conn.on("ready", () => {
      clearTimeout(timeout);
      resolve(conn);
    });

    conn.on("error", (err) => {
      clearTimeout(timeout);
      reject(err);
    });

    conn.connect(buildSshConfig(node));
  });
}

// SFTP helpers
export async function listFiles(node: ManagedNode, remotePath: string): Promise<{
  path: string;
  entries: Array<{ name: string; type: "file" | "directory" | "symlink"; size: number; mtime: number; permissions: string }>;
}> {
  const conn = await connectNode(node);
  return new Promise((resolve, reject) => {
    conn.sftp((err, sftp) => {
      if (err) { conn.end(); reject(err); return; }
      sftp.readdir(remotePath, (err, entries) => {
        conn.end();
        if (err) { reject(err); return; }
        const result = entries
          .filter((e: any) => e.filename !== "." && e.filename !== "..")
          .map((e: any) => ({
            name: e.filename,
            type: (e.longname?.startsWith("d") ? "directory" : e.longname?.startsWith("l") ? "symlink" : "file") as string,
            size: e.attrs.size || 0,
            mtime: e.attrs.mtime * 1000,
            permissions: e.longname?.slice(0, 10) || "",
          }))
          .sort((a, b) => {
            if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
            return a.name.localeCompare(b.name);
          });
        resolve({ path: remotePath, entries: result });
      });
    });
  });
}

export async function getFileContent(node: ManagedNode, remotePath: string): Promise<{ data: Buffer; filename: string }> {
  const conn = await connectNode(node);
  return new Promise((resolve, reject) => {
    conn.sftp((err, sftp) => {
      if (err) { conn.end(); reject(err); return; }
      sftp.readFile(remotePath, (err, data) => {
        conn.end();
        if (err) { reject(err); return; }
        const filename = remotePath.split("/").pop() || "file";
        resolve({ data: data as Buffer, filename });
      });
    });
  });
}

export async function writeFile(node: ManagedNode, remotePath: string, content: Buffer): Promise<void> {
  const conn = await connectNode(node);
  return new Promise((resolve, reject) => {
    conn.sftp((err, sftp) => {
      if (err) { conn.end(); reject(err); return; }
      sftp.writeFile(remotePath, content, (err) => {
        conn.end();
        if (err) { reject(err); return; }
        resolve();
      });
    });
  });
}

export async function deleteFileOrDir(node: ManagedNode, remotePath: string): Promise<void> {
  const conn = await connectNode(node);
  return new Promise((resolve, reject) => {
    conn.sftp((err, sftp) => {
      if (err) { conn.end(); reject(err); return; }
      // Try to delete as a file or empty directory
      sftp.unlink(remotePath, (err) => {
        if (!err) { conn.end(); resolve(); return; }
        // Try rmdir if unlink fails (it might be a directory)
        sftp.rmdir(remotePath, (err2) => {
          conn.end();
          if (err2) { reject(new Error(`Cannot delete: ${err.message}, ${err2.message}`)); return; }
          resolve();
        });
      });
    });
  });
}

export async function execCommand(
  node: ManagedNode,
  command: string,
  timeout = 15000
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const conn = await connectNode(node);
  return new Promise((resolve, reject) => {
    conn.exec(command, (err, stream) => {
      if (err) { conn.end(); reject(err); return; }
      let stdout = "";
      let stderr = "";
      stream.on("data", (d: Buffer) => { stdout += d.toString(); });
      stream.stderr.on("data", (d: Buffer) => { stderr += d.toString(); });
      stream.on("close", (code: number) => {
        conn.end();
        resolve({ stdout, stderr, exitCode: code ?? 0 });
      });
      setTimeout(() => {
        conn.end();
        reject(new Error("Command timeout"));
      }, timeout);
    });
  });
}

export async function testConnection(node: ManagedNode): Promise<{ ok: boolean; error?: string }> {
  return new Promise((resolve) => {
    const conn = new Client();
    const timeout = setTimeout(() => {
      conn.destroy();
      resolve({ ok: false, error: "Connection timeout (10s)" });
    }, 10000);

    conn.on("ready", () => {
      clearTimeout(timeout);
      conn.end();
      resolve({ ok: true });
    });

    conn.on("error", (err) => {
      clearTimeout(timeout);
      conn.destroy();
      resolve({ ok: false, error: err.message });
    });

    conn.connect(buildSshConfig(node));
  });
}

// Session pool for active terminal connections
interface TerminalSession {
  client: Client;
  stream: ClientChannel;
}

const sessions = new Map<string, TerminalSession>();
let sessionCounter = 0;

export function createShellSession(
  node: ManagedNode,
  cols: number,
  rows: number,
  onData: (sessionId: string, data: Buffer) => void,
  onClose: (sessionId: string) => void
): Promise<{ sessionId: string }> {
  return new Promise((resolve, reject) => {
    const sessionId = `term-${Date.now().toString(36)}-${++sessionCounter}`;
    const client = new Client();

    client.on("ready", () => {
      client.shell({ term: "xterm-256color", cols, rows }, (err, stream) => {
        if (err) {
          client.end();
          reject(err);
          return;
        }

        sessions.set(sessionId, { client, stream });

        stream.on("data", (data: Buffer) => {
          onData(sessionId, data);
        });

        stream.on("close", () => {
          sessions.delete(sessionId);
          client.end();
          onClose(sessionId);
        });

        stream.on("error", () => {
          sessions.delete(sessionId);
          client.end();
          onClose(sessionId);
        });

        resolve({ sessionId });
      });
    });

    client.on("error", (err) => {
      reject(err);
    });

    client.on("close", () => {
      sessions.delete(sessionId);
      onClose(sessionId);
    });

    client.connect(buildSshConfig(node));
  });
}

export function writeToSession(sessionId: string, data: string): void {
  const session = sessions.get(sessionId);
  if (session) {
    session.stream.write(data);
  }
}

export function resizeSession(sessionId: string, cols: number, rows: number): void {
  const session = sessions.get(sessionId);
  if (session && session.stream.setWindow) {
    session.stream.setWindow(rows, cols, 0, 0);
  }
}

export function closeSession(sessionId: string): void {
  const session = sessions.get(sessionId);
  if (session) {
    sessions.delete(sessionId);
    session.client.end();
  }
}
