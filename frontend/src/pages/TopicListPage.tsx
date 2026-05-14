import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, Link } from 'react-router-dom';
import { listTopics, getTopicCounts, createTopic, deleteTopic } from '../api/topics';

export default function TopicListPage() {
  const { clusterId } = useParams<{ clusterId: string }>();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const perPage = 20;
  const queryClient = useQueryClient();

  // Create topic modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createPartitions, setCreatePartitions] = useState(1);
  const [createReplication, setCreateReplication] = useState(1);

  // Delete confirmation state
  const [deletingTopic, setDeletingTopic] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: () =>
      createTopic(clusterId!, {
        name: createName,
        partition_count: createPartitions,
        replication_factor: createReplication,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['topics', clusterId] });
      setShowCreateModal(false);
      setCreateName('');
      setCreatePartitions(1);
      setCreateReplication(1);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (topicName: string) => deleteTopic(clusterId!, topicName),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['topics', clusterId] });
      setDeletingTopic(null);
    },
  });

  const { data: response, isLoading } = useQuery({
    queryKey: ['topics', clusterId, search, page, perPage],
    queryFn: () =>
      listTopics(clusterId!, {
        search: search || undefined,
        page,
        per_page: perPage,
      }),
    enabled: !!clusterId,
  });

  const topics = response?.topics ?? [];
  const total = response?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / perPage));

  // Fetch message counts asynchronously after topics load
  const topicNames = topics.map((t) => t.name);
  const { data: countsData, isLoading: countsLoading } = useQuery({
    queryKey: ['topicCounts', clusterId, topicNames],
    queryFn: () => getTopicCounts(clusterId!, topicNames),
    enabled: !!clusterId && topicNames.length > 0,
  });
  const counts = countsData?.counts ?? {};

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
  };

  const formatCount = (n: number) => {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return n.toString();
  };

  return (
    <div className="max-w-7xl mx-auto px-6 py-10">
      {/* Breadcrumb */}
      <div className="mb-8">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-slate-500 hover:text-cyan-400 transition-colors text-sm font-mono-data mb-4"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Back to Clusters
        </Link>
        <h1 className="font-display text-4xl font-bold text-gradient-amber">Topics</h1>
        <p className="text-slate-500 text-sm mt-1 font-mono-data">
          CLUSTER: <span className="text-cyan-400">{clusterId?.slice(0, 8)}...</span>
        </p>
      </div>

      {/* Search & Create */}
      <form onSubmit={handleSearch} className="mb-6">
        <div className="flex gap-3">
          <div className="relative flex-1">
            <svg
              className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
            <input
              type="text"
              placeholder="Search topics..."
              className="terminal-input w-full rounded-xl pl-11 pr-4 py-3 text-sm"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <button type="submit" className="btn-primary rounded-xl px-6 py-3 text-sm">
            Search
          </button>
          <button
            type="button"
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-medium bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20 hover:border-emerald-500/30 transition-all"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Create Topic
          </button>
        </div>
      </form>

      {/* Topics Table */}
      <div className="glass-panel rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/5">
                <th className="text-left px-6 py-4 text-xs font-mono-data uppercase tracking-wider text-slate-500">
                  Topic Name
                </th>
                <th className="text-left px-6 py-4 text-xs font-mono-data uppercase tracking-wider text-slate-500">
                  Partitions
                </th>
                <th className="text-left px-6 py-4 text-xs font-mono-data uppercase tracking-wider text-slate-500">
                  Replication
                </th>
                <th className="text-left px-6 py-4 text-xs font-mono-data uppercase tracking-wider text-slate-500">
                  Messages
                </th>
                <th className="text-right px-6 py-4 text-xs font-mono-data uppercase tracking-wider text-slate-500">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody key={`topics-page-${page}-${search}`}>
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-16 text-center">
                    <div className="flex items-center justify-center gap-3 text-slate-500 font-mono-data">
                      <div className="w-5 h-5 border-2 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin" />
                      FETCHING TOPICS...
                    </div>
                  </td>
                </tr>
              ) : topics.length > 0 ? (
                topics.map((t, idx) => (
                  <tr
                    key={t.name}
                    className="data-row border-b border-white/[0.03] last:border-0 animate-fade-in-up"
                    style={{ animationDelay: `${0.05 + idx * 0.03}s` }}
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center">
                          <svg className="w-4 h-4 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                          </svg>
                        </div>
                        <span className="font-mono-data text-slate-200">{t.name}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="badge-cyan rounded-md px-2.5 py-1 text-xs font-mono-data">
                        {t.partition_count}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="badge-amber rounded-md px-2.5 py-1 text-xs font-mono-data">
                        {t.replication_factor}x
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="badge-green rounded-md px-2.5 py-1 text-xs font-mono-data inline-block min-w-[3rem] text-center">
                        {countsLoading ? (
                          <span className="inline-block w-4 h-3 bg-emerald-400/30 rounded animate-pulse" />
                        ) : (
                          formatCount(counts[t.name] ?? t.message_count)
                        )}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-3">
                        <Link
                          to={`/clusters/${clusterId}/topics/${t.name}/detail`}
                          className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-cyan-400 transition-colors font-medium"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          Detail
                        </Link>
                        <Link
                          to={`/clusters/${clusterId}/topics/${t.name}/messages`}
                          className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-amber-400 transition-colors font-medium"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                          </svg>
                          Messages
                        </Link>
                        {deletingTopic === t.name ? (
                          <span className="inline-flex items-center gap-2">
                            <span className="text-xs text-slate-500">Confirm?</span>
                            <button
                              onClick={() => deleteMutation.mutate(t.name)}
                              className="text-xs px-2 py-1 rounded bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 transition-colors"
                            >
                              Yes
                            </button>
                            <button
                              onClick={() => setDeletingTopic(null)}
                              className="text-xs px-2 py-1 rounded bg-slate-800/50 border border-white/5 text-slate-400 hover:bg-slate-700/50 transition-colors"
                            >
                              No
                            </button>
                          </span>
                        ) : (
                          <button
                            onClick={() => setDeletingTopic(t.name)}
                            className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-red-400 transition-colors font-medium"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                            Delete
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="px-6 py-16 text-center">
                    <div className="text-slate-600 font-display text-lg mb-1">No topics found</div>
                    <div className="text-slate-700 text-sm">
                      {search ? 'Try a different search term' : 'Check your cluster connection'}
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

      {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-6 py-4 border-t border-white/5 flex items-center justify-between">
            <span className="text-xs text-slate-500 font-mono-data">
              {total} topics · Page {page} of {totalPages}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  page <= 1
                    ? 'bg-slate-800/30 text-slate-600 cursor-not-allowed'
                    : 'bg-slate-800/50 border border-white/5 text-slate-300 hover:bg-cyan-500/10 hover:border-cyan-500/20 hover:text-cyan-400'
                }`}
              >
                Previous
              </button>
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let p: number;
                if (totalPages <= 5) {
                  p = i + 1;
                } else if (page <= 3) {
                  p = i + 1;
                } else if (page >= totalPages - 2) {
                  p = totalPages - 4 + i;
                } else {
                  p = page - 2 + i;
                }
                return (
                  <button
                    key={p}
                    onClick={() => setPage(p)}
                    className={`w-9 h-9 rounded-lg text-sm font-medium transition-all ${
                      p === page
                        ? 'bg-cyan-500/20 border border-cyan-500/30 text-cyan-400'
                        : 'bg-slate-800/50 border border-white/5 text-slate-400 hover:bg-slate-700/50'
                    }`}
                  >
                    {p}
                  </button>
                );
              })}
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  page >= totalPages
                    ? 'bg-slate-800/30 text-slate-600 cursor-not-allowed'
                    : 'bg-slate-800/50 border border-white/5 text-slate-300 hover:bg-cyan-500/10 hover:border-cyan-500/20 hover:text-cyan-400'
                }`}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Create Topic Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setShowCreateModal(false)}
          />
          <div className="relative glass-panel rounded-2xl p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-6">
              <h2 className="font-display text-xl font-semibold text-slate-200">Create Topic</h2>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-slate-500 hover:text-slate-300 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs text-slate-500 mb-2 font-mono-data uppercase tracking-wider">
                  Topic Name
                </label>
                <input
                  type="text"
                  className="terminal-input w-full rounded-xl px-4 py-3 text-sm"
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  placeholder="my-topic"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-2 font-mono-data uppercase tracking-wider">
                  Partition Count
                </label>
                <input
                  type="number"
                  min={1}
                  className="terminal-input w-full rounded-xl px-4 py-3 text-sm"
                  value={createPartitions}
                  onChange={(e) => setCreatePartitions(Math.max(1, Number(e.target.value)))}
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-2 font-mono-data uppercase tracking-wider">
                  Replication Factor
                </label>
                <input
                  type="number"
                  min={1}
                  className="terminal-input w-full rounded-xl px-4 py-3 text-sm"
                  value={createReplication}
                  onChange={(e) => setCreateReplication(Math.max(1, Number(e.target.value)))}
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 mt-6">
              <button
                onClick={() => setShowCreateModal(false)}
                className="px-5 py-2.5 rounded-xl text-sm font-medium text-slate-400 hover:text-slate-200 bg-slate-800/50 border border-white/5 hover:bg-slate-700/50 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={() => createMutation.mutate()}
                disabled={!createName.trim() || createMutation.isPending}
                className={`px-5 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  !createName.trim() || createMutation.isPending
                    ? 'bg-emerald-500/10 text-emerald-500/50 cursor-not-allowed'
                    : 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20 hover:border-emerald-500/30'
                }`}
              >
                {createMutation.isPending ? (
                  <span className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin" />
                    Creating...
                  </span>
                ) : (
                  'Create'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
