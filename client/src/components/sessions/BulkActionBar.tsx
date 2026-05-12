import { useState } from "react";
import { bulkAction } from "../../api";
import ConfirmDialog from "../shared/ConfirmDialog";

interface Props {
  selectedIds: string[];
  onAction: () => void;
  showToast: (msg: string) => void;
}

export default function BulkActionBar({ selectedIds, onAction, showToast }: Props) {
  const [busy, setBusy] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const count = selectedIds.length;

  const handleAction = async (action: string) => {
    setBusy(true);
    try {
      await bulkAction(selectedIds, action);
      showToast(`${action} done`);
      onAction();
    } catch {
      showToast(`${action} failed`);
    }
    setBusy(false);
    setShowDeleteConfirm(false);
  };

  return (
    <>
      <div className="sticky top-14 z-20 mb-4 px-4 py-3 bg-gray-800/95 border border-purple-500/30 rounded-xl flex items-center gap-3 backdrop-blur">
        <span className="text-sm text-purple-400 font-medium">{count} selected</span>

        <div className="flex-1" />

        <button
          onClick={() => handleAction("compress")}
          disabled={busy}
          className="px-3 py-1.5 text-xs rounded-lg bg-yellow-900/50 hover:bg-yellow-800 text-yellow-300 disabled:opacity-50 transition-colors"
        >
          📦 Compress
        </button>
        <button
          onClick={() => handleAction("pin")}
          disabled={busy}
          className="px-3 py-1.5 text-xs rounded-lg bg-gray-700 hover:bg-gray-600 disabled:opacity-50 transition-colors"
        >
          📌 Pin
        </button>
        <button
          onClick={() => handleAction("archive")}
          disabled={busy}
          className="px-3 py-1.5 text-xs rounded-lg bg-gray-700 hover:bg-gray-600 disabled:opacity-50 transition-colors"
        >
          📥 Archive
        </button>
        <button
          onClick={() => setShowDeleteConfirm(true)}
          disabled={busy}
          className="px-3 py-1.5 text-xs rounded-lg bg-red-900/50 hover:bg-red-800 text-red-300 disabled:opacity-50 transition-colors"
        >
          🗑️ Delete
        </button>
      </div>

      <ConfirmDialog
        open={showDeleteConfirm}
        title="Delete Sessions"
        message={`Delete ${count} session${count > 1 ? "s" : ""}? This cannot be undone. Session files will be permanently removed.`}
        confirmLabel="Delete"
        danger
        onConfirm={() => handleAction("delete")}
        onCancel={() => setShowDeleteConfirm(false)}
      />
    </>
  );
}
