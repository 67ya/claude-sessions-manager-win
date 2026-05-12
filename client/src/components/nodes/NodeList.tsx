import type { ManagedNode } from "../../types";
import type { NodeFormData } from "./NodeForm";
import NodeCard from "./NodeCard";

interface Props {
  nodes: ManagedNode[];
  groups: string[];
  groupFilter: string;
  onGroupFilter: (g: string) => void;
  onAdd: () => void;
  onEdit: (id: string, data: NodeFormData) => void;
  onDelete: (id: string) => void;
  onTest: (id: string) => void;
  onTerminal: (id: string) => void;
  testingId: string | null;
}

export default function NodeList({
  nodes,
  groups,
  groupFilter,
  onGroupFilter,
  onAdd,
  onEdit,
  onDelete,
  onTest,
  onTerminal,
  testingId,
}: Props) {
  const filtered = groupFilter
    ? nodes.filter((n) => n.group === groupFilter)
    : nodes;

  const online = nodes.filter((n) => n.status === "online").length;
  const offline = nodes.filter((n) => n.status === "offline").length;

  return (
    <div>
      {/* Toolbar */}
      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <button
          onClick={onAdd}
          className="px-4 py-2 text-sm rounded-lg bg-purple-600 hover:bg-purple-500 transition-colors"
        >
          + Add Node
        </button>

        {/* Group filter */}
        <div className="flex gap-1 flex-wrap">
          <button
            onClick={() => onGroupFilter("")}
            className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${
              groupFilter === ""
                ? "bg-purple-600 text-white"
                : "bg-gray-800 text-gray-400 hover:bg-gray-700"
            }`}
          >
            All
          </button>
          {groups.map((g) => (
            <button
              key={g}
              onClick={() => onGroupFilter(g)}
              className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${
                groupFilter === g
                  ? "bg-purple-600 text-white"
                  : "bg-gray-800 text-gray-400 hover:bg-gray-700"
              }`}
            >
              {g}
            </button>
          ))}
        </div>

        <div className="flex-1" />

        <div className="flex gap-3 text-xs text-gray-500">
          <span className="text-green-400">{online} online</span>
          <span className="text-red-400">{offline} offline</span>
          <span>{nodes.length - online - offline} unknown</span>
        </div>
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <div className="text-center py-20 text-gray-500">
          <p className="text-lg">
            {nodes.length === 0 ? "No nodes configured" : "No nodes in this group"}
          </p>
          <p className="text-sm mt-2">
            {nodes.length === 0 ? "Add your first node to get started" : "Select a different group filter"}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((node) => (
            <NodeCard
              key={node.id}
              node={node}
              onEdit={onEdit}
              onDelete={onDelete}
              onTest={onTest}
              onTerminal={onTerminal}
              testing={testingId === node.id}
            />
          ))}
        </div>
      )}
    </div>
  );
}
