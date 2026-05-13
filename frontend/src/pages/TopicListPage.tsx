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

  if (isLoading) return <div className="p-4">Loading...</div>;

  return (
    <div className="p-4 max-w-4xl mx-auto">
      <div className="mb-4">
        <Link to="/" className="text-blue-600 underline">
          ← Back to Clusters
        </Link>
      </div>
      <h1 className="text-2xl font-bold mb-4">Topics</h1>

      <table className="w-full border">
        <thead>
          <tr className="bg-gray-100">
            <th className="border p-2 text-left">Name</th>
            <th className="border p-2 text-left">Partitions</th>
            <th className="border p-2 text-left">Replication Factor</th>
            <th className="border p-2 text-left">Actions</th>
          </tr>
        </thead>
        <tbody>
          {topics?.map((t) => (
            <tr key={t.name}>
              <td className="border p-2">{t.name}</td>
              <td className="border p-2">{t.partition_count}</td>
              <td className="border p-2">{t.replication_factor}</td>
              <td className="border p-2">
                <Link
                  to={`/clusters/${clusterId}/topics/${t.name}/messages`}
                  className="text-blue-600 underline"
                >
                  Messages
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
