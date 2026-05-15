import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { createCluster, deleteCluster, listClusters } from '../api/clusters';
import {
  createGroup,
  deleteGroup,
  listGroups,
  updateGroup,
} from '../api/groups';
import { useClusterTree, collectDescendantGroupIds } from '../hooks/useClusterTree';
import type { Group, Selection, ViewMode } from '../types';
import ClusterTree from '../components/cluster/ClusterTree';
import ClusterDetailPanel from '../components/cluster/ClusterDetailPanel';
import GroupEditModal from '../components/cluster/GroupEditModal';
import type { GroupTreeNode } from '../hooks/useClusterTree';

const EXPANDED_KEY = 'kafka-ui:expanded-group-ids';

function loadExpanded(): Set<string> {
  try {
    const raw = localStorage.getItem(EXPANDED_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

export default function ClusterListPage() {
  const queryClient = useQueryClient();

  const { data: clusters = [], isLoading: cl } = useQuery({
    queryKey: ['clusters'],
    queryFn: listClusters,
  });
  const { data: groups = [], isLoading: gl } = useQuery({
    queryKey: ['groups'],
    queryFn: listGroups,
  });
  const tree = useClusterTree(groups, clusters);

  const forbiddenDropIds = useMemo(() => {
    if (!activeDrag || activeDrag.kind !== 'group') return new Set<string>();
    const node = tree.byId.get(activeDrag.id);
    if (!node) return new Set<string>();
    const ids = collectDescendantGroupIds(node);
    ids.add(activeDrag.id); // can't drop into itself
    return ids;
  }, [activeDrag, tree]);

  const [selection, setSelection] = useState<Selection>({ kind: 'all' });
  const [viewMode, setViewMode] = useState<ViewMode>('recursive');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(loadExpanded);
  const [showAddCluster, setShowAddCluster] = useState(false);
  const [name, setName] = useState('');
  const [bootstrapServers, setBootstrapServers] = useState('');

  const [activeDrag, setActiveDrag] = useState<
    | { kind: 'group'; id: string; label: string }
    | { kind: 'cluster'; id: string; label: string }
    | null
  >(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
    useSensor(KeyboardSensor)
  );

  const onDragStart = (e: DragStartEvent) => {
    const data = e.active.data.current as
      | { kind: 'group'; label: string }
      | { kind: 'cluster'; label: string }
      | undefined;
    if (!data) return;
    setActiveDrag({ kind: data.kind, id: String(e.active.id), label: data.label });
  };

  const onDragEnd = (_e: DragEndEvent) => {
    // Filled in by Tasks 22 and 23
    setActiveDrag(null);
  };

  // Group modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<Group | null>(null);
  const [modalParentId, setModalParentId] = useState<string | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);

  // Sync expandedIds → localStorage, pruning ids that no longer exist
  useEffect(() => {
    const existing = new Set(groups.map((g) => g.id));
    const pruned = new Set([...expandedIds].filter((id) => existing.has(id)));
    if (pruned.size !== expandedIds.size) {
      setExpandedIds(pruned);
    }
    try {
      localStorage.setItem(EXPANDED_KEY, JSON.stringify([...pruned]));
    } catch {
      /* ignore */
    }
  }, [groups, expandedIds]);

  const createClusterMutation = useMutation({
    mutationFn: createCluster,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clusters'] });
      setName('');
      setBootstrapServers('');
      setShowAddCluster(false);
    },
  });

  const deleteClusterMutation = useMutation({
    mutationFn: deleteCluster,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clusters'] });
    },
  });

  const createGroupMutation = useMutation({
    mutationFn: createGroup,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['groups'] });
      setModalOpen(false);
      setModalError(null);
    },
    onError: (e: unknown) => {
      const message = extractError(e);
      setModalError(message);
    },
  });

  const updateGroupMutation = useMutation({
    mutationFn: ({ id, ...data }: { id: string; name?: string; color?: string | null; icon?: string | null; description?: string | null }) =>
      updateGroup(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['groups'] });
      setModalOpen(false);
      setModalError(null);
    },
    onError: (e: unknown) => {
      setModalError(extractError(e));
    },
  });

  const deleteGroupMutation = useMutation({
    mutationFn: deleteGroup,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['groups'] });
    },
    onError: (e: unknown) => {
      window.alert(extractError(e));
    },
  });

  if (cl || gl) {
    return (
      <div className="max-w-7xl mx-auto px-6 py-12 flex items-center justify-center">
        <div className="flex items-center gap-3 text-slate-500 font-mono-data">
          <div className="w-5 h-5 border-2 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin" />
          INITIALIZING...
        </div>
      </div>
    );
  }

  const toggleExpanded = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const openCreateGroup = () => {
    setEditingGroup(null);
    setModalParentId(selection.kind === 'group' ? selection.id : null);
    setModalError(null);
    setModalOpen(true);
  };

  const openEditGroup = (node: GroupTreeNode) => {
    setEditingGroup(node.group);
    setModalParentId(node.group.parent_id);
    setModalError(null);
    setModalOpen(true);
  };

  const openCreateChildGroup = (parentId: string) => {
    setEditingGroup(null);
    setModalParentId(parentId);
    setModalError(null);
    setModalOpen(true);
  };

  const handleSaveGroup = (data: {
    name: string;
    color: string | null;
    icon: string | null;
    description: string | null;
    parent_id?: string | null;
  }) => {
    if (editingGroup) {
      updateGroupMutation.mutate({
        id: editingGroup.id,
        name: data.name,
        color: data.color,
        icon: data.icon,
        description: data.description,
      });
    } else {
      createGroupMutation.mutate({
        ...data,
        parent_id: data.parent_id ?? null,
      });
    }
  };

  const handleAddCluster = () => {
    createClusterMutation.mutate({
      name,
      bootstrap_servers: bootstrapServers,
    });
  };

  return (
    <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
      <div className="max-w-7xl mx-auto px-6 py-10">
        <div className="mb-8 flex items-center justify-between gap-4">
          <div>
            <h1 className="font-display text-4xl font-bold text-gradient-amber mb-1">Clusters</h1>
            <p className="text-slate-500 text-sm">Manage your Kafka cluster connections</p>
          </div>
          <button
            type="button"
            onClick={openCreateGroup}
            className="btn-primary rounded-xl px-4 py-2 text-sm whitespace-nowrap"
          >
            + New Group
          </button>
        </div>

        <div className="flex flex-col md:flex-row gap-6">
          <aside className="md:w-72 md:flex-shrink-0 glass-panel rounded-2xl p-3">
            <ClusterTree
              tree={tree}
              selection={selection}
              expandedIds={expandedIds}
              forbiddenDropIds={forbiddenDropIds}
              onToggle={toggleExpanded}
              onSelect={setSelection}
              onEditGroup={openEditGroup}
              onAddChildGroup={openCreateChildGroup}
              onDeleteGroup={(node) => deleteGroupMutation.mutate(node.group.id)}
            />
          </aside>

          <div className="flex-1 min-w-0">
            {showAddCluster && (
              <div className="glass-panel rounded-2xl p-5 mb-5 glow-border">
                <div className="flex flex-col sm:flex-row gap-3">
                  <input
                    autoFocus
                    className="terminal-input rounded-xl px-4 py-2 text-sm flex-1"
                    placeholder="Cluster name..."
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                  <input
                    className="terminal-input rounded-xl px-4 py-2 text-sm flex-[2]"
                    placeholder="localhost:9092"
                    value={bootstrapServers}
                    onChange={(e) => setBootstrapServers(e.target.value)}
                  />
                  <button
                    type="button"
                    className="btn-primary rounded-xl px-4 py-2 text-sm"
                    onClick={handleAddCluster}
                    disabled={!name.trim() || !bootstrapServers.trim()}
                  >
                    Connect
                  </button>
                  <button
                    type="button"
                    className="px-4 py-2 rounded-xl text-sm text-slate-400 hover:bg-white/5"
                    onClick={() => setShowAddCluster(false)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
            <ClusterDetailPanel
              tree={tree}
              selection={selection}
              viewMode={viewMode}
              onViewModeChange={setViewMode}
              onDeleteCluster={(id) => deleteClusterMutation.mutate(id)}
              onOpenAddCluster={() => setShowAddCluster(true)}
            />
          </div>
        </div>

        <GroupEditModal
          group={editingGroup}
          parentId={modalParentId}
          open={modalOpen}
          saving={createGroupMutation.isPending || updateGroupMutation.isPending}
          errorMessage={modalError}
          onClose={() => setModalOpen(false)}
          onSave={handleSaveGroup}
        />
      </div>
      <DragOverlay>
        {activeDrag && (
          <div className="px-3 py-1.5 rounded-lg bg-cyan-500/20 border border-cyan-500/60 text-cyan-300 text-sm font-medium shadow-lg shadow-cyan-500/30">
            {activeDrag.label}
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}

function extractError(e: unknown): string {
  type AxiosLike = { response?: { data?: { error?: string } }; message?: string };
  const ax = e as AxiosLike;
  return ax?.response?.data?.error ?? ax?.message ?? 'Unknown error';
}
