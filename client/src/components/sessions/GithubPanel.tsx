import { useState, useEffect } from "react";
import type { SessionInfo } from "../../types";
import { fetchGithubConfig, syncToGithub } from "../../api";

interface Props {
  sessionIds: string[];
  sessions: SessionInfo[];
  onClose: () => void;
  showToast: (msg: string) => void;
}

export default function GithubPanel({ sessionIds, sessions, onClose, showToast }: Props) {
  const [repo, setRepo] = useState("");
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetchGithubConfig().then((c) => {
      setRepo(c.repo);
      setLastSync(c.lastSync);
    });
  }, []);

  const handleSync = async () => {
    const ids = sessionIds.length > 0 ? sessionIds : sessions.map((s) => s.id);
    if (ids.length === 0) {
      showToast("No sessions to sync");
      return;
    }
    if (!confirm(`Sync ${ids.length} sessions to ${repo}?`)) return;
    setBusy(true);
    try {
      const res = await syncToGithub(ids);
      if (res.success) {
        showToast(`Synced ${ids.length} sessions!`);
        setLastSync(res.lastSync || null);
      } else {
        showToast("Sync failed: " + (res.error || "unknown error"));
      }
    } catch {
      showToast("Sync error");
    }
    setBusy(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative w-full max-w-sm bg-gray-900 border border-gray-800 rounded-2xl p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-6">
          <h2 className="font-semibold text-lg">GitHub Sync</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl leading-none">
            ✕
          </button>
        </div>

        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-gray-500">Repo:</span>
            <span className="text-gray-200">{repo}</span>
          </div>

          {lastSync && (
            <div className="text-xs text-gray-500">
              Last sync: {new Date(lastSync).toLocaleString("zh-CN")}
            </div>
          )}

          <button
            onClick={handleSync}
            disabled={busy}
            className="w-full px-4 py-2.5 text-sm rounded-lg bg-green-600 hover:bg-green-500 disabled:opacity-50 transition-colors"
          >
            {busy
              ? "Syncing..."
              : sessionIds.length > 0
              ? `Sync ${sessionIds.length} Selected`
              : "Sync All Sessions"}
          </button>
        </div>

        {busy && (
          <div className="absolute inset-0 bg-gray-950/70 rounded-2xl flex items-center justify-center">
            <div className="animate-spin w-8 h-8 border-2 border-green-400 border-t-transparent rounded-full" />
          </div>
        )}
      </div>
    </div>
  );
}
