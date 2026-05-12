import { useState, useEffect, useRef } from "react";
import { fetchNodes, listFiles, getDownloadUrl, uploadFiles, deleteFile } from "../api";
import type { FileListing } from "../types";

function fmtSize(bytes: number) {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function fmtDate(ms: number) {
  return new Date(ms).toLocaleString("zh-CN");
}

export default function FilesPage() {
  const [nodes, setNodes] = useState<Array<{ id: string; name: string; host: string }>>([]);
  const [selectedNode, setSelectedNode] = useState<string>("");
  const [files, setFiles] = useState<FileListing | null>(null);
  const [path, setPath] = useState("/");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchNodes().then((r) => {
      setNodes(r.nodes);
    });
  }, []);

  const loadFiles = async (nodeId: string, dirPath: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await listFiles(nodeId, dirPath);
      setFiles(res);
      setPath(res.path);
    } catch (e: any) {
      setError(e.message || "Failed to load files");
    }
    setLoading(false);
  };

  useEffect(() => {
    if (selectedNode) loadFiles(selectedNode, path);
  }, [selectedNode]);

  const handleNavigate = (dir: string) => {
    if (!selectedNode) return;
    const newPath = path === "/" ? `/${dir}` : `${path}/${dir}`;
    setPath(newPath);
    loadFiles(selectedNode, newPath);
  };

  const handleUp = () => {
    if (path === "/" || !selectedNode) return;
    const parts = path.split("/").filter(Boolean);
    parts.pop();
    const newPath = parts.length === 0 ? "/" : `/${parts.join("/")}`;
    setPath(newPath);
    loadFiles(selectedNode, newPath);
  };

  const handleDownload = (name: string) => {
    if (!selectedNode) return;
    const filePath = path === "/" ? `/${name}` : `${path}/${name}`;
    window.open(getDownloadUrl(selectedNode, filePath), "_blank");
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0 || !selectedNode) return;
    setUploading(true);
    try {
      const res = await uploadFiles(selectedNode, path, fileList);
      const failed = res.results.filter((r) => !r.success);
      if (failed.length > 0) {
        setError(`Upload failed: ${failed.map((f) => f.name).join(", ")}`);
      }
      await loadFiles(selectedNode, path);
    } catch (e: any) {
      setError(e.message || "Upload failed");
    }
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleDelete = async (name: string, type: string) => {
    if (!selectedNode) return;
    const isDir = type === "directory";
    const msg = isDir
      ? `Delete directory "${name}" and all its contents?`
      : `Delete file "${name}"?`;
    if (!confirm(msg)) return;
    try {
      const filePath = path === "/" ? `/${name}` : `${path}/${name}`;
      await deleteFile(selectedNode, filePath);
      await loadFiles(selectedNode, path);
    } catch (e: any) {
      setError(e.message || "Delete failed");
    }
  };

  const breadcrumbs = () => {
    const parts = path.split("/").filter(Boolean);
    const items = [{ label: "/", path: "/" }];
    let acc = "";
    for (const p of parts) {
      acc = `${acc}/${p}`;
      items.push({ label: p, path: acc });
    }
    return items.map((item, i) => (
      <span key={item.path}>
        {i > 0 && <span className="text-gray-600 mx-1">/</span>}
        <button
          onClick={() => {
            setPath(item.path);
            loadFiles(selectedNode, item.path);
          }}
          className="text-sm text-purple-400 hover:text-purple-300 hover:underline"
        >
          {item.label}
        </button>
      </span>
    ));
  };

  return (
    <div className="p-3 md:p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-4 md:mb-6 gap-2 flex-wrap">
        <h2 className="text-lg font-semibold">File Manager</h2>
        <div className="flex items-center gap-2 md:gap-3 flex-wrap">
          <select
            value={selectedNode}
            onChange={(e) => {
              setSelectedNode(e.target.value);
              setPath("/");
              if (e.target.value) loadFiles(e.target.value, "/");
            }}
            className="bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-purple-500 max-w-[140px]"
          >
            <option value="">Select a node...</option>
            {nodes.map((n) => (
              <option key={n.id} value={n.id}>
                {n.name} ({n.host})
              </option>
            ))}
          </select>
          {selectedNode && (
            <>
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="px-3 py-1.5 text-xs rounded-lg bg-purple-800 hover:bg-purple-700 text-purple-200 disabled:opacity-50"
              >
                {uploading ? "Uploading..." : "📤 Upload"}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={handleUpload}
              />
            </>
          )}
        </div>
      </div>

      {!selectedNode && (
        <div className="text-center py-20 text-gray-500">
          <span className="text-4xl">📁</span>
          <p className="mt-4">Select a node to browse files</p>
        </div>
      )}

      {selectedNode && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden overflow-x-auto">
          {/* Breadcrumb bar */}
          <div className="flex items-center gap-1 md:gap-2 px-2 md:px-4 py-2 bg-gray-800 border-b border-gray-800 overflow-x-auto text-xs md:text-sm whitespace-nowrap">
            <button
              onClick={handleUp}
              className="px-2 py-0.5 text-xs rounded bg-gray-800 hover:bg-gray-700 text-gray-400"
            >
              ⬆ Up
            </button>
            <div className="flex items-center">{breadcrumbs()}</div>
          </div>

          {/* Error */}
          {error && (
            <div className="px-4 py-2 bg-red-900/30 text-red-300 text-sm flex items-center justify-between">
              <span>{error}</span>
              <button onClick={() => setError(null)} className="hover:text-white">✕</button>
            </div>
          )}

          {/* File list */}
          {loading ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin w-6 h-6 border-2 border-purple-400 border-t-transparent rounded-full" />
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800 text-gray-500 text-xs">
                  <th className="text-left px-4 py-2 font-medium">Name</th>
                  <th className="text-right px-3 py-2 font-medium w-16">Size</th>
                  <th className="text-right px-3 py-2 font-medium w-40">Modified</th>
                  <th className="text-right px-4 py-2 font-medium w-24">Actions</th>
                </tr>
              </thead>
              <tbody>
                {files?.entries.map((entry) => (
                  <tr
                    key={entry.name}
                    className="border-b border-gray-800/50 hover:bg-gray-800/50"
                  >
                    <td className="px-4 py-2">
                      <button
                        onClick={() => entry.type === "directory" && handleNavigate(entry.name)}
                        className={`flex items-center gap-2 ${
                          entry.type === "directory"
                            ? "text-purple-400 hover:text-purple-300 cursor-pointer"
                            : "text-gray-300"
                        }`}
                      >
                        <span>{entry.type === "directory" ? "📁" : entry.type === "symlink" ? "🔗" : "📄"}</span>
                        <span className="truncate max-w-xs">{entry.name}</span>
                      </button>
                    </td>
                    <td className="px-3 py-2 text-right text-gray-500 text-xs">
                      {entry.type === "file" ? fmtSize(entry.size) : "-"}
                    </td>
                    <td className="px-3 py-2 text-right text-gray-500 text-xs">
                      {fmtDate(entry.mtime)}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {entry.type === "file" && (
                          <button
                            onClick={() => handleDownload(entry.name)}
                            className="px-2 py-0.5 text-xs rounded bg-gray-800 hover:bg-purple-900 text-gray-400 hover:text-purple-300"
                            title="Download"
                          >
                            ⬇
                          </button>
                        )}
                        <button
                          onClick={() => handleDelete(entry.name, entry.type)}
                          className="px-2 py-0.5 text-xs rounded bg-gray-800 hover:bg-red-900 text-gray-400 hover:text-red-300"
                          title="Delete"
                        >
                          🗑
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {files?.entries.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-12 text-center text-gray-600">
                      Empty directory
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
