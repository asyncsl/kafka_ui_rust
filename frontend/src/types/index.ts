export interface Cluster {
  id: string;
  name: string;
  bootstrap_servers: string;
  parent_group_id: string | null;
  order: number;
}

export interface Group {
  id: string;
  name: string;
  parent_id: string | null;
  color: string | null;
  icon: string | null;
  description: string | null;
  order: number;
}

export type Selection =
  | { kind: 'all' }
  | { kind: 'ungrouped' }
  | { kind: 'group'; id: string };

export type ViewMode = 'direct' | 'recursive';

export interface TopicInfo {
  name: string;
  partition_count: number;
  replication_factor: number;
  message_count: number;
}

export interface TopicListResponse {
  topics: TopicInfo[];
  total: number;
  page: number;
  per_page: number;
}

export interface PartitionInfo {
  id: number;
  leader: number;
  replicas: number[];
  isr: number[];
}

export interface TopicDetail {
  name: string;
  partitions: PartitionInfo[];
}

export interface MessageRecord {
  partition: number;
  offset: number;
  key: string | null;
  value: string | null;
  timestamp: number | null;
}

export interface MessageFetchResponse {
  messages: MessageRecord[];
  cursors: Record<number, number>;
}

export interface ConsumerGroupInfo {
  name: string;
  state: string;
  protocol: string;
  members: number;
}

export interface ConsumerGroupLag {
  topic: string;
  partition: number;
  current_offset: number;
  high_watermark: number;
  lag: number;
}

export interface PartitionDetail {
  id: number;
  leader: number;
  replicas: number[];
  isr: number[];
  low_watermark: number;
  high_watermark: number;
  message_count: number;
}

export interface TopicDetailFull {
  name: string;
  partitions: PartitionDetail[];
}
