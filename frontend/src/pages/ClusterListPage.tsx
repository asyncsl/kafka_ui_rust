import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { listClusters, createCluster, deleteCluster } from '../api/clusters';

export default function ClusterListPage() {
  const queryClient = useQueryClient();
  const { data: clusters, isLoading } = useQuery({
    queryKey: ['clusters'],
    queryFn: listClusters,
  });

  const [name, setName] = useState('');
  const [bootstrapServers, setBootstrapServers] = useState('');

  const createMutation = useMutation({
    mutationFn: createCluster,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clusters'] });
      setName('');
      setBootstrapServers('');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteCluster,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clusters'] });
    },
  });

  if (isLoading) {
    return (
      <div className="max-w-7xl mx-auto px-6 py-12 flex items-center justify-center">
        <div className="flex items-center gap-3 text-slate-500 font-mono-data">
          <div className="w-5 h-5 border-2 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin" />
          INITIALIZING...
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-6 py-10">
      {/* Header */}
      <div className="mb-10 animate-fade-in-up">
        <h1 className="font-display text-4xl font-bold text-gradient-amber mb-2">
          Clusters
        </h1>
        <p className="text-slate-500 text-sm">
          Manage your Kafka cluster connections
        </p>
      </div>

      {/* Add Cluster Card */}
      <div className="glass-panel rounded-2xl p-6 mb-8 glow-border animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
        <div className="flex items-center gap-2 mb-5">
          <div className="w-1 h-5 bg-gradient-to-b from-amber-500 to-orange-600 rounded-full" />
          <h2 className="font-display text-lg font-semibold text-slate-200">
            Add New Cluster
          </h2>
        </div>
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            className="terminal-input rounded-xl px-4 py-3 text-sm flex-1"
            placeholder="Cluster name..."
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <input
            className="terminal-input rounded-xl px-4 py-3 text-sm flex-[2]"
            placeholder="localhost:9092"
            value={bootstrapServers}
            onChange={(e) => setBootstrapServers(e.target.value)}
          />
          <button
            className="btn-primary rounded-xl px-6 py-3 text-sm whitespace-nowrap"
            onClick={() =>
              createMutation.mutate({ name, bootstrap_servers: bootstrapServers })
            }
          >
            <span className="relative z-10 flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              Connect
            </span>
          </button>
        </div>
      </div>

      {/* Cluster Grid */}
      {clusters && clusters.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {clusters.map((c, idx) => (
            <div
              key={c.id}
              className="glass-panel rounded-2xl p-6 glow-border group animate-fade-in-up"
              style={{ animationDelay: `${0.15 + idx * 0.08}s` }}
            >
              {/* Card Header */}
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500/20 to-orange-600/10 border border-amber-500/20 flex items-center justify-center">
                    <svg className="w-5 h-5 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="font-display text-lg font-semibold text-slate-100 group-hover:text-amber-400 transition-colors">
                      {c.name}
                    </h3>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      <span className="text-xs text-slate-500 font-mono-data">ACTIVE</span>
                    </div>
                  </div>
                </div>
                <button
                  className="btn-danger rounded-lg px-3 py-1.5 text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={() => deleteMutation.mutate(c.id)}
                >
                  Delete
                </button>
              </div>

              {/* Address */}
              <div className="mb-5">
                <div className="text-xs text-slate-500 mb-1 font-mono-data uppercase tracking-wider">
                  Bootstrap Servers
                </div>
                <div className="font-mono-data text-sm text-cyan-400 bg-cyan-500/5 border border-cyan-500/10 rounded-lg px-3 py-2">
                  {c.bootstrap_servers}
                </div>
              </div>

              {/* Actions */}
              <Link
                to={`/clusters/${c.id}/topics`}
                className="block w-full text-center py-2.5 rounded-xl bg-slate-800/50 border border-white/5 text-slate-300 text-sm font-medium hover:bg-cyan-500/10 hover:border-cyan-500/20 hover:text-cyan-400 transition-all"
              >
                Browse Topics →
              </Link>
            </div>
          ))}
        </div>
      ) : (
        <div className="glass-panel rounded-2xl p-16 text-center animate-fade-in-up">
          <div className="w-16 h-16 rounded-2xl bg-slate-800/50 border border-white/5 flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
            </svg>
          </div>
          <p className="text-slate-500 font-display text-lg mb-1">No clusters connected</p>
          <p className="text-slate-600 text-sm">Add a cluster above to get started</p>
        </div>
      )}
    </div>
  );
}
