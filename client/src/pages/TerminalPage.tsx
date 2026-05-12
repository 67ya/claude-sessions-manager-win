import { useState, useEffect, useCallback } from "react";
import { fetchNodes } from "../api";
import type { ManagedNode } from "../types";
import TerminalView from "../components/terminal/TerminalView";

interface Tab {
  id: string;
  nodeId: string;
  nodeName: string;
}

export default function TerminalPage() {
  const [nodes, setNodes] = useState<ManagedNode[]>([]);
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetchNodes();
      setNodes(res.nodes);
    } catch {}
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openTerminal = () => {
    if (!selectedNode) return;
    const node = nodes.find((n) => n.id === selectedNode);
    if (!node) return;
    const tab: Tab = {
      id: `tab-${Date.now()}`,
      nodeId: node.id,
      nodeName: node.name,
    };
    setTabs((prev) => [...prev, tab]);
    setActiveTab(tab.id);
  };

  const closeTab = (tabId: string) => {
    setTabs((prev) => {
      const next = prev.filter((t) => t.id !== tabId);
      if (activeTab === tabId) {
        setActiveTab(next.length > 0 ? next[next.length - 1].id : null);
      }
      return next;
    });
  };

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      {/* Header */}
      <div className="px-3 md:px-6 py-3 md:py-4 border-b border-gray-800">
        <h1 className="text-lg font-semibold text-gray-100">SSH Terminal</h1>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-2 md:gap-3 px-3 md:px-6 py-2 md:py-3 border-b border-gray-800 bg-gray-900/50 flex-wrap">
        <select
          value={selectedNode}
          onChange={(e) => setSelectedNode(e.target.value)}
          className="bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm text-gray-200 focus:outline-none focus:border-blue-600 min-w-[140px] flex-1 md:flex-none md:min-w-[200px]"
        >
          <option value="">Select a node...</option>
          {nodes.map((n) => (
            <option key={n.id} value={n.id}>
              {n.name} ({n.host}){" "}
              {n.status === "online" ? "●" : n.status === "offline" ? "○" : "◇"}
            </option>
          ))}
        </select>
        <button
          onClick={openTerminal}
          disabled={!selectedNode}
          className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm rounded transition-colors"
        >
          Connect
        </button>
        {tabs.length > 0 && (
          <span className="text-xs text-gray-500 ml-auto">
            {tabs.length} session{tabs.length > 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* Tab bar */}
      {tabs.length > 0 && (
        <div className="flex bg-gray-900 border-b border-gray-800 px-2 overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-3 py-2 text-sm border-r border-gray-800 transition-colors shrink-0 ${
                activeTab === tab.id
                  ? "bg-gray-800 text-gray-100 border-t-2 border-t-blue-500"
                  : "text-gray-400 hover:text-gray-200 hover:bg-gray-800/50"
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  nodes.find((n) => n.id === tab.nodeId)?.status === "online"
                    ? "bg-green-500"
                    : "bg-gray-500"
                }`}
              />
              {tab.nodeName}
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  closeTab(tab.id);
                }}
                className="text-gray-600 hover:text-gray-300 ml-1"
              >
                ×
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Terminal content */}
      <div className="flex-1 min-h-0">
        {tabs.length === 0 ? (
          <div className="flex items-center justify-center py-20 text-gray-500">
            <div className="text-center">
              <span className="text-4xl">⬛</span>
              <p className="text-lg mt-4">SSH Terminal</p>
              <p className="text-sm mt-2">
                Select a node and click Connect to open a terminal session.
              </p>
            </div>
          </div>
        ) : (
          tabs.map((tab) => (
            <div
              key={tab.id}
              className={activeTab === tab.id ? "h-full" : "hidden"}
            >
              <TerminalView
                nodeId={tab.nodeId}
                onClose={() => closeTab(tab.id)}
              />
            </div>
          ))
        )}
      </div>
    </div>
  );
}
