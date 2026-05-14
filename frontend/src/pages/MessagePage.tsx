import { useState, useEffect, useMemo, useRef, Fragment } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { flushSync } from 'react-dom';
import { getTopic, fetchMessages, produceMessage } from '../api/topics';

type OffsetMode = 'latest' | 'earliest' | 'custom';

interface MessageRecord {
  partition: number;
  offset: number;
  key: string | null;
  value: string | null;
  timestamp: number | null;
}

function highlightJson(value: string | null): React.ReactNode {
  if (!value) return <span className="text-slate-500 italic">null</span>;

  let formatted: string;
  try {
    formatted = JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return <span className="text-slate-300">{value}</span>;
  }

  const tokens: Array<{ type: string; text: string }> = [];
  let i = 0;
  while (i < formatted.length) {
    // String literal
    if (formatted[i] === '"') {
      let j = i + 1;
      while (j < formatted.length) {
        if (formatted[j] === '\\') {
          j += 2;
        } else if (formatted[j] === '"') {
          j++;
          break;
        } else {
          j++;
        }
      }
      tokens.push({ type: 'string', text: formatted.slice(i, j) });
      i = j;
      continue;
    }
    // Number
    if (/[\d-]/.test(formatted[i])) {
      const match = formatted.slice(i).match(/^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/);
      if (match) {
        tokens.push({ type: 'number', text: match[0] });
        i += match[0].length;
        continue;
      }
    }
    // true, false, null
    const wordMatch = formatted.slice(i).match(/^(true|false|null)\b/);
    if (wordMatch) {
      tokens.push({ type: wordMatch[0] === 'null' ? 'null' : 'boolean', text: wordMatch[0] });
      i += wordMatch[0].length;
      continue;
    }
    // Punctuation
    if (/[{}\[\],:]/.test(formatted[i])) {
      tokens.push({ type: 'punct', text: formatted[i] });
      i++;
      continue;
    }
    // Whitespace
    if (/\s/.test(formatted[i])) {
      let j = i;
      while (j < formatted.length && /\s/.test(formatted[j])) j++;
      tokens.push({ type: 'ws', text: formatted.slice(i, j) });
      i = j;
      continue;
    }
    tokens.push({ type: 'other', text: formatted[i] });
    i++;
  }

  // Mark strings that are object keys
  for (let k = 0; k < tokens.length; k++) {
    if (tokens[k].type === 'string') {
      let next = k + 1;
      while (next < tokens.length && tokens[next].type === 'ws') next++;
      if (next < tokens.length && tokens[next].text === ':') {
        tokens[k].type = 'key';
      }
    }
  }

  return tokens.map((tok, idx) => {
    switch (tok.type) {
      case 'key':
        return <span key={idx} className="text-cyan-400">{tok.text}</span>;
      case 'string':
        return <span key={idx} className="text-amber-400">{tok.text}</span>;
      case 'number':
        return <span key={idx} className="text-purple-400">{tok.text}</span>;
      case 'boolean':
        return <span key={idx} className="text-green-400">{tok.text}</span>;
      case 'null':
        return <span key={idx} className="text-slate-500">{tok.text}</span>;
      case 'punct':
        return <span key={idx} className="text-slate-400">{tok.text}</span>;
      case 'ws':
        return <span key={idx}>{tok.text}</span>;
      default:
        return <span key={idx} className="text-slate-300">{tok.text}</span>;
    }
  });
}

function MessageDetailPanel({
  message,
  onClose,
}: {
  message: MessageRecord;
  onClose: () => void;
}) {
  return (
    <div className="bg-slate-900/40 border-y border-white/5">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-white/5">
        <span className="text-xs text-slate-500 font-mono-data uppercase tracking-wider">
          Message Details
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

      <div className="p-6 space-y-4">
        {/* Meta */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-slate-800/40 rounded-lg px-3 py-2 border border-white/5">
            <div className="text-[10px] text-slate-500 uppercase tracking-wider font-mono-data">Partition</div>
            <div className="text-sm text-cyan-400 font-mono-data">{message.partition}</div>
          </div>
          <div className="bg-slate-800/40 rounded-lg px-3 py-2 border border-white/5">
            <div className="text-[10px] text-slate-500 uppercase tracking-wider font-mono-data">Offset</div>
            <div className="text-sm text-slate-200 font-mono-data">{message.offset}</div>
          </div>
          <div className="bg-slate-800/40 rounded-lg px-3 py-2 border border-white/5">
            <div className="text-[10px] text-slate-500 uppercase tracking-wider font-mono-data">Timestamp</div>
            <div className="text-sm text-slate-200 font-mono-data">
              {message.timestamp ? new Date(message.timestamp).toLocaleString() : '—'}
            </div>
          </div>
          <div className="bg-slate-800/40 rounded-lg px-3 py-2 border border-white/5">
            <div className="text-[10px] text-slate-500 uppercase tracking-wider font-mono-data">Key</div>
            <div className="text-sm text-amber-400/80 font-mono-data truncate">{message.key ?? 'null'}</div>
          </div>
        </div>

        {/* Key */}
        <div>
          <div className="text-xs text-slate-500 uppercase tracking-wider font-mono-data mb-2">Key</div>
          <pre className="bg-black/40 rounded-xl p-4 text-sm font-mono-data text-amber-400/90 overflow-x-auto border border-white/5">
            {message.key ?? 'null'}
          </pre>
        </div>

        {/* Value with syntax highlighting */}
        <div>
          <div className="text-xs text-slate-500 uppercase tracking-wider font-mono-data mb-2">Value</div>
          <pre className="bg-black/40 rounded-xl p-4 text-sm font-mono-data overflow-x-auto border border-white/5 leading-relaxed">
            {highlightJson(message.value)}
          </pre>
        </div>
      </div>
    </div>
  );
}

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

  // Cursor-based pagination for All Partitions mode
  const [page, setPage] = useState(0);
  const [cursorHistory, setCursorHistory] = useState<Record<number, number>[]>([]);

  // Animation key — increments once per completed fetch to trigger tbody remount
  const [animKey, setAnimKey] = useState(0);

  // Track the mode used for the actual fetch (so paging works after offsetMode becomes 'custom')
  const [fetchMode, setFetchMode] = useState<OffsetMode>('latest');

  const isAllPartitions = partition === -1;
  const isNewest = fetchMode === 'latest';
  const seekOffsets = isAllPartitions && page > 0 ? cursorHistory[page - 1] : undefined;
  const seekDirection = isAllPartitions && page > 0
    ? (isNewest ? 'before' : 'after')
    : undefined;

  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  // Produce Message modal state
  const [isProduceOpen, setIsProduceOpen] = useState(false);
  const [producePartition, setProducePartition] = useState<string>('');
  const [produceKey, setProduceKey] = useState('');
  const [produceValue, setProduceValue] = useState('');
  const [produceError, setProduceError] = useState<string | null>(null);
  const [produceSuccess, setProduceSuccess] = useState(false);

  const { data: topic } = useQuery({
    queryKey: ['topic', clusterId, topicName],
    queryFn: () => getTopic(clusterId!, topicName!),
    enabled: !!clusterId && !!topicName,
  });

  const produceMutation = useMutation({
    mutationFn: () =>
      produceMessage(clusterId!, topicName!, {
        partition: producePartition ? Number(producePartition) : undefined,
        key: produceKey || undefined,
        value: produceValue,
      }),
    onSuccess: () => {
      setProduceSuccess(true);
      setProduceError(null);
      setTimeout(() => {
        setIsProduceOpen(false);
        setProduceSuccess(false);
        setProducePartition('');
        setProduceKey('');
        setProduceValue('');
        refetch();
      }, 800);
    },
    onError: (err: Error) => {
      setProduceError(err.message || 'Failed to produce message');
    },
  });

  const {
    data: response,
    isLoading,
    isFetching,
    refetch,
  } = useQuery({
    queryKey: ['messages', clusterId, topicName, partition, offset, limit, seekOffsets, seekDirection],
    queryFn: () =>
      fetchMessages(clusterId!, topicName!, {
        partition,
        offset,
        limit,
        seekOffsets,
        seekDirection,
      }),
    enabled: false,
    placeholderData: (previousData) => previousData,
  });

  const messages = response?.messages ?? [];

  // Trigger tbody animation exactly once after each fetch completes
  const prevIsFetchingRef = useRef(isFetching);
  useEffect(() => {
    const wasFetching = prevIsFetchingRef.current;
    prevIsFetchingRef.current = isFetching;
    if (wasFetching && !isFetching && messages.length > 0) {
      setAnimKey((k) => k + 1);
    }
  }, [isFetching, messages.length]);

  // Sync fetchMode when user explicitly changes offset mode
  useEffect(() => {
    setFetchMode(offsetMode);
  }, [offsetMode]);

  // Reset cursor pagination when fetch params change
  useEffect(() => {
    setPage(0);
    setCursorHistory([]);
  }, [clusterId, topicName, partition, offsetMode, limit]);

  // Auto-fetch on mount
  useEffect(() => {
    if (clusterId && topicName) {
      refetch();
    }
  }, [clusterId, topicName]);

  const pageInfo = useMemo(() => {
    if (!messages || messages.length === 0) return null;
    const offsets = messages.map((m) => m.offset);
    return {
      minOffset: Math.min(...offsets),
      maxOffset: Math.max(...offsets),
      count: messages.length,
    };
  }, [messages]);

  // Single-partition pagination
  const canPageNextSingle = pageInfo !== null && partition >= 0 && (
    isNewest ? pageInfo.minOffset > 0 : true
  );
  const canPagePreviousSingle = pageInfo !== null && partition >= 0 && (
    isNewest ? messages.length > 0 : pageInfo.minOffset > 0
  );

  // All-partitions cursor pagination
  const canPageNextAll = isAllPartitions && messages.length > 0;
  const canPagePreviousAll = isAllPartitions && page > 0;

  const canPageNext = isAllPartitions ? canPageNextAll : canPageNextSingle;
  const canPagePrevious = isAllPartitions ? canPagePreviousAll : canPagePreviousSingle;

  const handleNext = () => {
    if (isAllPartitions) {
      if (!response?.cursors || Object.keys(response.cursors).length === 0) return;
      flushSync(() => {
        setCursorHistory((prev) => {
          const next = [...prev];
          next[page] = response.cursors;
          return next;
        });
        setPage((p) => p + 1);
      });
      refetch();
      return;
    }
    if (!pageInfo) return;
    if (isNewest) {
      // newest 倒序: Next = 更老的消息
      const nextOffset = Math.max(0, pageInfo.minOffset - limit);
      flushSync(() => {
        setOffsetMode('custom');
        setCustomOffset(nextOffset);
      });
    } else {
      // oldest/custom 升序: Next = 更新的消息
      const nextOffset = pageInfo.maxOffset + 1;
      flushSync(() => {
        setOffsetMode('custom');
        setCustomOffset(nextOffset);
      });
    }
    refetch();
  };

  const handlePrevious = () => {
    if (isAllPartitions) {
      if (page <= 0) return;
      flushSync(() => {
        setPage((p) => p - 1);
      });
      refetch();
      return;
    }
    if (!pageInfo) return;
    if (isNewest) {
      // newest 倒序: Previous = 更新的消息
      const nextOffset = pageInfo.maxOffset + 1;
      flushSync(() => {
        setOffsetMode('custom');
        setCustomOffset(nextOffset);
      });
    } else {
      // oldest/custom 升序: Previous = 更老的消息
      const nextOffset = Math.max(0, pageInfo.minOffset - limit);
      flushSync(() => {
        setOffsetMode('custom');
        setCustomOffset(nextOffset);
      });
    }
    refetch();
  };

  const toggleRow = (rowKey: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(rowKey)) {
        next.delete(rowKey);
      } else {
        next.add(rowKey);
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
              {topic?.partitions.map((p: { id: number }) => (
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
            onClick={() => {
              setFetchMode(offsetMode);
              refetch();
            }}
          >
            <span className="relative z-10 flex items-center justify-center gap-2">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Fetch Messages
            </span>
          </button>

          {/* Produce Button */}
          <button
            className="rounded-xl px-6 py-3 text-sm font-medium transition-all bg-slate-800/50 border border-white/5 text-slate-300 hover:bg-amber-500/10 hover:border-amber-500/20 hover:text-amber-400"
            onClick={() => {
              setIsProduceOpen(true);
              setProduceError(null);
              setProduceSuccess(false);
            }}
          >
            <span className="flex items-center justify-center gap-2">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              Produce Message
            </span>
          </button>
        </div>
      </div>

      {/* Loading — only on first load when no data exists yet */}
      {isLoading && !messages && (
        <div className="flex items-center justify-center py-16">
          <div className="flex items-center gap-3 text-slate-500 font-mono-data">
            <div className="w-5 h-5 border-2 border-amber-500/30 border-t-amber-500 rounded-full animate-spin" />
            POLLING MESSAGES...
          </div>
        </div>
      )}

      {/* Messages Table */}
      {(messages && messages.length > 0) && (
        <div className="glass-panel rounded-2xl overflow-hidden">
          {/* Refreshing indicator — fixed height to prevent layout shift */}
          <div className={`transition-all duration-200 overflow-hidden ${isFetching ? 'max-h-10 opacity-100' : 'max-h-0 opacity-0'}`}>
            <div className="px-6 py-2 border-b border-white/5 bg-amber-500/5">
              <div className="flex items-center gap-2 text-xs text-amber-400 font-mono-data">
                <div className="w-3 h-3 border-2 border-amber-500/30 border-t-amber-500 rounded-full animate-spin" />
                Refreshing messages...
              </div>
            </div>
          </div>
          {/* Result count */}
          <div className="px-6 py-3 border-b border-white/5 flex items-center justify-between">
            <span className="text-xs text-slate-500 font-mono-data">
              {messages.length} messages
              {pageInfo && partition >= 0 && (
                <span className="ml-2 text-slate-600">
                  (offset {pageInfo.minOffset} → {pageInfo.maxOffset})
                </span>
              )}
              {isAllPartitions && page > 0 && (
                <span className="ml-2 text-slate-600">
                  page {page}
                </span>
              )}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/5">
                  <th className="text-left px-4 py-4 text-xs font-mono-data uppercase tracking-wider text-slate-500 w-12">
                    {/* Expand column */}
                  </th>
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
              <tbody key={animKey}>
                {messages.map((m, idx) => {
                  const rowKey = `${m.partition}-${m.offset}`;
                  const isExpanded = expandedRows.has(rowKey);
                  return (
                    <Fragment key={rowKey}>
                      <tr
                        className="data-row border-b border-white/[0.03] last:border-0 animate-fade-in-up"
                        style={{ animationDelay: `${idx * 0.015}s` }}
                      >
                        <td className="px-4 py-4">
                          <button
                            onClick={() => toggleRow(rowKey)}
                            className={`w-6 h-6 flex items-center justify-center rounded border text-xs font-mono-data transition-colors ${
                              isExpanded
                                ? 'border-cyan-500 text-cyan-400 bg-cyan-500/10'
                                : 'border-slate-600 text-slate-400 hover:border-cyan-500 hover:text-cyan-400'
                            }`}
                            title={isExpanded ? 'Collapse' : 'Expand details'}
                          >
                            {isExpanded ? '−' : '+'}
                          </button>
                        </td>
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
                          <span className="font-mono-data text-sm text-slate-300 max-w-md truncate block">
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
                      {isExpanded && (
                        <tr>
                          <td colSpan={6} className="p-0">
                            <MessageDetailPanel
                              message={m}
                              onClose={() => toggleRow(rowKey)}
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

          {/* Pagination */}
          {pageInfo && (
            <div className="px-6 py-4 border-t border-white/5 flex items-center justify-between">
              <button
                onClick={handlePrevious}
                disabled={!canPagePrevious}
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  canPagePrevious
                    ? 'bg-slate-800/50 border border-white/5 text-slate-300 hover:bg-cyan-500/10 hover:border-cyan-500/20 hover:text-cyan-400'
                    : 'bg-slate-800/30 border border-white/[0.03] text-slate-600 cursor-not-allowed'
                }`}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
                Previous
              </button>

              <span className="text-xs text-slate-500 font-mono-data">
                {isAllPartitions
                  ? `page ${page + 1}`
                  : `offset ${pageInfo.minOffset} → ${pageInfo.maxOffset}`}
              </span>

              <button
                onClick={handleNext}
                disabled={!canPageNext}
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  canPageNext
                    ? 'bg-slate-800/50 border border-white/5 text-slate-300 hover:bg-cyan-500/10 hover:border-cyan-500/20 hover:text-cyan-400'
                    : 'bg-slate-800/30 border border-white/[0.03] text-slate-600 cursor-not-allowed'
                }`}
              >
                Next
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          )}
        </div>
      )}

      {/* Empty State */}
      {messages && messages.length === 0 && !isLoading && (
        <div className="glass-panel rounded-2xl p-16 text-center">
          <div className="w-16 h-16 rounded-2xl bg-slate-800/50 border border-white/5 flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
          </div>
          <p className="text-slate-500 font-display text-lg mb-1">No messages found</p>
          <p className="text-slate-600 text-sm">Adjust offset or fetch from a different partition</p>
        </div>
      )}

      {/* Produce Message Modal */}
      {isProduceOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
          <div className="glass-panel rounded-2xl p-6 w-full max-w-lg">
            <div className="flex items-center justify-between mb-6">
              <h3 className="font-display text-lg font-semibold text-slate-200">Produce Message</h3>
              <button
                onClick={() => setIsProduceOpen(false)}
                className="text-slate-500 hover:text-slate-300 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="space-y-4">
              {/* Partition */}
              <div>
                <label className="block text-xs text-slate-500 mb-2 font-mono-data uppercase tracking-wider">
                  Partition <span className="text-slate-600 normal-case">(optional)</span>
                </label>
                <input
                  className="terminal-input w-full rounded-xl px-4 py-3 text-sm"
                  type="number"
                  placeholder="Default partition"
                  value={producePartition}
                  onChange={(e) => setProducePartition(e.target.value)}
                />
              </div>

              {/* Key */}
              <div>
                <label className="block text-xs text-slate-500 mb-2 font-mono-data uppercase tracking-wider">
                  Key <span className="text-slate-600 normal-case">(optional)</span>
                </label>
                <input
                  className="terminal-input w-full rounded-xl px-4 py-3 text-sm"
                  type="text"
                  placeholder="Message key"
                  value={produceKey}
                  onChange={(e) => setProduceKey(e.target.value)}
                />
              </div>

              {/* Value */}
              <div>
                <label className="block text-xs text-slate-500 mb-2 font-mono-data uppercase tracking-wider">
                  Value <span className="text-red-400">*</span>
                </label>
                <textarea
                  className="terminal-input w-full rounded-xl px-4 py-3 text-sm min-h-[120px] resize-y"
                  placeholder="Enter message value..."
                  value={produceValue}
                  onChange={(e) => setProduceValue(e.target.value)}
                />
              </div>

              {/* Error */}
              {produceError && (
                <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3">
                  {produceError}
                </div>
              )}

              {/* Success */}
              {produceSuccess && (
                <div className="text-sm text-green-400 bg-green-500/10 border border-green-500/20 rounded-lg px-4 py-3">
                  Message produced successfully
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  onClick={() => setIsProduceOpen(false)}
                  className="rounded-xl px-5 py-2.5 text-sm font-medium transition-all bg-slate-800/50 border border-white/5 text-slate-300 hover:bg-slate-700/50"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    if (!produceValue.trim()) {
                      setProduceError('Value is required');
                      return;
                    }
                    setProduceError(null);
                    produceMutation.mutate();
                  }}
                  disabled={produceMutation.isPending || produceSuccess}
                  className="rounded-xl px-5 py-2.5 text-sm font-medium transition-all bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-lg shadow-amber-500/20 hover:shadow-amber-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {produceMutation.isPending ? 'Sending...' : produceSuccess ? 'Sent!' : 'Send'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
