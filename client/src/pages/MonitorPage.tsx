import { useState, useEffect, useCallback } from "react";
import { fetchNodes, fetchMonitor } from "../api";
import type { MonitorSnapshot } from "../types";

function Gauge({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  const barColor =
    color === "green" ? "bg-green-500" : color === "amber" ? "bg-amber-500" : "bg-red-500";
  const textColor =
    color === "green" ? "text-green-400" : color === "amber" ? "text-amber-400" : "text-red-400";
  return (
    <div className="mb-3">
      <div className="flex justify-between text-xs mb-1">
        <span className="text-gray-400">{label}</span>
        <span className={textColor}>{value.toFixed(1)}%</span>
      </div>
      <div className="w-full bg-gray-800 rounded-full h-2.5">
        <div
          className={`${barColor} h-2.5 rounded-full transition-all duration-500`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function LoadBar({ label, value, max }: { label: string; value: number; max: number }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="text-gray-500 w-10">{label}</span>
      <div className="flex-1 bg-gray-800 rounded-full h-1.5">
        <div
          className="bg-cyan-500 h-1.5 rounded-full transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-gray-400 w-12 text-right">{value.toFixed(2)}</span>
    </div>
  );
}

function StatCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
      <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">{title}</h3>
      {children}
    </div>
  );
}

const LOCALHOST_ID = "_localhost";
const LOCALHOST_ENTRY = { id: LOCALHOST_ID, name: "This Machine", host: "localhost" };

export default function MonitorPage() {
  const [nodes, setNodes] = useState<Array<{ id: string; name: string; host: string }>>([]);
  const [selectedNode, setSelectedNode] = useState<string>("");
  const [data, setData] = useState<MonitorSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  useEffect(() => {
    fetchNodes().then((r) => {
      setNodes(r.nodes);
      // Auto-select localhost on first load
      setSelectedNode((prev) => prev || LOCALHOST_ID);
    });
  }, []);

  // Merge localhost + managed nodes for the selector
  const allNodes = [LOCALHOST_ENTRY, ...nodes];

  const loadMonitor = useCallback(async (nodeId: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchMonitor(nodeId);
      setData(res);
    } catch (e: any) {
      setError(e.message || "Failed to load monitor data");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!selectedNode || !autoRefresh) return;
    loadMonitor(selectedNode);
    const interval = setInterval(() => loadMonitor(selectedNode), 5000);
    return () => clearInterval(interval);
  }, [selectedNode, autoRefresh, loadMonitor]);

  const handleNodeChange = (nodeId: string) => {
    setSelectedNode(nodeId);
    setData(null);
    if (nodeId) loadMonitor(nodeId);
  };

  return (
    <div className="p-3 md:p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-4 md:mb-6 gap-2 flex-wrap">
        <h2 className="text-lg font-semibold">Resource Monitor</h2>
        <div className="flex items-center gap-2 md:gap-3 flex-wrap">
          <select
            value={selectedNode}
            onChange={(e) => handleNodeChange(e.target.value)}
            className="bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-purple-500 max-w-[160px]"
          >
            <option value="">Select a node...</option>
            {allNodes.map((n) => (
              <option key={n.id} value={n.id}>
                {n.name} ({n.host})
              </option>
            ))}
          </select>
          {selectedNode && (
            <label className="flex items-center gap-1.5 text-xs text-gray-400 cursor-pointer">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                className="rounded"
              />
              Auto-refresh (5s)
            </label>
          )}
        </div>
      </div>

      {!selectedNode && (
        <div className="text-center py-20 text-gray-500">
          <span className="text-4xl">📊</span>
          <p className="mt-4">Select a node to view system resources</p>
        </div>
      )}

      {error && (
        <div className="mb-4 px-4 py-2 bg-red-900/30 text-red-300 text-sm rounded-lg flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="hover:text-white">✕</button>
        </div>
      )}

      {selectedNode && loading && !data && (
        <div className="flex justify-center py-12">
          <div className="animate-spin w-6 h-6 border-2 border-purple-400 border-t-transparent rounded-full" />
        </div>
      )}

      {data && (
        <div className="space-y-4">
          {/* System info bar */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 flex items-center gap-4 text-sm flex-wrap">
            <span className="text-gray-300 font-medium">🖥 {data.hostname}</span>
            <span className="text-gray-600">|</span>
            <span className="text-gray-400 text-xs">⏱ {data.uptime}</span>
            <span className="text-gray-600">|</span>
            <span className="text-xs text-gray-500">
              CPU: {data.cpu.model?.slice(0, 30) || "Unknown"} ({data.cpu.cores} cores)
            </span>
          </div>

          {/* Resource gauges */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <StatCard title="CPU Usage">
              <div className="text-3xl font-mono font-bold text-purple-400 mb-3">
                {data.cpu.usagePercent.toFixed(1)}%
              </div>
              <Gauge label="CPU" value={data.cpu.usagePercent} max={100} color={data.cpu.usagePercent > 80 ? "red" : data.cpu.usagePercent > 50 ? "amber" : "green"} />
              <div className="mt-2 text-xs text-gray-500">
                Load: {data.loadAvg["1min"]} / {data.loadAvg["5min"]} / {data.loadAvg["10min"]}
              </div>
            </StatCard>

            <StatCard title="Memory">
              <div className="text-3xl font-mono font-bold text-green-400 mb-3">
                {data.memory.used} <span className="text-sm text-gray-500">/ {data.memory.total}</span>
              </div>
              <Gauge label="Memory" value={data.memory.usagePercent} max={100} color={data.memory.usagePercent > 90 ? "red" : data.memory.usagePercent > 70 ? "amber" : "green"} />
            </StatCard>

            <StatCard title="Load Average">
              <div className="space-y-2 pt-1">
                <LoadBar label="1 min" value={data.loadAvg["1min"]} max={data.cpu.cores || 4} />
                <LoadBar label="5 min" value={data.loadAvg["5min"]} max={data.cpu.cores || 4} />
                <LoadBar label="10 min" value={data.loadAvg["10min"]} max={data.cpu.cores || 4} />
              </div>
              {data.processes.total > 0 && (
                <div className="mt-3 text-xs text-gray-500">
                  {data.processes.total} processes total
                </div>
              )}
            </StatCard>
          </div>

          {/* Disk usage */}
          <StatCard title="Disk">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-gray-500 border-b border-gray-800">
                    <th className="text-left py-1.5 px-2 font-medium">Filesystem</th>
                    <th className="text-right py-1.5 px-2 font-medium">Size</th>
                    <th className="text-right py-1.5 px-2 font-medium">Used</th>
                    <th className="text-right py-1.5 px-2 font-medium">Available</th>
                    <th className="text-right py-1.5 px-2 font-medium">Use%</th>
                    <th className="text-left py-1.5 px-2 font-medium">Mount</th>
                  </tr>
                </thead>
                <tbody>
                  {data.disk.map((d) => (
                    <tr key={d.mountpoint} className="border-b border-gray-800/30 hover:bg-gray-800/30">
                      <td className="py-1.5 px-2 text-gray-300">{d.filesystem}</td>
                      <td className="py-1.5 px-2 text-right text-gray-400">{d.size}</td>
                      <td className="py-1.5 px-2 text-right text-gray-400">{d.used}</td>
                      <td className="py-1.5 px-2 text-right text-gray-400">{d.available}</td>
                      <td className="py-1.5 px-2 text-right">
                        <span className={d.usagePercent > 90 ? "text-red-400" : d.usagePercent > 70 ? "text-amber-400" : "text-gray-400"}>
                          {d.usagePercent}%
                        </span>
                      </td>
                      <td className="py-1.5 px-2 text-gray-400">{d.mountpoint}</td>
                    </tr>
                  ))}
                  {data.disk.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-4 text-center text-gray-600">No disk info available</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </StatCard>

          {/* Top processes + Network */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <StatCard title={`Top Processes (${data.processes.top5.length})`}>
              {data.processes.top5.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-gray-500 border-b border-gray-800">
                        <th className="text-left py-1 px-1 font-medium">PID</th>
                        <th className="text-right py-1 px-1 font-medium">CPU%</th>
                        <th className="text-right py-1 px-1 font-medium">MEM%</th>
                        <th className="text-left py-1 px-1 font-medium">Command</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.processes.top5.map((p) => (
                        <tr key={p.pid} className="border-b border-gray-800/30">
                          <td className="py-1 px-1 text-gray-500">{p.pid}</td>
                          <td className="py-1 px-1 text-right text-amber-400">{p.cpu}</td>
                          <td className="py-1 px-1 text-right text-green-400">{p.mem}</td>
                          <td className="py-1 px-1 text-gray-400 truncate max-w-[180px]">{p.command}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-gray-600 text-xs py-2">No process data</div>
              )}
            </StatCard>

            <StatCard title="Network Interfaces">
              {data.network.interfaces.length > 0 ? (
                <div className="space-y-1.5">
                  {data.network.interfaces.map((iface) => (
                    <div key={iface.name} className="flex items-center justify-between text-xs">
                      <span className="text-gray-400">{iface.name}</span>
                      <code className="text-purple-400">{iface.ip}</code>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-gray-600 text-xs py-2">No network data</div>
              )}
            </StatCard>
          </div>
        </div>
      )}
    </div>
  );
}
