import { api } from './client';
import type { Cluster } from '../types';

export const listClusters = () =>
  api.get<Cluster[]>('/clusters').then((r) => r.data);

export const createCluster = (data: {
  name: string;
  bootstrap_servers: string;
}) => api.post<Cluster>('/clusters', data).then((r) => r.data);

export const deleteCluster = (id: string) =>
  api.delete(`/clusters/${id}`);

export const moveCluster = (
  id: string,
  data: { parent_group_id: string | null; order: number }
) => api.post<Cluster>(`/clusters/${id}/move`, data).then((r) => r.data);
