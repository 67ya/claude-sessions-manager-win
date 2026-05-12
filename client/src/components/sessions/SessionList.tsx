import type { SessionInfo } from "../../types";
import SessionCard from "./SessionCard";
import BulkActionBar from "./BulkActionBar";

interface Props {
  sessions: SessionInfo[];
  selectedId: string | null;
  selectedIds: Set<string>;
  onSelect: (id: string) => void;
  onToggleSelect: (id: string) => void;
  onSelectAll: () => void;
  allSelected: boolean;
  onMetaChange: () => void;
  onBulkAction: () => void;
  showToast: (msg: string) => void;
}

export default function SessionList({
  sessions,
  selectedId,
  selectedIds,
  onSelect,
  onToggleSelect,
  onSelectAll,
  allSelected,
  onMetaChange,
  onBulkAction,
  showToast,
}: Props) {
  return (
    <div>
      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <BulkActionBar
          selectedIds={Array.from(selectedIds)}
          onAction={onBulkAction}
          showToast={showToast}
        />
      )}

      {/* Select all bar */}
      <div className="flex items-center gap-2 mb-4 text-xs text-gray-500">
        <label className="flex items-center gap-1 cursor-pointer">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={onSelectAll}
            className="rounded border-gray-600"
          />
          Select all
        </label>
        {selectedIds.size > 0 && (
          <span>{selectedIds.size} selected</span>
        )}
      </div>

      {/* Card grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {sessions.map((s) => (
          <SessionCard
            key={s.id}
            session={s}
            isSelected={selectedId === s.id}
            isChecked={selectedIds.has(s.id)}
            onSelect={() => onSelect(s.id)}
            onToggleCheck={() => onToggleSelect(s.id)}
            onMetaChange={onMetaChange}
            showToast={showToast}
          />
        ))}
      </div>
    </div>
  );
}
