import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getTopic, fetchMessages } from '../api/topics';

type OffsetMode = 'latest' | 'earliest' | 'custom';

export default function MessagePage() {
  const { clusterId, topicName } = useParams<{
    clusterId: string;
    topicName: string;
  }>();

  const [partition, setPartition] = useState<number>(-1);
  const [offsetMode, setOffsetMode] = useState<OffsetMode>('latest');
  const [customOffset, setCustomOffset] = useState<number>(0);
  const [limit, setLimit] = useState<number>(100);

  const offset = offsetMode === 'latest' ? -1 : offsetMode === 'earliest' ? -2 : customOffset;

  const { data: topic } = useQuery({
    queryKey: ['topic', clusterId, topicName],
    queryFn: () => getTopic(clusterId!, topicName!),
    enabled: !!clusterId && !!topicName,
  });

  const {
    data: messages,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ['messages', clusterId, topicName, partition, offset, limit],
    queryFn: () =>
      fetchMessages(clusterId!, topicName!, {
        partition,
        offset,
        limit,
      }),
    enabled: false,
  });

  // Auto-fetch on mount or when params change via refetch button
  useEffect(() => {
    if (clusterId && topicName) {
      const timer = setTimeout(() => refetch(), 100);
      return () => clearTimeout(timer);
    }
  }, [clusterId, topicName]);

  return (
    <div className="max-w-7xl mx-auto px-6 py-10">
      {/* Breadcrumb */}
      <div className="mb-8 animate-fade-in-up">
        <div className="flex items-center gap-2 text-sm font-mono-data text-slate-500 mb-4">
          <Link to="/" className="hover:text-cyan-400 transition-colors">Clusters</Link>
          <span>/</span>
          <Link to={`/clusters/${clusterId}/topics`} className="hover:text-cyan-400 transition-colors">Topics</Link>
          <span>/</span>
          <span className="text-amber-400">{topicName}</span>
        </div>
        <h1 className="font-display text-4xl font-bold text-gradient-amber">
          Messages
        </h1>
        <p className="text-slate-500 text-sm mt-1 font-mono-data">
          TOPIC: <span className="text-cyan-400">{topicName}</span>
        </p>
      </div>

      {/* Control Panel */}
      <div className="glass-panel rounded-2xl p-6 mb-8 glow-border animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
        <div className="flex items-center gap-2 mb-5">
          <div className="w-1 h-5 bg-gradient-to-b from-cyan-500 to-blue-600 rounded-full" />
          <h2 className="font-display text-lg font-semibold text-slate-200">
            Fetch Parameters
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 items-end">
          {/* Partition */}
          <div>
            <label className="block text-xs text-slate-500 mb-2 font-mono-data uppercase tracking-wider">
              Partition
            </label>
            <select
              className="terminal-input w-full rounded-xl px-4 py-3 text-sm appearance-none cursor-pointer"
              value={partition}
              onChange={(e) => setPartition(Number(e.target.value))}
              style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%2364748b'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center', backgroundSize: '16px' }}
            >
              <option value={-1} className="bg-[#0a0e17] text-slate-200">All Partitions</option>
              {topic?.partitions.map((p) => (
                <option key={p.id} value={p.id} className="bg-[#0a0e17] text-slate-200">
                  Partition {p.id}
                </option>
              )) || (
                <option value={0} className="bg-[#0a0e17]">Partition 0</option>
              )}
            </select>
          </div>

          {/* Offset Mode */}
          <div>
            <label className="block text-xs text-slate-500 mb-2 font-mono-data uppercase tracking-wider">
              Offset
            </label>
            <select
              className="terminal-input w-full rounded-xl px-4 py-3 text-sm appearance-none cursor-pointer"
              value={offsetMode}
              onChange={(e) => setOffsetMode(e.target.value as OffsetMode)}
              style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%2364748b'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center', backgroundSize: '16px' }}
            >
              <option value="latest" className="bg-[#0a0e17] text-slate-200">Newest</option>
              <option value="earliest" className="bg-[#0a0e17] text-slate-200">Oldest</option>
              <option value="custom" className="bg-[#0a0e17] text-slate-200">Custom</option>
            </select>
          </div>

          {/* Custom Offset */}
          {offsetMode === 'custom' && (
            <div>
              <label className="block text-xs text-slate-500 mb-2 font-mono-data uppercase tracking-wider">
                Custom Offset
              </label>
              <input
                className="terminal-input w-full rounded-xl px-4 py-3 text-sm"
                type="number"
                value={customOffset}
                onChange={(e) => setCustomOffset(Number(e.target.value))}
              />
            </div>
          )}

          {/* Limit */}
          <div>
            <label className="block text-xs text-slate-500 mb-2 font-mono-data uppercase tracking-wider">
              Limit
            </label>
            <input
              className="terminal-input w-full rounded-xl px-4 py-3 text-sm"
              type="number"
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value))}
            />
          </div>

          {/* Fetch Button */}
          <button
            className="btn-primary rounded-xl px-6 py-3 text-sm"
            onClick={() => refetch()}
          >
            <span className="relative z-10 flex items-center justify-center gap-2">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Fetch Messages
            </span>
          </button>
        </div>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-16">
          <div className="flex items-center gap-3 text-slate-500 font-mono-data">
            <div className="w-5 h-5 border-2 border-amber-500/30 border-t-amber-500 rounded-full animate-spin" />
            POLLING MESSAGES...
          </div>
        </div>
      )}

      {/* Messages Table */}
      {(messages && messages.length > 0) && (
        <div className="glass-panel rounded-2xl overflow-hidden animate-fade-in-up" style={{ animationDelay: '0.2s' }}>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/5">
                  <th className="text-left px-6 py-4 text-xs font-mono-data uppercase tracking-wider text-slate-500">
                    Partition
                  </th>
                  <th className="text-left px-6 py-4 text-xs font-mono-data uppercase tracking-wider text-slate-500">
                    Offset
                  </th>
                  <th className="text-left px-6 py-4 text-xs font-mono-data uppercase tracking-wider text-slate-500">
                    Key
                  </th>
                  <th className="text-left px-6 py-4 text-xs font-mono-data uppercase tracking-wider text-slate-500">
                    Value
                  </th>
                  <th className="text-left px-6 py-4 text-xs font-mono-data uppercase tracking-wider text-slate-500">
                    Timestamp
                  </th>
                </tr>
              </thead>
              <tbody>
                {messages.map((m) => (
                  <tr
                    key={`${m.partition}-${m.offset}`}
                    className="data-row border-b border-white/[0.03] last:border-0"
                  >
                    <td className="px-6 py-4">
                      <span className="badge-cyan rounded-md px-2 py-0.5 text-xs font-mono-data">
                        {m.partition}
                      </span>
                    </td>
                    <td className="px-6 py-4 font-mono-data text-slate-300 text-sm">
                      {m.offset}
                    </td>
                    <td className="px-6 py-4">
                      <span className="font-mono-data text-sm text-amber-400/80 max-w-[200px] truncate block">
                        {m.key ?? (
                          <span className="text-slate-600 italic">null</span>
                        )}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="font-mono-data text-sm text-slate-300 max-w-md truncate block" title={m.value ?? undefined}>
                        {m.value ?? (
                          <span className="text-slate-600 italic">null</span>
                        )}
                      </span>
                    </td>
                    <td className="px-6 py-4 font-mono-data text-xs text-slate-500">
                      {m.timestamp ? new Date(m.timestamp).toLocaleString() : (
                        <span className="text-slate-600">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Empty State */}
      {messages && messages.length === 0 && !isLoading && (
        <div className="glass-panel rounded-2xl p-16 text-center animate-fade-in-up">
          <div className="w-16 h-16 rounded-2xl bg-slate-800/50 border border-white/5 flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
          </div>
          <p className="text-slate-500 font-display text-lg mb-1">No messages found</p>
          <p className="text-slate-600 text-sm">Adjust offset or fetch from a different partition</p>
        </div>
      )}
    </div>
  );
}
