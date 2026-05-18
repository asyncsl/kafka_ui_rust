import type { Cluster, Selection, ViewMode } from '../../types';
import type { ClusterTree, GroupTreeNode } from '../../hooks/useClusterTree';
import { collectDescendantClusters } from '../../hooks/useClusterTree';
import ClusterCard from './ClusterCard';

interface Props {
  tree: ClusterTree;
  selection: Selection;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  onDeleteCluster: (id: string) => void;
  onUpdateCluster?: (id: string, data: { name: string; bootstrap_servers: string }) => void;
  onOpenAddCluster: () => void;
}

function clustersForSelection(
  tree: ClusterTree,
  selection: Selection,
  viewMode: ViewMode
): Cluster[] {
  if (selection.kind === 'all') {
    const fromGroups = tree.roots.flatMap((r) => collectDescendantClusters(r));
    return [...fromGroups, ...tree.ungrouped];
  }
  if (selection.kind === 'ungrouped') {
    return tree.ungrouped;
  }
  const node: GroupTreeNode | undefined = tree.byId.get(selection.id);
  if (!node) return [];
  return viewMode === 'direct' ? node.clusters : collectDescendantClusters(node);
}

function titleFor(tree: ClusterTree, selection: Selection): string {
  if (selection.kind === 'all') return 'All Clusters';
  if (selection.kind === 'ungrouped') return 'Ungrouped';
  return tree.byId.get(selection.id)?.group.name ?? 'Unknown group';
}

export default function ClusterDetailPanel({
  tree,
  selection,
  viewMode,
  onViewModeChange,
  onDeleteCluster,
  onUpdateCluster,
  onOpenAddCluster,
}: Props) {
  const clusters = clustersForSelection(tree, selection, viewMode);
  const showViewToggle = selection.kind === 'group';
  const title = titleFor(tree, selection);

  return (
    <div className="flex-1 min-w-0">
      <div className="flex items-center justify-between mb-5 gap-3">
        <h2 className="font-display text-xl font-semibold text-slate-200 truncate">{title}</h2>
        <div className="flex items-center gap-3">
          {showViewToggle && (
            <div className="flex items-center gap-1 text-xs font-mono-data">
              <button
                type="button"
                onClick={() => onViewModeChange('direct')}
                className={`px-3 py-1.5 rounded-lg border ${
                  viewMode === 'direct'
                    ? 'border-cyan-500/40 bg-cyan-500/10 text-cyan-400'
                    : 'border-white/10 text-slate-500 hover:border-white/20'
                }`}
              >
                Direct
              </button>
              <button
                type="button"
                onClick={() => onViewModeChange('recursive')}
                className={`px-3 py-1.5 rounded-lg border ${
                  viewMode === 'recursive'
                    ? 'border-cyan-500/40 bg-cyan-500/10 text-cyan-400'
                    : 'border-white/10 text-slate-500 hover:border-white/20'
                }`}
              >
                Recursive
              </button>
            </div>
          )}
          <button
            type="button"
            onClick={onOpenAddCluster}
            className="btn-primary rounded-xl px-4 py-2 text-sm whitespace-nowrap"
          >
            + Add Cluster
          </button>
        </div>
      </div>

      {clusters.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {clusters.map((c, idx) => (
            <ClusterCard
              key={c.id}
              cluster={c}
              onDelete={onDeleteCluster}
              onUpdate={onUpdateCluster}
              animationDelay={0.05 * idx}
            />
          ))}
        </div>
      ) : (
        <div className="glass-panel rounded-2xl p-16 text-center">
          <p className="text-slate-500 font-display text-lg mb-1">
            {selection.kind === 'all'
              ? 'No clusters connected'
              : `No clusters in ${title}`}
          </p>
          <p className="text-slate-600 text-sm">
            Drag clusters here or click + Add Cluster.
          </p>
        </div>
      )}
    </div>
  );
}
