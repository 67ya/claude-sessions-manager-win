interface Props {
  sessionId: string;
  onClose: () => void;
}

export default function ResumeDialog({ sessionId, onClose }: Props) {
  const cmd = `happy --resume ${sessionId}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-gray-900 border border-gray-700 rounded-2xl p-6 shadow-2xl">

        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold">Resume Session</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-lg leading-none">
            ✕
          </button>
        </div>

        <div className="bg-amber-900/30 border border-amber-800 rounded-lg p-3 mb-4 text-xs text-amber-200">
          Copy the command below and run it in a <strong>real terminal</strong> (SSH or local),
          NOT inside a Happy Code dialog. Claude Code needs a real TTY.
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Command (click to select)</label>
            <div className="relative">
              <input
                type="text"
                value={cmd}
                readOnly
                className="w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-3 text-sm font-mono text-green-400 focus:outline-none select-all"
                autoFocus
                onFocus={(e) => e.target.select()}
              />
              <button
                onClick={() => navigator.clipboard?.writeText(cmd)}
                className="absolute right-2 top-1/2 -translate-y-1/2 px-3 py-1 text-xs bg-gray-700 hover:bg-gray-600 rounded text-white"
              >
                Copy
              </button>
            </div>
          </div>
        </div>

        <p className="text-xs text-gray-500 mt-4">
          After running, the session will appear in your Happy Code mobile app.
          If it doesn't work, try <code className="text-gray-400">claude --resume {sessionId.slice(0,8)}...</code>
        </p>
      </div>
    </div>
  );
}
