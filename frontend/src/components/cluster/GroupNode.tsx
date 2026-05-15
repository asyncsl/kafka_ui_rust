import type { GroupTreeNode } from '../../hooks/useClusterTree';
import type { Selection } from '../../types';

interface Props {
  node: GroupTreeNode;
  selection: Selection;
  expandedIds: Set<string>;
  onToggle: (id: string) => void;
  onSelect: (sel: Selection) => void;
  onEdit: (node: GroupTreeNode) => void;
  onAddChild: (parentId: string) => void;
  onDelete: (node: GroupTreeNode) => void;
}

export default function GroupNode({
  node,
  selection,
  expandedIds,
  onToggle,
  onSelect,
  onEdit,
  onAddChild,
  onDelete,
}: Props) {
  const expanded = expandedIds.has(node.group.id);
  const isSelected = selection.kind === 'group' && selection.id === node.group.id;
  const childCount = node.children.length + node.clusters.length;
  const canExpand = node.children.length > 0 || node.clusters.length > 0;
  const isEmpty = childCount === 0;

  return (
    <div>
      <div
        role="treeitem"
        aria-expanded={canExpand ? expanded : undefined}
        aria-selected={isSelected}
        tabIndex={0}
        className={`group flex items-center gap-1 px-2 py-1.5 rounded-lg cursor-pointer transition-colors ${
          isSelected
            ? 'bg-amber-500/10 text-amber-400'
            : 'hover:bg-white/5 text-slate-300'
        }`}
        style={{ paddingLeft: `${8 + node.depth * 16}px` }}
        onClick={() => {
          onSelect({ kind: 'group', id: node.group.id });
          if (!expanded && canExpand) onToggle(node.group.id);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onSelect({ kind: 'group', id: node.group.id });
            if (!expanded && canExpand) onToggle(node.group.id);
          }
        }}
      >
        <button
          type="button"
          aria-label={expanded ? 'Collapse' : 'Expand'}
          onClick={(e) => {
            e.stopPropagation();
            onToggle(node.group.id);
          }}
          className={`w-4 h-4 flex items-center justify-center text-slate-500 hover:text-slate-300 ${
            canExpand ? '' : 'opacity-30 cursor-default'
          }`}
        >
          {canExpand ? (expanded ? '▾' : '▸') : '·'}
        </button>

        {node.group.icon && <span className="text-sm">{node.group.icon}</span>}

        <span
          className="flex-1 text-sm truncate"
          style={node.group.color ? { color: node.group.color } : undefined}
        >
          {node.group.name}
        </span>

        <span className="text-xs text-slate-500 font-mono-data">{childCount}</span>

        <button
          type="button"
          className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-slate-300 px-1"
          onClick={(e) => {
            e.stopPropagation();
            const action = window.prompt(
              'Action: e (edit), a (add child), d (delete)',
              'e'
            );
            if (action === 'e') onEdit(node);
            else if (action === 'a') onAddChild(node.group.id);
            else if (action === 'd') {
              if (isEmpty) onDelete(node);
              else window.alert('Group not empty — cannot delete');
            }
          }}
          title="Group actions"
        >
          ⋯
        </button>
      </div>

      {expanded && (
        <div>
          {node.children.map((child) => (
            <GroupNode
              key={child.group.id}
              node={child}
              selection={selection}
              expandedIds={expandedIds}
              onToggle={onToggle}
              onSelect={onSelect}
              onEdit={onEdit}
              onAddChild={onAddChild}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}
