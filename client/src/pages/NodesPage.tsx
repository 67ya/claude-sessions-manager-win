import { useState, useEffect, useCallback } from "react";
import type { ManagedNode } from "../types";
import { fetchNodes, addNode, updateNode, deleteNode, testNodeConnection } from "../api";
import NodeList from "../components/nodes/NodeList";
import NodeForm from "../components/nodes/NodeForm";
import type { NodeFormData } from "../components/nodes/NodeForm";

interface Props {
  showToast: (msg: string) => void;
}

export default function NodesPage({ showToast }: Props) {
  const [nodes, setNodes] = useState<ManagedNode[]>([]);
  const [groups, setGroups] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [groupFilter, setGroupFilter] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingNode, setEditingNode] = useState<{ id: string; data: NodeFormData } | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchNodes();
      setNodes(data.nodes);
      setGroups(data.groups);
    } catch (e: any) {
      showToast(e.message || "Failed to load nodes");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleAdd = () => {
    setEditingNode(null);
    setShowForm(true);
  };

  const handleEdit = (id: string, data: NodeFormData) => {
    setEditingNode({ id, data });
    setShowForm(true);
  };

  const handleSave = async (data: NodeFormData) => {
    try {
      if (editingNode) {
        const payload: any = { ...data };
        if (!payload.password) delete payload.password;
        if (!payload.privateKey) delete payload.privateKey;
        await updateNode(editingNode.id, payload);
        showToast("Node updated");
      } else {
        await addNode(data);
        showToast("Node added");
      }
      setShowForm(false);
      setEditingNode(null);
      load();
    } catch (e: any) {
      showToast(e.message || "Save failed");
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteNode(id);
      showToast("Node deleted");
      load();
    } catch (e: any) {
      showToast(e.message || "Delete failed");
    }
  };

  const handleTest = async (id: string) => {
    setTestingId(id);
    try {
      const result = await testNodeConnection(id);
      if (result.ok) {
        showToast("Connection successful!");
      } else {
        showToast(`Connection failed: ${result.error}`);
      }
      load();
    } catch (e: any) {
      showToast(e.message || "Test failed");
    }
    setTestingId(null);
  };

  const handleTerminal = (id: string) => {
    window.location.hash = `#/terminal?node=${id}`;
  };

  return (
    <>
      <header className="border-b border-gray-800 bg-gray-900/50 backdrop-blur sticky top-0 z-30">
        <div className="px-2 md:px-4 py-2 md:py-3 flex items-center gap-4">
          <h2 className="text-sm font-semibold text-gray-300">Nodes</h2>
          <div className="text-xs text-gray-500 ml-auto">{nodes.length} nodes</div>
        </div>
      </header>

      <main className="px-2 md:px-4 py-4 md:py-6">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin w-8 h-8 border-2 border-purple-400 border-t-transparent rounded-full" />
          </div>
        ) : (
          <NodeList
            nodes={nodes}
            groups={groups}
            groupFilter={groupFilter}
            onGroupFilter={setGroupFilter}
            onAdd={handleAdd}
            onEdit={handleEdit}
            onDelete={handleDelete}
            onTest={handleTest}
            onTerminal={handleTerminal}
            testingId={testingId}
          />
        )}
      </main>

      <NodeForm
        open={showForm}
        title={editingNode ? "Edit Node" : "Add Node"}
        initial={editingNode?.data}
        onSave={handleSave}
        onCancel={() => {
          setShowForm(false);
          setEditingNode(null);
        }}
      />
    </>
  );
}
