import { api } from './client';
import type { ConsumerGroupInfo, ConsumerGroupLag } from '../types';

export const listConsumerGroups = (clusterId: string) =>
  api.get<ConsumerGroupInfo[]>(`/clusters/${clusterId}/consumer-groups`).then((r) => r.data);

export const getConsumerGroupLag = (clusterId: string, groupName: string) =>
  api
    .get<ConsumerGroupLag[]>(`/clusters/${clusterId}/consumer-groups/${encodeURIComponent(groupName)}/lag`)
    .then((r) => r.data);
