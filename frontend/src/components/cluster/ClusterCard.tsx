import { Link } from 'react-router-dom';
import type { Cluster } from '../../types';

interface Props {
  cluster: Cluster;
  onDelete: (id: string) => void;
  /** Animation delay in seconds (optional). */
  animationDelay?: number;
}

export default function ClusterCard({ cluster, onDelete, animationDelay = 0 }: Props) {
  return (
    <div
      className="glass-panel rounded-2xl p-6 glow-border group animate-fade-in-up"
      style={{ animationDelay: `${animationDelay}s` }}
    >
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500/20 to-orange-600/10 border border-amber-500/20 flex items-center justify-center">
            <svg className="w-5 h-5 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
            </svg>
          </div>
          <div>
            <h3 className="font-display text-lg font-semibold text-slate-100 group-hover:text-amber-400 transition-colors">
              {cluster.name}
            </h3>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-xs text-slate-500 font-mono-data">ACTIVE</span>
            </div>
          </div>
        </div>
        <button
          className="btn-danger rounded-lg px-3 py-1.5 text-xs opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={() => onDelete(cluster.id)}
        >
          Delete
        </button>
      </div>

      <div className="mb-5">
        <div className="text-xs text-slate-500 mb-1 font-mono-data uppercase tracking-wider">
          Bootstrap Servers
        </div>
        <div className="font-mono-data text-sm text-cyan-400 bg-cyan-500/5 border border-cyan-500/10 rounded-lg px-3 py-2">
          {cluster.bootstrap_servers}
        </div>
      </div>

      <Link
        to={`/clusters/${cluster.id}/topics`}
        className="block w-full text-center py-2.5 rounded-xl bg-slate-800/50 border border-white/5 text-slate-300 text-sm font-medium hover:bg-cyan-500/10 hover:border-cyan-500/20 hover:text-cyan-400 transition-all"
      >
        Browse Topics →
      </Link>
    </div>
  );
}
