import { useState } from "react";
import type { ManagedNode } from "../../types";
import type { NodeFormData } from "./NodeForm";

interface Props {
  node: ManagedNode;
  onEdit: (id: string, data: NodeFormData) => void;
  onDelete: (id: string) => void;
  onTest: (id: string) => void;
  onTerminal: (id: string) => void;
  testing?: boolean;
}

function statusBadge(status?: string) {
  switch (status) {
    case "online":
      return <span className="px-2 py-0.5 text-xs rounded-full bg-green-900/60 text-green-400 border border-green-700/50">Online</span>;
    case "offline":
      return <span className="px-2 py-0.5 text-xs rounded-full bg-red-900/60 text-red-400 border border-red-700/50">Offline</span>;
    default:
      return <span className="px-2 py-0.5 text-xs rounded-full bg-gray-800 text-gray-500 border border-gray-700/50">Unknown</span>;
  }
}

export default function NodeCard({ node, onEdit, onDelete, onTest, onTerminal, testing }: Props) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-4 hover:border-gray-700 transition-colors group">
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <h3 className="text-sm font-medium truncate">{node.name}</h3>
          {statusBadge(node.status)}
        </div>
        {/* Actions on hover */}
        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity ml-2">
          <button
            onClick={() => onTerminal(node.id)}
            className="px-2 py-1 text-xs rounded bg-gray-800 hover:bg-purple-800 text-gray-400 hover:text-purple-200 transition-colors"
            title="Open Terminal"
          >
            &gt;_
          </button>
          <button
            onClick={() =>
              onEdit(node.id, {
                name: node.name,
                host: node.host,
                port: node.port,
                username: node.username,
                authMethod: node.authMethod,
                password: "",
                privateKey: "",
                group: node.group,
                tags: node.tags,
              })
            }
            className="px-2 py-1 text-xs rounded bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white"
            title="Edit"
          >
            ✏️
          </button>
          <button
            onClick={() => onTest(node.id)}
            disabled={testing}
            className="px-2 py-1 text-xs rounded bg-gray-800 hover:bg-amber-800 text-gray-400 hover:text-amber-200 disabled:opacity-50"
            title="Test Connection"
          >
            {testing ? "⏳" : "🔌"}
          </button>
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="px-2 py-1 text-xs rounded bg-gray-800 hover:bg-red-900 text-gray-400 hover:text-red-300"
            title="Delete"
          >
            🗑️
          </button>
        </div>
      </div>

      {/* Host info */}
      <div className="text-xs text-gray-400 space-y-1 mb-3">
        <div className="flex items-center gap-1">
          <span className="text-gray-500">Host:</span>
          <span className="font-mono text-gray-300">{node.host}:{node.port || 22}</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-gray-500">User:</span>
          <span>{node.username}</span>
          <span className="text-gray-600">·</span>
          <span className={node.authMethod === "key" ? "text-cyan-400" : "text-amber-400"}>
            {node.authMethod === "key" ? "🔑 Key" : "🔒 Pass"}
          </span>
        </div>
        {node.lastSeen && (
          <div className="text-gray-600">
            Last seen: {new Date(node.lastSeen).toLocaleString("zh-CN")}
          </div>
        )}
      </div>

      {/* Tags & group */}
      <div className="flex flex-wrap items-center gap-1">
        {node.group && (
          <span className="px-1.5 py-0.5 text-xs rounded bg-purple-900/50 text-purple-300 border border-purple-800/50">
            {node.group}
          </span>
        )}
        {node.tags.map((tag) => (
          <span
            key={tag}
            className="px-1.5 py-0.5 text-xs rounded bg-gray-800 text-gray-500 border border-gray-700/50"
          >
            {tag}
          </span>
        ))}
      </div>

      {/* Delete confirmation */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60" onClick={() => setShowDeleteConfirm(false)} />
          <div className="relative bg-gray-900 border border-gray-700 rounded-xl p-6 w-full max-w-md mx-4 shadow-2xl">
            <h3 className="text-lg font-semibold mb-2">Delete Node</h3>
            <p className="text-sm text-gray-400 mb-6">
              Delete "{node.name}"? Credentials will be removed. This cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="px-4 py-2 text-sm rounded-lg bg-gray-700 hover:bg-gray-600 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setShowDeleteConfirm(false);
                  onDelete(node.id);
                }}
                className="px-4 py-2 text-sm rounded-lg bg-red-600 hover:bg-red-500 text-white transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
