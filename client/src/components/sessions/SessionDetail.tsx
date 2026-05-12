import { useState } from "react";
import type { SessionDetail } from "../../types";
import { updateSessionMeta, resumeSession, toggleArchive } from "../../api";
import ResumeDialog from "./ResumeDialog";

interface Props {
  detail: SessionDetail | null;
  loading: boolean;
  onClose: () => void;
  onMetaChange: () => void;
  showToast: (msg: string) => void;
}

export default function SessionDetailPanel({
  detail,
  loading,
  onClose,
  onMetaChange,
  showToast,
}: Props) {
  const [editingName, setEditingName] = useState(false);
  const [name, setName] = useState("");
  const [editingCat, setEditingCat] = useState(false);
  const [cat, setCat] = useState("");
  const [busy, setBusy] = useState(false);
  const [showResume, setShowResume] = useState(false);
  const [resuming, setResuming] = useState(false);

  if (!detail && !loading) return null;

  const info = detail?.info;

  const handleRename = async () => {
    if (!info) return;
    setBusy(true);
    try {
      await updateSessionMeta(info.id, { customName: name || undefined });
      onMetaChange();
      showToast("Renamed");
    } catch {
      showToast("Rename failed");
    }
    setBusy(false);
    setEditingName(false);
  };

  const handleCategory = async () => {
    if (!info) return;
    setBusy(true);
    try {
      await updateSessionMeta(info.id, { category: cat || undefined });
      onMetaChange();
      showToast("Category updated");
    } catch {
      showToast("Category update failed");
    }
    setBusy(false);
    setEditingCat(false);
  };

  const handleResume = async () => {
    if (!info || resuming) return;
    setResuming(true);
    try {
      const res = await resumeSession(info.id);
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
    if (!info) return;
    setBusy(true);
    try {
      await toggleArchive(info.id);
      onMetaChange();
      showToast(info.archived ? "Unarchived" : "Archived");
    } catch {
      showToast("Archive failed");
    }
    setBusy(false);
  };

  return (
    <>
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-full md:max-w-2xl bg-gray-900 border-l border-gray-800 h-full overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-gray-900 border-b border-gray-800 px-3 md:px-6 py-3 md:py-4 flex items-center justify-between z-10">
          <h2 className="font-semibold">Session Detail</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl leading-none">
            ✕
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin w-8 h-8 border-2 border-purple-400 border-t-transparent rounded-full" />
          </div>
        ) : info ? (
          <div className="px-3 md:px-6 py-4 space-y-6">
            {/* Actions */}
            <div className="flex gap-2">
              <button
                onClick={handleResume}
                disabled={busy}
                className="px-4 py-2 text-sm rounded-lg bg-purple-600 hover:bg-purple-500 disabled:opacity-50"
              >
                📋 Copy Resume Command
              </button>
              <button
                onClick={handleArchive}
                disabled={busy}
                className="px-4 py-2 text-sm rounded-lg bg-gray-700 hover:bg-gray-600"
              >
                {info.archived ? "📤 Unarchive" : "📥 Archive"}
              </button>
            </div>

            {/* Name */}
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Name</label>
              {editingName ? (
                <div className="flex gap-2">
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="flex-1 bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-purple-500"
                    autoFocus
                  />
                  <button onClick={handleRename} className="px-3 py-1.5 text-xs bg-purple-600 rounded hover:bg-purple-500">
                    Save
                  </button>
                </div>
              ) : (
                <div
                  className="text-sm cursor-pointer hover:text-purple-400"
                  onClick={() => {
                    setName(info.customName || "");
                    setEditingName(true);
                  }}
                >
                  {info.customName || info.firstMessage.slice(0, 80) || "(empty)"}
                  <span className="text-gray-600 ml-1 text-xs">✏️</span>
                </div>
              )}
            </div>

            {/* Category */}
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Category</label>
              {editingCat ? (
                <div className="flex gap-2">
                  <input
                    value={cat}
                    onChange={(e) => setCat(e.target.value)}
                    placeholder="e.g. work, personal, project-name"
                    className="flex-1 bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-purple-500"
                    autoFocus
                  />
                  <button onClick={handleCategory} className="px-3 py-1.5 text-xs bg-purple-600 rounded hover:bg-purple-500">
                    Save
                  </button>
                </div>
              ) : (
                <div
                  className="text-sm cursor-pointer hover:text-purple-400"
                  onClick={() => {
                    setCat(info.category || "");
                    setEditingCat(true);
                  }}
                >
                  {info.category || "(no category)"}
                  <span className="text-gray-600 ml-1 text-xs">✏️</span>
                </div>
              )}
            </div>

            {/* Tags */}
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Tags</label>
              <div className="flex flex-wrap gap-1">
                {info.tags.map((t) => (
                  <span key={t} className="px-2 py-0.5 text-xs rounded bg-gray-800 text-gray-300">
                    {t}
                  </span>
                ))}
                <button
                  onClick={async () => {
                    const t = prompt("Add tag:");
                    if (!t) return;
                    try {
                      await updateSessionMeta(info.id, {
                        tags: [...info.tags, t],
                      });
                      onMetaChange();
                      showToast("Tag added");
                    } catch { showToast("Tag add failed"); }
                  }}
                  className="px-2 py-0.5 text-xs rounded bg-gray-800 text-gray-500 hover:text-white"
                >
                  + tag
                </button>
              </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="bg-gray-800/50 rounded-lg p-3">
                <div className="text-gray-500 text-xs">Messages</div>
                <div className="font-mono">{info.messageCount}</div>
              </div>
              <div className="bg-gray-800/50 rounded-lg p-3">
                <div className="text-gray-500 text-xs">Size</div>
                <div className="font-mono">
                  {info.sizeBytes > 1024 * 1024
                    ? (info.sizeBytes / (1024 * 1024)).toFixed(1) + " MB"
                    : (info.sizeBytes / 1024).toFixed(1) + " KB"}
                </div>
              </div>
              <div className="bg-gray-800/50 rounded-lg p-3">
                <div className="text-gray-500 text-xs">Created</div>
                <div className="font-mono text-xs">{new Date(info.createdAt).toLocaleString("zh-CN")}</div>
              </div>
              <div className="bg-gray-800/50 rounded-lg p-3">
                <div className="text-gray-500 text-xs">Last Activity</div>
                <div className="font-mono text-xs">{new Date(info.lastActivityAt).toLocaleString("zh-CN")}</div>
              </div>
            </div>

            {/* Message preview */}
            <div>
              <label className="text-xs text-gray-500 mb-2 block">
                Recent Messages ({detail?.messages.length || 0})
              </label>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {detail?.messages.map((m: any, i: number) => {
                  const role = m.message?.role || m.type;
                  const isUser = role === "user";
                  const isAssistant = role === "assistant";
                  if (!isUser && !isAssistant) return null;

                  let text = "";
                  const content = m.message?.content;
                  if (typeof content === "string") {
                    text = content;
                  } else if (Array.isArray(content)) {
                    text = content
                      .filter((c: any) => c.type === "text")
                      .map((c: any) => c.text)
                      .join("\n");
                  }

                  if (!text.trim()) return null;

                  return (
                    <div
                      key={i}
                      className={`p-3 rounded-lg text-sm leading-relaxed ${
                        isUser
                          ? "bg-purple-900/20 border border-purple-900/50"
                          : "bg-gray-800/50 border border-gray-800"
                      }`}
                    >
                      <span className={`text-xs uppercase ${isUser ? "text-purple-400" : "text-gray-500"}`}>
                        {isUser ? "User" : "Claude"}
                      </span>
                      <p className="mt-1 whitespace-pre-wrap text-gray-300">
                        {text.slice(0, 1000)}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>

    {showResume && info && (
      <ResumeDialog
        sessionId={info.id}
        onClose={() => setShowResume(false)}
      />
    )}
    </>
  );
}
