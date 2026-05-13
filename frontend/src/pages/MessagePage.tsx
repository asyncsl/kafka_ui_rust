import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getTopic, fetchMessages } from '../api/topics';

export default function MessagePage() {
  const { clusterId, topicName } = useParams<{
    clusterId: string;
    topicName: string;
  }>();
  const [partition, setPartition] = useState<number>(0);
  const [offset, setOffset] = useState<number>(0);
  const [limit, setLimit] = useState<number>(100);

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

  return (
    <div className="p-4 max-w-6xl mx-auto">
      <div className="mb-4">
        <Link
          to={`/clusters/${clusterId}/topics`}
          className="text-blue-600 underline"
        >
          ← Back to Topics
        </Link>
      </div>
      <h1 className="text-2xl font-bold mb-4">
        {topicName} — Messages
      </h1>

      <div className="mb-4 flex gap-3 items-center flex-wrap">
        <label className="font-medium">Partition:</label>
        <select
          className="border p-2 rounded"
          value={partition}
          onChange={(e) => setPartition(Number(e.target.value))}
        >
          {topic?.partitions.map((p) => (
            <option key={p.id} value={p.id}>
              {p.id}
            </option>
          ))}
        </select>

        <label className="font-medium">Offset:</label>
        <input
          className="border p-2 rounded w-32"
          type="number"
          value={offset}
          onChange={(e) => setOffset(Number(e.target.value))}
        />

        <label className="font-medium">Limit:</label>
        <input
          className="border p-2 rounded w-20"
          type="number"
          value={limit}
          onChange={(e) => setLimit(Number(e.target.value))}
        />

        <button
          className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
          onClick={() => refetch()}
        >
          Fetch
        </button>
      </div>

      {isLoading && <div>Loading messages...</div>}

      <div className="overflow-x-auto">
        <table className="w-full border text-sm">
          <thead>
            <tr className="bg-gray-100">
              <th className="border p-2 text-left">Partition</th>
              <th className="border p-2 text-left">Offset</th>
              <th className="border p-2 text-left">Key</th>
              <th className="border p-2 text-left">Value</th>
              <th className="border p-2 text-left">Timestamp</th>
            </tr>
          </thead>
          <tbody>
            {messages?.map((m) => (
              <tr key={`${m.partition}-${m.offset}`}>
                <td className="border p-2">{m.partition}</td>
                <td className="border p-2">{m.offset}</td>
                <td className="border p-2 max-w-xs truncate">
                  {m.key ?? '-'}
                </td>
                <td className="border p-2 max-w-md truncate">
                  {m.value ?? '-'}
                </td>
                <td className="border p-2">
                  {m.timestamp ? new Date(m.timestamp).toLocaleString() : '-'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {messages && messages.length === 0 && !isLoading && (
        <div className="mt-4 text-gray-500">No messages found.</div>
      )}
    </div>
  );
}
