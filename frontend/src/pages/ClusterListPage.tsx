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

  if (isLoading) return <div className="p-4">Loading...</div>;

  return (
    <div className="p-4 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Clusters</h1>

      <div className="mb-4 flex gap-2">
        <input
          className="border p-2 rounded flex-1"
          placeholder="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          className="border p-2 rounded flex-1"
          placeholder="Bootstrap Servers (e.g. localhost:9092)"
          value={bootstrapServers}
          onChange={(e) => setBootstrapServers(e.target.value)}
        />
        <button
          className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
          onClick={() =>
            createMutation.mutate({ name, bootstrap_servers: bootstrapServers })
          }
        >
          Add
        </button>
      </div>

      <table className="w-full border">
        <thead>
          <tr className="bg-gray-100">
            <th className="border p-2 text-left">Name</th>
            <th className="border p-2 text-left">Bootstrap Servers</th>
            <th className="border p-2 text-left">Actions</th>
          </tr>
        </thead>
        <tbody>
          {clusters?.map((c) => (
            <tr key={c.id}>
              <td className="border p-2">
                <Link
                  to={`/clusters/${c.id}/topics`}
                  className="text-blue-600 underline"
                >
                  {c.name}
                </Link>
              </td>
              <td className="border p-2">{c.bootstrap_servers}</td>
              <td className="border p-2">
                <button
                  className="text-red-600 hover:underline"
                  onClick={() => deleteMutation.mutate(c.id)}
                >
                  Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
