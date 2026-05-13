import { api } from './client';
import type { TopicInfo, TopicDetail, MessageRecord } from '../types';

export const listTopics = (clusterId: string) =>
  api.get<TopicInfo[]>(`/clusters/${clusterId}/topics`).then((r) => r.data);

export const getTopic = (clusterId: string, topicName: string) =>
  api
    .get<TopicDetail>(`/clusters/${clusterId}/topics/${topicName}`)
    .then((r) => r.data);

export const fetchMessages = (
  clusterId: string,
  topicName: string,
  params: { partition: number; offset: number; limit: number }
) =>
  api
    .get<MessageRecord[]>(
      `/clusters/${clusterId}/topics/${topicName}/messages`,
      { params }
    )
    .then((r) => r.data);
