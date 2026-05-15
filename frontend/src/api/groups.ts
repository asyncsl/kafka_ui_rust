import { api } from './client';
import type { Group } from '../types';

export const listGroups = () =>
  api.get<Group[]>('/groups').then((r) => r.data);

export const createGroup = (data: {
  name: string;
  parent_id?: string | null;
  color?: string | null;
  icon?: string | null;
  description?: string | null;
}) => api.post<Group>('/groups', data).then((r) => r.data);

export const updateGroup = (
  id: string,
  data: {
    name?: string;
    color?: string | null;
    icon?: string | null;
    description?: string | null;
  }
) => api.patch<Group>(`/groups/${id}`, data).then((r) => r.data);

export const deleteGroup = (id: string) =>
  api.delete(`/groups/${id}`);

export const moveGroup = (
  id: string,
  data: { parent_id: string | null; order: number }
) => api.post<Group>(`/groups/${id}/move`, data).then((r) => r.data);
