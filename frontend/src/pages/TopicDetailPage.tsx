import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getTopicDetailFull } from '../api/topics';

export default function TopicDetailPage() {
  const { clusterId, topicName } = useParams<{
    clusterId: string;
    topicName: string;
  }>();

  const { data, isLoading } = useQuery({
    queryKey: ['topicDetailFull', clusterId, topicName],
    queryFn: () => getTopicDetailFull(clusterId!, topicName!),
    enabled: !!clusterId && !!topicName,
  });

  const partitions = data?.partitions ?? [];
  const totalMessages = partitions.reduce(
    (sum, p) => sum + (p.message_count ?? 0),
    0
  );

  return (
    <div className="max-w-7xl mx-auto px-6 py-10">
      {/* Breadcrumb */}
      <div className="mb-8 animate-fade-in-up">
        <div className="flex items-center gap-2 text-sm font-mono-data text-slate-500 mb-4">
          <Link to="/" className="hover:text-cyan-400 transition-colors">
            Clusters
          </Link>
          <span>/</span>
          <Link
            to={`/clusters/${clusterId}/topics`}
            className="hover:text-cyan-400 transition-colors"
          >
            Topics
          </Link>
          <span>/</span>
          <span className="text-amber-400">{topicName}</span>
          <span>/</span>
          <span className="text-slate-400">Detail</span>
        </div>
        <h1 className="font-display text-4xl font-bold text-gradient-amber">
          {topicName}
        </h1>
        <p className="text-slate-500 text-sm mt-1 font-mono-data">
          TOPIC DETAIL
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8 animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
        <div className="glass-panel rounded-2xl p-6">
          <div className="text-xs text-slate-500 uppercase tracking-wider font-mono-data mb-2">
            Total Partitions
          </div>
          <div className="text-3xl font-display font-bold text-cyan-400">
            {partitions.length}
          </div>
        </div>
        <div className="glass-panel rounded-2xl p-6">
          <div className="text-xs text-slate-500 uppercase tracking-wider font-mono-data mb-2">
            Total Messages
          </div>
          <div className="text-3xl font-display font-bold text-amber-400">
            {totalMessages.toLocaleString()}
          </div>
        </div>
      </div>

      {/* View Messages Button */}
      <div className="mb-6 animate-fade-in-up" style={{ animationDelay: '0.15s' }}>
        <Link
          to={`/clusters/${clusterId}/topics/${topicName}/messages`}
          className="btn-primary rounded-xl px-6 py-3 text-sm inline-flex items-center gap-2"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
            />
          </svg>
          View Messages
        </Link>
      </div>

      {/* Partitions Table */}
      <div className="glass-panel rounded-2xl overflow-hidden animate-fade-in-up" style={{ animationDelay: '0.2s' }}>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/5">
                <th className="text-left px-6 py-4 text-xs font-mono-data uppercase tracking-wider text-slate-500">
                  Partition
                </th>
                <th className="text-left px-6 py-4 text-xs font-mono-data uppercase tracking-wider text-slate-500">
                  Leader
                </th>
                <th className="text-left px-6 py-4 text-xs font-mono-data uppercase tracking-wider text-slate-500">
                  Replicas
                </th>
                <th className="text-left px-6 py-4 text-xs font-mono-data uppercase tracking-wider text-slate-500">
                  ISR
                </th>
                <th className="text-left px-6 py-4 text-xs font-mono-data uppercase tracking-wider text-slate-500">
                  Low Watermark
                </th>
                <th className="text-left px-6 py-4 text-xs font-mono-data uppercase tracking-wider text-slate-500">
                  High Watermark
                </th>
                <th className="text-left px-6 py-4 text-xs font-mono-data uppercase tracking-wider text-slate-500">
                  Message Count
                </th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="px-6 py-16 text-center">
                    <div className="flex items-center justify-center gap-3 text-slate-500 font-mono-data">
                      <div className="w-5 h-5 border-2 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin" />
                      FETCHING TOPIC DETAIL...
                    </div>
                  </td>
                </tr>
              ) : partitions.length > 0 ? (
                partitions.map((p, idx) => (
                  <tr
                    key={p.id}
                    className="data-row border-b border-white/[0.03] last:border-0"
                    style={{ animationDelay: `${0.05 + idx * 0.03}s` }}
                  >
                    <td className="px-6 py-4">
                      <span className="badge-cyan rounded-md px-2.5 py-1 text-xs font-mono-data">
                        {p.id}
                      </span>
                    </td>
                    <td className="px-6 py-4 font-mono-data text-slate-200 text-sm">
                      {p.leader}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-wrap gap-1">
                        {p.replicas.map((r) => (
                          <span
                            key={r}
                            className="inline-flex items-center rounded-md px-2 py-0.5 text-xs font-mono-data bg-slate-800/60 border border-white/5 text-slate-300"
                          >
                            {r}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-wrap gap-1">
                        {p.isr.map((r) => (
                          <span
                            key={r}
                            className="inline-flex items-center rounded-md px-2 py-0.5 text-xs font-mono-data bg-emerald-500/10 border border-emerald-500/20 text-emerald-400"
                          >
                            {r}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-6 py-4 font-mono-data text-slate-300 text-sm">
                      {p.low_watermark.toLocaleString()}
                    </td>
                    <td className="px-6 py-4 font-mono-data text-slate-300 text-sm">
                      {p.high_watermark.toLocaleString()}
                    </td>
                    <td className="px-6 py-4">
                      <span className="badge-amber rounded-md px-2.5 py-1 text-xs font-mono-data">
                        {p.message_count.toLocaleString()}
                      </span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="px-6 py-16 text-center">
                    <div className="text-slate-600 font-display text-lg mb-1">
                      No partitions found
                    </div>
                    <div className="text-slate-700 text-sm">
                      Check your cluster connection
                    </div>
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
