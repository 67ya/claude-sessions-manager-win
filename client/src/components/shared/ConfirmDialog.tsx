interface Props {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  secondaryLabel?: string;
  secondaryAction?: () => void;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  secondaryLabel,
  secondaryAction,
  danger = false,
  onConfirm,
  onCancel,
}: Props) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onCancel} />
      <div className="relative bg-gray-900 border border-gray-700 rounded-xl p-6 w-full max-w-md mx-4 shadow-2xl">
        <h3 className="text-lg font-semibold mb-2">{title}</h3>
        <p className="text-sm text-gray-400 mb-6 whitespace-pre-line">{message}</p>
        <div className="flex justify-end gap-3 flex-wrap">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm rounded-lg bg-gray-700 hover:bg-gray-600 transition-colors"
          >
            Cancel
          </button>
          {secondaryLabel && secondaryAction && (
            <button
              onClick={secondaryAction}
              className="px-4 py-2 text-sm rounded-lg bg-gray-600 hover:bg-gray-500 transition-colors"
            >
              {secondaryLabel}
            </button>
          )}
          <button
            onClick={onConfirm}
            className={`px-4 py-2 text-sm rounded-lg transition-colors ${
              danger
                ? "bg-red-600 hover:bg-red-500 text-white"
                : "bg-purple-600 hover:bg-purple-500"
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
