import type { ClusterTree as Tree, GroupTreeNode } from '../../hooks/useClusterTree';
import type { Selection } from '../../types';
import GroupNode from './GroupNode';

interface Props {
  tree: Tree;
  selection: Selection;
  expandedIds: Set<string>;
  forbiddenDropIds: Set<string>;
  onToggle: (id: string) => void;
  onSelect: (sel: Selection) => void;
  onEditGroup: (node: GroupTreeNode) => void;
  onAddChildGroup: (parentId: string) => void;
  onDeleteGroup: (node: GroupTreeNode) => void;
}

export default function ClusterTree({
  tree,
  selection,
  expandedIds,
  forbiddenDropIds,
  onToggle,
  onSelect,
  onEditGroup,
  onAddChildGroup,
  onDeleteGroup,
}: Props) {
  return (
    <div role="tree" className="text-sm space-y-0.5">
      <button
        type="button"
        onClick={() => onSelect({ kind: 'all' })}
        className={`w-full text-left px-2 py-1.5 rounded-lg transition-colors ${
          selection.kind === 'all'
            ? 'bg-amber-500/10 text-amber-400'
            : 'hover:bg-white/5 text-slate-300'
        }`}
      >
        <span className="mr-1">▾</span>
        All Clusters
      </button>

      {tree.roots.map((node, index) => (
        <GroupNode
          key={node.group.id}
          node={node}
          selection={selection}
          expandedIds={expandedIds}
          forbiddenDropIds={forbiddenDropIds}
          onToggle={onToggle}
          onSelect={onSelect}
          onEdit={onEditGroup}
          onAddChild={onAddChildGroup}
          onDelete={onDeleteGroup}
          posInSet={index + 1}
          setSize={tree.roots.length}
        />
      ))}

      <button
        type="button"
        onClick={() => onSelect({ kind: 'ungrouped' })}
        className={`w-full text-left px-2 py-1.5 rounded-lg transition-colors ${
          selection.kind === 'ungrouped'
            ? 'bg-amber-500/10 text-amber-400'
            : 'hover:bg-white/5 text-slate-400'
        }`}
      >
        <span className="mr-1">▸</span>
        Ungrouped <span className="text-xs text-slate-500 font-mono-data ml-1">({tree.ungrouped.length})</span>
      </button>
    </div>
  );
}
