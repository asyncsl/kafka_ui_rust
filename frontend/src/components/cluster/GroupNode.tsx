import { useEffect, useRef, useState } from 'react';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import type { GroupTreeNode } from '../../hooks/useClusterTree';
import type { Selection } from '../../types';

interface Props {
  node: GroupTreeNode;
  selection: Selection;
  expandedIds: Set<string>;
  /** IDs that should refuse drops (descendants of the currently-dragged group). */
  forbiddenDropIds: Set<string>;
  onToggle: (id: string) => void;
  onSelect: (sel: Selection) => void;
  onEdit: (node: GroupTreeNode) => void;
  onAddChild: (parentId: string) => void;
  onDelete: (node: GroupTreeNode) => void;
  posInSet?: number;
  setSize?: number;
}

export default function GroupNode({
  node,
  selection,
  expandedIds,
  forbiddenDropIds,
  onToggle,
  onSelect,
  onEdit,
  onAddChild,
  onDelete,
  posInSet,
  setSize,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const handle = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent && e.key === 'Escape') {
        setMenuOpen(false);
        triggerRef.current?.focus();
      } else if (e instanceof MouseEvent && menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('keydown', handle);
    document.addEventListener('mousedown', handle);
    return () => {
      document.removeEventListener('keydown', handle);
      document.removeEventListener('mousedown', handle);
    };
  }, [menuOpen]);

  const expanded = expandedIds.has(node.group.id);
  const isSelected = selection.kind === 'group' && selection.id === node.group.id;
  const childCount = node.children.length + node.clusters.length;
  const canExpand = node.children.length > 0 || node.clusters.length > 0;
  const isEmpty = childCount === 0;
  const isForbidden = forbiddenDropIds.has(node.group.id);

  const dragId = `group:${node.group.id}`;
  const dropId = `drop-group:${node.group.id}`;

  const draggable = useDraggable({
    id: dragId,
    data: { kind: 'group', label: node.group.name, sourceId: node.group.id },
    disabled: false,
  });

  const droppable = useDroppable({
    id: dropId,
    data: { kind: 'group', targetId: node.group.id },
    disabled: isForbidden,
  });

  const rowRef = (el: HTMLDivElement | null) => {
    draggable.setNodeRef(el);
    droppable.setNodeRef(el);
  };

  const hoverStyle = droppable.isOver
    ? isForbidden
      ? 'ring-2 ring-red-500/60 ring-dashed cursor-not-allowed'
      : 'ring-2 ring-cyan-500/60 shadow-cyan-500/30 shadow-lg'
    : '';

  return (
    <div>
      <div
        ref={rowRef}
        {...draggable.attributes}
        {...draggable.listeners}
        role="treeitem"
        aria-expanded={canExpand ? expanded : undefined}
        aria-selected={isSelected}
        aria-level={node.depth + 1}
        aria-posinset={posInSet}
        aria-setsize={setSize}
        tabIndex={0}
        className={`group flex items-center gap-1 px-2 py-1.5 rounded-lg cursor-pointer transition-colors ${
          isSelected
            ? 'bg-amber-500/10 text-amber-400'
            : 'hover:bg-white/5 text-slate-300'
        } ${hoverStyle} ${draggable.isDragging ? 'opacity-40' : ''}`}
        style={{
          paddingLeft: `${8 + node.depth * 16}px`,
          ...(draggable.transform
            ? { transform: `translate3d(${draggable.transform.x}px, ${draggable.transform.y}px, 0)` }
            : {}),
        }}
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
        <span
          role="button"
          tabIndex={-1}
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
        </span>

        {node.group.icon && <span className="text-sm">{node.group.icon}</span>}

        <span
          className="flex-1 text-sm truncate"
          style={node.group.color ? { color: node.group.color } : undefined}
        >
          {node.group.name}
        </span>

        <span className="text-xs text-slate-500 font-mono-data">{childCount}</span>

        <div ref={menuRef} className="relative" onClick={(e) => e.stopPropagation()}>
          <button
            ref={triggerRef}
            type="button"
            className="opacity-0 group-hover:opacity-100 focus:opacity-100 text-slate-500 hover:text-slate-300 px-1"
            onClick={() => setMenuOpen((o) => !o)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-label="Group actions"
          >
            ⋯
          </button>
          {menuOpen && (
            <div
              role="menu"
              className="absolute right-0 top-full mt-1 z-20 w-40 glass-panel rounded-lg py-1 text-xs"
            >
              <button
                type="button"
                role="menuitem"
                className="w-full text-left px-3 py-1.5 hover:bg-white/5 focus:bg-white/5 focus:outline-none"
                onClick={() => {
                  setMenuOpen(false);
                  triggerRef.current?.focus();
                  onEdit(node);
                }}
              >
                Edit
              </button>
              <button
                type="button"
                role="menuitem"
                className="w-full text-left px-3 py-1.5 hover:bg-white/5 focus:bg-white/5 focus:outline-none"
                onClick={() => {
                  setMenuOpen(false);
                  triggerRef.current?.focus();
                  onAddChild(node.group.id);
                }}
              >
                Add child
              </button>
              <button
                type="button"
                role="menuitem"
                aria-disabled={!isEmpty}
                className={`w-full text-left px-3 py-1.5 focus:bg-white/5 focus:outline-none ${
                  isEmpty ? 'text-red-400 hover:bg-red-500/10' : 'text-slate-600 cursor-not-allowed'
                }`}
                onClick={() => {
                  if (!isEmpty) return;
                  setMenuOpen(false);
                  triggerRef.current?.focus();
                  onDelete(node);
                }}
                title={isEmpty ? undefined : 'Group is not empty'}
              >
                Delete
              </button>
            </div>
          )}
        </div>
      </div>

      {expanded && (
        <div>
          {node.children.map((child, childIndex) => (
            <GroupNode
              key={child.group.id}
              node={child}
              selection={selection}
              expandedIds={expandedIds}
              forbiddenDropIds={forbiddenDropIds}
              onToggle={onToggle}
              onSelect={onSelect}
              onEdit={onEdit}
              onAddChild={onAddChild}
              onDelete={onDelete}
              posInSet={childIndex + 1}
              setSize={node.children.length}
            />
          ))}
        </div>
      )}
    </div>
  );
}
