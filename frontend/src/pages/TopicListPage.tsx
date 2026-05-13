import { useQuery } from '@tanstack/react-query';
import { useParams, Link } from 'react-router-dom';
import { listTopics } from '../api/topics';

export default function TopicListPage() {
  const { clusterId } = useParams<{ clusterId: string }>();
  const { data: topics, isLoading } = useQuery({
    queryKey: ['topics', clusterId],
    queryFn: () => listTopics(clusterId!),
    enabled: !!clusterId,
  });

  if (isLoading) {
    return (
      <div className="max-w-7xl mx-auto px-6 py-12 flex items-center justify-center">
        <div className="flex items-center gap-3 text-slate-500 font-mono-data">
          <div className="w-5 h-5 border-2 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin" />
          FETCHING TOPICS...
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-6 py-10">
      {/* Breadcrumb */}
      <div className="mb-8 animate-fade-in-up">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-slate-500 hover:text-cyan-400 transition-colors text-sm font-mono-data mb-4"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Back to Clusters
        </Link>
        <h1 className="font-display text-4xl font-bold text-gradient-amber">
          Topics
        </h1>
        <p className="text-slate-500 text-sm mt-1 font-mono-data">
          CLUSTER: <span className="text-cyan-400">{clusterId?.slice(0, 8)}...</span>
        </p>
      </div>

      {/* Topics Table */}
      <div className="glass-panel rounded-2xl overflow-hidden animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
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
                <th className="text-right px-6 py-4 text-xs font-mono-data uppercase tracking-wider text-slate-500">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {topics && topics.length > 0 ? (
                topics.map((t, idx) => (
                  <tr
                    key={t.name}
                    className="data-row border-b border-white/[0.03] last:border-0"
                    style={{ animationDelay: `${0.15 + idx * 0.05}s` }}
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
                    <td className="px-6 py-4 text-right">
                      <Link
                        to={`/clusters/${clusterId}/topics/${t.name}/messages`}
                        className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-amber-400 transition-colors font-medium"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                        </svg>
                        Messages
                      </Link>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4} className="px-6 py-16 text-center">
                    <div className="text-slate-600 font-display text-lg mb-1">No topics found</div>
                    <div className="text-slate-700 text-sm">Check your cluster connection</div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
