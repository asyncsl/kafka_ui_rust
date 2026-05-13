export interface Cluster {
  id: string;
  name: string;
  bootstrap_servers: string;
}

export interface TopicInfo {
  name: string;
  partition_count: number;
  replication_factor: number;
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
