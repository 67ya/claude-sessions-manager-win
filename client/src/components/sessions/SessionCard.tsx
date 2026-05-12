import { useState } from "react";
import type { SessionInfo } from "../../types";
import { updateSessionMeta, resumeSession, toggleArchive, deleteSession, compressSession, aiCompressSession } from "../../api";
import ResumeDialog from "./ResumeDialog";
import ConfirmDialog from "../shared/ConfirmDialog";

interface Props {
  session: SessionInfo;
  isSelected: boolean;
  isChecked: boolean;
  onSelect: () => void;
  onToggleCheck: () => void;
  onMetaChange: () => void;
  showToast: (msg: string) => void;
}

function fmtDate(iso: string) {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString("zh-CN");
}

function fmtSize(bytes: number) {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

export default function SessionCard({
  session,
  isSelected,
  isChecked,
  onSelect,
  onToggleCheck,
  onMetaChange,
  showToast,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(session.customName || "");
  const [busy, setBusy] = useState(false);
  const [showResume, setShowResume] = useState(false);
  const [resuming, setResuming] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const handleRename = async () => {
    setBusy(true);
    try {
      await updateSessionMeta(session.id, { customName: name || undefined });
      onMetaChange();
      showToast("Renamed");
    } catch {
      showToast("Rename failed");
    }
    setBusy(false);
    setEditing(false);
  };

  const handleResume = async () => {
    if (resuming) return; // debounce
    setResuming(true);
    try {
      const res = await resumeSession(session.id);
      if (res.success) {
        showToast("Launching... Check Happy Code in ~5s");
      } else {
        setShowResume(true);
      }
    } catch {
      setShowResume(true);
    }
    setTimeout(() => setResuming(false), 5000);
  };

  const handleArchive = async () => {
    setBusy(true);
    try {
      await toggleArchive(session.id);
      onMetaChange();
      showToast(session.archived ? "Unarchived" : "Archived");
    } catch {
      showToast("Archive failed");
    }
    setBusy(false);
  };

  const handleDelete = async () => {
    setShowDeleteConfirm(false);
    setBusy(true);
    try {
      await deleteSession(session.id);
      onMetaChange();
      showToast("Deleted");
    } catch {
      showToast("Delete failed");
    }
    setBusy(false);
  };

  const handleCompress = async () => {
    if (!confirm(`Compress "${session.customName || session.title}"?\n\nThis will summarize old messages (keeping the last 100 rounds) and create a backup.`)) return;
    setBusy(true);
    try {
      const res = await compressSession(session.id);
      if (res.skipped) {
        showToast(res.message || "Session too small to compress");
      } else {
        showToast(`Compressed! ${res.removedCount} msgs → summary, ${res.keptCount} kept.`);
        onMetaChange();
      }
    } catch {
      showToast("Compress failed");
    }
    setBusy(false);
  };

  const handleAiCompress = async () => {
    if (!confirm(`AI Compress "${session.customName || session.title}"?\n\nClaude will analyze old messages and generate a structured JSON summary (cost: ~$0.10-0.50). Last 100 rounds kept. Backup created.`)) return;
    setBusy(true);
    try {
      const res = await aiCompressSession(session.id);
      if (res.skipped) {
        showToast(res.message || "Session too small for AI compress");
      } else {
        showToast(`AI Compressed! ${res.removedCount} msgs → structured summary (${res.summaryLength} chars).`);
        onMetaChange();
      }
    } catch (e: any) {
      showToast("AI Compress failed: " + (e.message || "unknown"));
    }
    setBusy(false);
  };

  const handleTogglePin = async () => {
    try {
      await updateSessionMeta(session.id, { pinned: !session.pinned });
      onMetaChange();
    } catch {
      showToast("Pin toggle failed");
    }
  };

  const categoryColors: Record<string, string> = {
    work: "bg-blue-900/50 text-blue-300",
    工作: "bg-blue-900/50 text-blue-300",
    personal: "bg-green-900/50 text-green-300",
    个人: "bg-green-900/50 text-green-300",
    project: "bg-purple-900/50 text-purple-300",
    项目: "bg-purple-900/50 text-purple-300",
    study: "bg-amber-900/50 text-amber-300",
    学习: "bg-amber-900/50 text-amber-300",
  };

  return (
    <div
      className={`relative rounded-xl border p-4 transition-all cursor-pointer group ${
        isSelected
          ? "border-purple-500 bg-gray-800/80 ring-1 ring-purple-500/50"
          : "border-gray-800 bg-gray-900/50 hover:border-gray-700 hover:bg-gray-900"
      } ${session.archived ? "opacity-60" : ""}`}
    >
      {/* Select checkbox */}
      <div className="absolute top-3 left-3 z-10" onClick={(e) => e.stopPropagation()}>
        <input
          type="checkbox"
          checked={isChecked}
          onChange={onToggleCheck}
          className="rounded border-gray-600"
        />
      </div>

      {/* Pin indicator */}
      {session.pinned && (
        <div className="absolute top-3 right-3 text-amber-400 text-xs">📌</div>
      )}

      <div className="pl-6" onClick={onSelect}>
        {/* Title */}
        <div className="flex items-start justify-between gap-2 mb-2">
          {editing ? (
            <div className="flex gap-1 flex-1" onClick={(e) => e.stopPropagation()}>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleRename()}
                className="flex-1 bg-gray-800 border border-gray-700 rounded px-2 py-0.5 text-sm focus:outline-none focus:border-purple-500"
                autoFocus
              />
              <button
                onClick={handleRename}
                disabled={busy}
                className="px-2 py-0.5 text-xs bg-purple-600 rounded hover:bg-purple-500"
              >
                Save
              </button>
            </div>
          ) : (
            <h3 className="text-sm font-medium leading-snug line-clamp-2">
              {session.customName ? (
                <>
                  <span>{session.customName}</span>
                  <span className="text-gray-600 text-xs ml-1 line-through">
                    {session.firstMessage.slice(0, 30)}
                  </span>
                </>
              ) : (
                session.title
              )}
            </h3>
          )}
        </div>

        {/* Meta info */}
        <div className="flex items-center gap-2 text-xs text-gray-500 mb-3">
          <span>{fmtDate(session.lastActivityAt)}</span>
          <span>·</span>
          <span>{session.messageCount} msgs</span>
          <span>·</span>
          <span>{fmtSize(session.sizeBytes)}</span>
          {session.provider && session.provider !== "unknown" && (
            <>
              <span>·</span>
              <span
                className={`px-1.5 py-0.5 rounded text-xs ${
                  session.provider === "api" ? "bg-blue-900/50 text-blue-300"
                  : session.provider === "subscription" ? "bg-green-900/50 text-green-300"
                  : "bg-amber-900/50 text-amber-300"
                }`}
              >
                {session.provider === "api" ? "API" : session.provider === "subscription" ? "Sub" : "Mixed"}
              </span>
            </>
          )}
          {session.category && (
            <>
              <span>·</span>
              <span
                className={`px-1.5 py-0.5 rounded text-xs ${
                  categoryColors[session.category] || "bg-gray-800 text-gray-400"
                }`}
              >
                {session.category}
              </span>
            </>
          )}
        </div>

        {/* First message preview */}
        <p className="text-xs text-gray-600 line-clamp-2 mb-3">
          {session.firstMessage.slice(0, 120)}
        </p>
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity flex-wrap">
        <button
          onClick={(e) => {
            e.stopPropagation();
            setEditing(!editing);
            setName(session.customName || "");
          }}
          className="px-2 py-1 text-xs rounded bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white"
          title="Rename"
        >
          ✏️
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            handleTogglePin();
          }}
          className="px-2 py-1 text-xs rounded bg-gray-800 hover:bg-gray-700"
          title={session.pinned ? "Unpin" : "Pin"}
        >
          {session.pinned ? "📌" : "📍"}
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            handleResume();
          }}
          disabled={busy || resuming}
          className="px-2 py-1 text-xs rounded bg-purple-800 hover:bg-purple-700 text-purple-200 disabled:opacity-50"
          title={resuming ? "Launching..." : "Resume session"}
        >
          {resuming ? "⏳" : "▶️"} Resume
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            handleArchive();
          }}
          disabled={busy}
          className="px-2 py-1 text-xs rounded bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white"
          title={session.archived ? "Unarchive" : "Archive"}
        >
          {session.archived ? "📤" : "📥"}
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            handleCompress();
          }}
          disabled={busy}
          className="px-2 py-1 text-xs rounded bg-gray-800 hover:bg-yellow-900 text-gray-400 hover:text-yellow-300"
          title="Quick compress (mechanical extraction)"
        >
          📦 Quick
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            handleAiCompress();
          }}
          disabled={busy}
          className="px-2 py-1 text-xs rounded bg-gray-800 hover:bg-purple-900 text-gray-400 hover:text-purple-300"
          title="AI Compress (Claude structured summary, ~$0.10-0.50)"
        >
          🧠 AI
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            setShowDeleteConfirm(true);
          }}
          disabled={busy}
          className="px-2 py-1 text-xs rounded bg-gray-800 hover:bg-red-900 text-gray-400 hover:text-red-300"
          title="Delete"
        >
          🗑️
        </button>
      </div>

      {busy && (
        <div className="absolute inset-0 bg-gray-950/50 rounded-xl flex items-center justify-center">
          <div className="animate-spin w-5 h-5 border-2 border-purple-400 border-t-transparent rounded-full" />
        </div>
      )}

      {showResume && (
        <ResumeDialog
          sessionId={session.id}
          onClose={() => setShowResume(false)}
        />
      )}

      <ConfirmDialog
        open={showDeleteConfirm}
        title="Delete Session"
        message={`Delete "${session.customName || session.title}"? This cannot be undone.`}
        confirmLabel="Delete"
        danger
        onConfirm={handleDelete}
        onCancel={() => setShowDeleteConfirm(false)}
      />

    </div>
  );
}
