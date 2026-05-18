import { Link } from 'react-router-dom';
import { useDraggable } from '@dnd-kit/core';
import { useState } from 'react';
import type { Cluster } from '../../types';

interface Props {
  cluster: Cluster;
  onDelete: (id: string) => void;
  onUpdate?: (id: string, data: { name: string; bootstrap_servers: string }) => void;
  /** Animation delay in seconds (optional). */
  animationDelay?: number;
}

export default function ClusterCard({ cluster, onDelete, onUpdate, animationDelay = 0 }: Props) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `cluster:${cluster.id}`,
    data: { kind: 'cluster', label: cluster.name, sourceId: cluster.id },
  });

  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(cluster.name);
  const [editBootstrap, setEditBootstrap] = useState(cluster.bootstrap_servers);

  const handleSave = () => {
    const name = editName.trim();
    const bootstrap = editBootstrap.trim();
    if (!name || !bootstrap) return;
    onUpdate?.(cluster.id, { name, bootstrap_servers: bootstrap });
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditName(cluster.name);
    setEditBootstrap(cluster.bootstrap_servers);
    setIsEditing(false);
  };

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={`glass-panel rounded-2xl p-6 glow-border group animate-fade-in-up h-full flex flex-col ${isDragging ? 'opacity-40' : ''}`}
      style={{
        animationDelay: `${animationDelay}s`,
        transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
      }}
    >
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500/20 to-orange-600/10 border border-amber-500/20 flex items-center justify-center flex-shrink-0">
            <svg className="w-5 h-5 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
            </svg>
          </div>
          <div className="min-w-0">
            <h3
              className="font-display text-lg font-semibold text-slate-100 group-hover:text-amber-400 transition-colors truncate"
              title={cluster.name}
            >
              {cluster.name}
            </h3>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse flex-shrink-0" />
              <span className="text-xs text-slate-500 font-mono-data">ACTIVE</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            className="rounded-lg px-3 py-1.5 text-xs opacity-0 group-hover:opacity-100 transition-opacity text-slate-400 hover:text-amber-400 hover:bg-amber-500/10"
            onClick={() => setIsEditing(true)}
          >
            Edit
          </button>
          <button
            className="btn-danger rounded-lg px-3 py-1.5 text-xs opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={() => onDelete(cluster.id)}
          >
            Delete
          </button>
        </div>
      </div>

      {isEditing ? (
        <div className="flex flex-col gap-3 mb-5">
          <input
            autoFocus
            className="terminal-input rounded-xl px-3 py-2 text-sm"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); }}
          />
          <input
            className="terminal-input rounded-xl px-3 py-2 text-sm"
            value={editBootstrap}
            onChange={(e) => setEditBootstrap(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); }}
          />
          <div className="flex gap-2">
            <button
              type="button"
              className="btn-primary rounded-lg px-3 py-1.5 text-xs flex-1"
              onClick={handleSave}
              disabled={!editName.trim() || !editBootstrap.trim()}
            >
              Save
            </button>
            <button
              type="button"
              className="px-3 py-1.5 rounded-lg text-xs text-slate-400 hover:bg-white/5"
              onClick={handleCancel}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="mb-5">
          <div className="text-xs text-slate-500 mb-1 font-mono-data uppercase tracking-wider">
            Bootstrap Servers
          </div>
          <div
            className="font-mono-data text-sm text-cyan-400 bg-cyan-500/5 border border-cyan-500/10 rounded-lg px-3 py-2 truncate"
            title={cluster.bootstrap_servers}
          >
            {cluster.bootstrap_servers}
          </div>
        </div>
      )}

      <Link
        to={`/clusters/${cluster.id}/topics`}
        className="mt-auto block w-full text-center py-2.5 rounded-xl bg-slate-800/50 border border-white/5 text-slate-300 text-sm font-medium hover:bg-cyan-500/10 hover:border-cyan-500/20 hover:text-cyan-400 transition-all"
      >
        Browse Topics →
      </Link>
    </div>
  );
}
