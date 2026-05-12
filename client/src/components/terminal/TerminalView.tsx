import { useEffect, useRef, useCallback } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import "@xterm/xterm/css/xterm.css";

interface TerminalViewProps {
  nodeId: string;
  onClose?: () => void;
}

export default function TerminalView({ nodeId, onClose }: TerminalViewProps) {
  const termRef = useRef<HTMLDivElement>(null);
  const terminal = useRef<Terminal | null>(null);
  const ws = useRef<WebSocket | null>(null);
  const fitAddon = useRef<FitAddon | null>(null);

  const connect = useCallback(() => {
    const term = terminal.current;
    if (!term) return;

    const protocol = location.protocol === "https:" ? "wss" : "ws";
    const socket = new WebSocket(
      `${protocol}://${location.host}/ws/terminal?node=${nodeId}`
    );
    ws.current = socket;

    socket.binaryType = "arraybuffer";

    socket.onopen = () => {
      term.writeln("\x1b[32m✓ Connected\x1b[0m");
    };

    socket.onmessage = (e) => {
      if (e.data instanceof ArrayBuffer) {
        term.write(new Uint8Array(e.data));
      } else {
        term.write(e.data);
      }
    };

    socket.onclose = () => {
      term.writeln("\r\n\x1b[33mConnection closed.\x1b[0m");
    };

    socket.onerror = () => {
      term.writeln("\r\n\x1b[31mWebSocket error.\x1b[0m");
    };

    term.onData((data) => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(data);
      }
    });

    term.onResize(({ cols, rows }) => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: "resize", cols, rows }));
      }
    });
  }, [nodeId]);

  useEffect(() => {
    const term = new Terminal({
      cursorBlink: true,
      cursorStyle: "bar",
      fontSize: 14,
      fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
      theme: {
        background: "#0d1117",
        foreground: "#c9d1d9",
        cursor: "#58a6ff",
        selectionBackground: "#264f78",
        black: "#484f58",
        red: "#ff7b72",
        green: "#3fb950",
        yellow: "#d29922",
        blue: "#58a6ff",
        magenta: "#bc8cff",
        cyan: "#39c5d1",
        white: "#b1bac4",
        brightBlack: "#6e7681",
        brightRed: "#ffa198",
        brightGreen: "#56d364",
        brightYellow: "#e3b341",
        brightBlue: "#79c0ff",
        brightMagenta: "#d2a8ff",
        brightCyan: "#56d4dd",
        brightWhite: "#f0f6fc",
      },
      allowProposedApi: true,
    });

    const fit = new FitAddon();
    fitAddon.current = fit;
    term.loadAddon(fit);
    term.loadAddon(new WebLinksAddon());

    terminal.current = term;

    if (termRef.current) {
      term.open(termRef.current);
      fit.fit();
    }

    connect();

    const handleResize = () => {
      try {
        fit.fit();
      } catch {}
    };
    window.addEventListener("resize", handleResize);

    // Refit after fonts load
    const timer = setTimeout(() => {
      try {
        fit.fit();
      } catch {}
    }, 200);

    return () => {
      window.removeEventListener("resize", handleResize);
      clearTimeout(timer);
      if (ws.current) {
        ws.current.close();
      }
      term.dispose();
    };
  }, [connect]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between bg-gray-900 border-b border-gray-800 px-3 py-2">
        <span className="text-sm text-gray-400 truncate">
          Terminal: {nodeId}
        </span>
        {onClose && (
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-300 transition-colors text-lg leading-none"
            title="Close"
          >
            ×
          </button>
        )}
      </div>
      <div ref={termRef} className="flex-1 p-1 min-h-0" />
    </div>
  );
}
