import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useDroppable } from '@dnd-kit/core';
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

function VirtualRow({
  id,
  selected,
  onSelect,
  label,
  count,
  textClassName = 'text-slate-300',
  chevron = '▾',
}: {
  id: 'drop-all' | 'drop-ungrouped';
  selected: boolean;
  onSelect: () => void;
  label: string;
  count?: number;
  textClassName?: string;
  chevron?: string;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id,
    data: { kind: id === 'drop-ungrouped' ? 'ungrouped' : 'all' },
    disabled: id === 'drop-all',
  });
  return (
    <button
      ref={setNodeRef}
      type="button"
      onClick={onSelect}
      className={`w-full text-left px-2 py-1.5 rounded-lg transition-colors ${
        selected
          ? 'bg-amber-500/10 text-amber-400'
          : `hover:bg-white/5 ${textClassName}`
      } ${isOver ? 'ring-2 ring-cyan-500/60 shadow-cyan-500/30 shadow' : ''}`}
    >
      <span className="mr-1">{chevron}</span>
      {label}
      {typeof count === 'number' && (
        <span className="text-xs text-slate-500 font-mono-data ml-1">({count})</span>
      )}
    </button>
  );
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
  const [ungroupedExpanded, setUngroupedExpanded] = useState(false);

  return (
    <div role="tree" className="text-sm space-y-0.5">
      <VirtualRow
        id="drop-all"
        selected={selection.kind === 'all'}
        onSelect={() => onSelect({ kind: 'all' })}
        label="All Clusters"
      />

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

      <VirtualRow
        id="drop-ungrouped"
        selected={selection.kind === 'ungrouped'}
        onSelect={() => {
          onSelect({ kind: 'ungrouped' });
          setUngroupedExpanded((e) => !e);
        }}
        label="Ungrouped"
        count={tree.ungrouped.length}
        textClassName="text-slate-400"
        chevron={ungroupedExpanded ? '▾' : '▸'}
      />
      {ungroupedExpanded && (
        <div>
          {tree.ungrouped.map((cluster) => (
            <div
              key={cluster.id}
              role="treeitem"
              aria-level={1}
              className="flex items-center gap-1 px-2 py-1 rounded-lg cursor-pointer hover:bg-white/5 text-slate-400 transition-colors"
              style={{ paddingLeft: '24px' }}
            >
              <span className="w-4 h-4 flex items-center justify-center text-slate-600 text-xs">·</span>
              <span className="text-xs">🔌</span>
              <Link
                to={`/clusters/${cluster.id}/topics`}
                className="flex-1 text-sm truncate hover:text-cyan-400 transition-colors"
                onClick={(e) => e.stopPropagation()}
              >
                {cluster.name}
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
