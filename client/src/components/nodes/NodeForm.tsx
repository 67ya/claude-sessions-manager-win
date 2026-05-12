import { useState, useEffect } from "react";

export interface NodeFormData {
  name: string;
  host: string;
  port: number;
  username: string;
  authMethod: "password" | "key";
  password: string;
  privateKey: string;
  group: string;
  tags: string[];
}

interface Props {
  open: boolean;
  title: string;
  initial?: NodeFormData;
  onSave: (data: NodeFormData) => void;
  onCancel: () => void;
}

const empty: NodeFormData = {
  name: "",
  host: "",
  port: 22,
  username: "root",
  authMethod: "password",
  password: "",
  privateKey: "",
  group: "",
  tags: [],
};

export default function NodeForm({ open, title, initial, onSave, onCancel }: Props) {
  const [form, setForm] = useState<NodeFormData>(empty);
  const [tagInput, setTagInput] = useState("");

  useEffect(() => {
    if (open) {
      setForm(initial || { ...empty });
      setTagInput("");
    }
  }, [open]);

  if (!open) return null;

  const update = (k: keyof NodeFormData, v: any) => setForm((f) => ({ ...f, [k]: v }));

  const addTag = () => {
    const t = tagInput.trim();
    if (t && !form.tags.includes(t)) {
      setForm((f) => ({ ...f, tags: [...f.tags, t] }));
    }
    setTagInput("");
  };

  const removeTag = (tag: string) => {
    setForm((f) => ({ ...f, tags: f.tags.filter((x) => x !== tag) }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.host.trim() || !form.username.trim()) return;
    onSave(form);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onCancel} />
      <div className="relative bg-gray-900 border border-gray-700 rounded-xl p-6 w-full max-w-lg mx-4 shadow-2xl max-h-[90vh] overflow-y-auto">
        <h3 className="text-lg font-semibold mb-4">{title}</h3>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs text-gray-400 mb-1">Name *</label>
            <input
              value={form.name}
              onChange={(e) => update("name", e.target.value)}
              placeholder="e.g. dev-server-01"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-purple-500"
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Host *</label>
              <input
                value={form.host}
                onChange={(e) => update("host", e.target.value)}
                placeholder="192.168.1.100"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-purple-500 font-mono"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Port</label>
              <input
                type="number"
                value={form.port}
                onChange={(e) => update("port", parseInt(e.target.value) || 22)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-purple-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1">Username *</label>
            <input
              value={form.username}
              onChange={(e) => update("username", e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-purple-500"
            />
          </div>

          {/* Auth method */}
          <div>
            <label className="block text-xs text-gray-400 mb-2">Auth Method</label>
            <div className="flex gap-2">
              {(["password", "key"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => update("authMethod", m)}
                  className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${
                    form.authMethod === m
                      ? "bg-purple-600 text-white"
                      : "bg-gray-800 text-gray-400 hover:bg-gray-700"
                  }`}
                >
                  {m === "key" ? "🔑 Private Key" : "🔒 Password"}
                </button>
              ))}
            </div>
          </div>

          {/* Auth input */}
          {form.authMethod === "password" ? (
            <div>
              <label className="block text-xs text-gray-400 mb-1">
                Password {initial?.host ? "(leave blank to keep)" : "*"}
              </label>
              <input
                type="password"
                value={form.password}
                onChange={(e) => update("password", e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-purple-500"
              />
            </div>
          ) : (
            <div>
              <label className="block text-xs text-gray-400 mb-1">
                Private Key {initial?.host ? "(leave blank to keep)" : ""}
              </label>
              <textarea
                value={form.privateKey}
                onChange={(e) => update("privateKey", e.target.value)}
                rows={4}
                placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-purple-500 font-mono"
              />
            </div>
          )}

          {/* Group */}
          <div>
            <label className="block text-xs text-gray-400 mb-1">Group</label>
            <input
              value={form.group}
              onChange={(e) => update("group", e.target.value)}
              placeholder="e.g. production, staging"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-purple-500"
            />
          </div>

          {/* Tags */}
          <div>
            <label className="block text-xs text-gray-400 mb-1">Tags</label>
            <div className="flex gap-1">
              <input
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addTag())}
                placeholder="Add tag..."
                className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-purple-500"
              />
              <button
                type="button"
                onClick={addTag}
                className="px-3 py-2 text-xs rounded-lg bg-gray-700 hover:bg-gray-600"
              >
                +
              </button>
            </div>
            {form.tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {form.tags.map((tag) => (
                  <span
                    key={tag}
                    className="px-1.5 py-0.5 text-xs rounded bg-purple-900/50 text-purple-300 flex items-center gap-1"
                  >
                    {tag}
                    <button type="button" onClick={() => removeTag(tag)} className="text-purple-400 hover:text-red-300">
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 text-sm rounded-lg bg-gray-700 hover:bg-gray-600 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-sm rounded-lg bg-purple-600 hover:bg-purple-500 transition-colors"
            >
              Save
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
