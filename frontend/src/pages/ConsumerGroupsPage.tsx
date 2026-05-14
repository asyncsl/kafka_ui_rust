import { useState, Fragment } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { listConsumerGroups, getConsumerGroupLag } from '../api/consumerGroups';
import type { ConsumerGroupLag } from '../types';

function LagDetailPanel({
  clusterId,
  groupName,
  onClose,
}: {
  clusterId: string;
  groupName: string;
  onClose: () => void;
}) {
  const { data: lagData, isLoading } = useQuery({
    queryKey: ['consumerGroupLag', clusterId, groupName],
    queryFn: () => getConsumerGroupLag(clusterId, groupName),
  });

  return (
    <div className="bg-slate-900/40 border-y border-white/5">
      <div className="flex items-center justify-between px-6 py-3 border-b border-white/5">
        <span className="text-xs text-slate-500 font-mono-data uppercase tracking-wider">
          Lag Details — {groupName}
        </span>
        <button
          onClick={onClose}
          className="text-slate-500 hover:text-slate-300 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-8">
          <div className="flex items-center gap-3 text-slate-500 font-mono-data">
            <div className="w-5 h-5 border-2 border-amber-500/30 border-t-amber-500 rounded-full animate-spin" />
            FETCHING LAG...
          </div>
        </div>
      )}

      {lagData && lagData.length > 0 && (
        <div className="overflow-x-auto p-4">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/5">
                <th className="text-left px-4 py-3 text-xs font-mono-data uppercase tracking-wider text-slate-500">
                  Topic
                </th>
                <th className="text-left px-4 py-3 text-xs font-mono-data uppercase tracking-wider text-slate-500">
                  Partition
                </th>
                <th className="text-left px-4 py-3 text-xs font-mono-data uppercase tracking-wider text-slate-500">
                  Current Offset
                </th>
                <th className="text-left px-4 py-3 text-xs font-mono-data uppercase tracking-wider text-slate-500">
                  High Watermark
                </th>
                <th className="text-left px-4 py-3 text-xs font-mono-data uppercase tracking-wider text-slate-500">
                  Lag
                </th>
              </tr>
            </thead>
            <tbody>
              {lagData.map((lag: ConsumerGroupLag, idx: number) => (
                <tr key={`${lag.topic}-${lag.partition}-${idx}`} className="data-row border-b border-white/[0.03] last:border-0">
                  <td className="px-4 py-3 font-mono-data text-sm text-slate-300">
                    {lag.topic}
                  </td>
                  <td className="px-4 py-3">
                    <span className="badge-cyan rounded-md px-2 py-0.5 text-xs font-mono-data">
                      {lag.partition}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono-data text-sm text-slate-300">
                    {lag.current_offset}
                  </td>
                  <td className="px-4 py-3 font-mono-data text-sm text-slate-300">
                    {lag.high_watermark}
                  </td>
                  <td className="px-4 py-3 font-mono-data text-sm">
                    {lag.lag > 0 ? (
                      <span className="text-amber-400 font-semibold">{lag.lag}</span>
                    ) : (
                      <span className="text-emerald-400">{lag.lag}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {lagData && lagData.length === 0 && !isLoading && (
        <div className="py-8 text-center">
          <p className="text-slate-500 font-mono-data text-sm">No lag data available</p>
        </div>
      )}
    </div>
  );
}

export default function ConsumerGroupsPage() {
  const { clusterId } = useParams<{ clusterId: string }>();
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const {
    data: groups,
    isLoading,
    isFetching,
  } = useQuery({
    queryKey: ['consumerGroups', clusterId],
    queryFn: () => listConsumerGroups(clusterId!),
    enabled: !!clusterId,
  });

  const toggleRow = (groupName: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(groupName)) {
        next.delete(groupName);
      } else {
        next.add(groupName);
      }
      return next;
    });
  };

  return (
    <div className="max-w-7xl mx-auto px-6 py-10">
      {/* Breadcrumb */}
      <div className="mb-8 animate-fade-in-up">
        <div className="flex items-center gap-2 text-sm font-mono-data text-slate-500 mb-4">
          <Link to="/" className="hover:text-cyan-400 transition-colors">Clusters</Link>
          <span>/</span>
          <span className="text-cyan-400">{clusterId}</span>
          <span>/</span>
          <span className="text-amber-400">Consumer Groups</span>
        </div>
        <h1 className="font-display text-4xl font-bold text-gradient-amber">
          Consumer Groups
        </h1>
        <p className="text-slate-500 text-sm mt-1 font-mono-data">
          CLUSTER: <span className="text-cyan-400">{clusterId}</span>
        </p>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-16">
          <div className="flex items-center gap-3 text-slate-500 font-mono-data">
            <div className="w-5 h-5 border-2 border-amber-500/30 border-t-amber-500 rounded-full animate-spin" />
            LOADING GROUPS...
          </div>
        </div>
      )}

      {/* Groups Table */}
      {groups && groups.length > 0 && (
        <div className="glass-panel rounded-2xl overflow-hidden animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
          {/* Refreshing indicator */}
          <div className={`transition-all duration-200 overflow-hidden ${isFetching ? 'max-h-10 opacity-100' : 'max-h-0 opacity-0'}`}>
            <div className="px-6 py-2 border-b border-white/5 bg-amber-500/5">
              <div className="flex items-center gap-2 text-xs text-amber-400 font-mono-data">
                <div className="w-3 h-3 border-2 border-amber-500/30 border-t-amber-500 rounded-full animate-spin" />
                Refreshing groups...
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/5">
                  <th className="text-left px-6 py-4 text-xs font-mono-data uppercase tracking-wider text-slate-500">
                    Name
                  </th>
                  <th className="text-left px-6 py-4 text-xs font-mono-data uppercase tracking-wider text-slate-500">
                    State
                  </th>
                  <th className="text-left px-6 py-4 text-xs font-mono-data uppercase tracking-wider text-slate-500">
                    Protocol
                  </th>
                  <th className="text-left px-6 py-4 text-xs font-mono-data uppercase tracking-wider text-slate-500">
                    Members
                  </th>
                  <th className="text-left px-6 py-4 text-xs font-mono-data uppercase tracking-wider text-slate-500">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {groups.map((group) => {
                  const isExpanded = expandedRows.has(group.name);
                  return (
                    <Fragment key={group.name}>
                      <tr className="data-row border-b border-white/[0.03] last:border-0">
                        <td className="px-6 py-4 font-mono-data text-sm text-slate-200">
                          {group.name}
                        </td>
                        <td className="px-6 py-4">
                          <span
                            className={`rounded-md px-2 py-0.5 text-xs font-mono-data ${
                              group.state === 'Stable'
                                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                : group.state === 'Dead'
                                ? 'bg-red-500/10 text-red-400 border border-red-500/20'
                                : 'bg-slate-700/30 text-slate-400 border border-white/5'
                            }`}
                          >
                            {group.state}
                          </span>
                        </td>
                        <td className="px-6 py-4 font-mono-data text-sm text-slate-400">
                          {group.protocol}
                        </td>
                        <td className="px-6 py-4 font-mono-data text-sm text-slate-300">
                          {group.members}
                        </td>
                        <td className="px-6 py-4">
                          <button
                            onClick={() => toggleRow(group.name)}
                            className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-mono-data transition-all ${
                              isExpanded
                                ? 'bg-cyan-500/10 border border-cyan-500/20 text-cyan-400'
                                : 'bg-slate-800/50 border border-white/5 text-slate-400 hover:bg-cyan-500/10 hover:border-cyan-500/20 hover:text-cyan-400'
                            }`}
                          >
                            <svg
                              className={`w-3.5 h-3.5 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                              strokeWidth={2}
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                            </svg>
                            {isExpanded ? 'Hide Lag' : 'View Lag'}
                          </button>
                        </td>
                      </tr>
                      {isExpanded && clusterId && (
                        <tr>
                          <td colSpan={5} className="p-0">
                            <LagDetailPanel
                              clusterId={clusterId}
                              groupName={group.name}
                              onClose={() => toggleRow(group.name)}
                            />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Empty State */}
      {groups && groups.length === 0 && !isLoading && (
        <div className="glass-panel rounded-2xl p-16 text-center animate-fade-in-up">
          <div className="w-16 h-16 rounded-2xl bg-slate-800/50 border border-white/5 flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
          </div>
          <p className="text-slate-500 font-display text-lg mb-1">No consumer groups found</p>
          <p className="text-slate-600 text-sm">There are no consumer groups for this cluster</p>
        </div>
      )}
    </div>
  );
}
