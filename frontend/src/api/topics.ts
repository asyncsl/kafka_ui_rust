import { api } from './client';
import type { TopicListResponse, TopicDetail, MessageFetchResponse } from '../types';

export const listTopics = (
  clusterId: string,
  params: { search?: string; page?: number; per_page?: number } = {}
) =>
  api.get<TopicListResponse>(`/clusters/${clusterId}/topics`, { params }).then((r) => r.data);

export const getTopic = (clusterId: string, topicName: string) =>
  api
    .get<TopicDetail>(`/clusters/${clusterId}/topics/${topicName}`)
    .then((r) => r.data);

export const fetchMessages = (
  clusterId: string,
  topicName: string,
  params: {
    partition: number;
    offset: number;
    limit: number;
    seekOffsets?: Record<number, number>;
    seekDirection?: 'before' | 'after';
  }
) =>
  api
    .get<MessageFetchResponse>(
      `/clusters/${clusterId}/topics/${topicName}/messages`,
      {
        params: {
          ...params,
          seek_offsets: params.seekOffsets ? JSON.stringify(params.seekOffsets) : undefined,
          seek_direction: params.seekDirection,
        },
      }
    )
    .then((r) => r.data);

export const getTopicCounts = (
  clusterId: string,
  topics: string[]
) =>
  api
    .post<{ counts: Record<string, number> }>(
      `/clusters/${clusterId}/topics/counts`,
      { topics }
    )
    .then((r) => r.data);

export const produceMessage = (
  clusterId: string,
  topicName: string,
  body: { partition?: number; key?: string; value: string }
) =>
  api
    .post<{ success: boolean }>(
      `/clusters/${clusterId}/topics/${topicName}/messages/produce`,
      body
    )
    .then((r) => r.data);

export const createTopic = (
  clusterId: string,
  body: { name: string; partition_count: number; replication_factor: number }
) =>
  api
    .post<{ success: boolean }>(`/clusters/${clusterId}/topics`, body)
    .then((r) => r.data);

export const deleteTopic = (clusterId: string, topicName: string) =>
  api
    .delete<{ success: boolean }>(`/clusters/${clusterId}/topics/${topicName}`)
    .then((r) => r.data);

export const getTopicDetailFull = (clusterId: string, topicName: string) =>
  api
    .get<import('../types').TopicDetailFull>(`/clusters/${clusterId}/topics/${topicName}/detail`)
    .then((r) => r.data);
