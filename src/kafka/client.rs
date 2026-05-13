use rdkafka::config::ClientConfig;
use rdkafka::consumer::{BaseConsumer, Consumer};
use rdkafka::message::Message;
use rdkafka::Offset;
use std::time::Duration;

use crate::error::AppError;

#[derive(Debug, Clone, serde::Serialize)]
pub struct TopicInfo {
    pub name: String,
    pub partition_count: usize,
    pub replication_factor: i32,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct PartitionInfo {
    pub id: i32,
    pub leader: i32,
    pub replicas: Vec<i32>,
    pub isr: Vec<i32>,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct TopicDetail {
    pub name: String,
    pub partitions: Vec<PartitionInfo>,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct MessageRecord {
    pub partition: i32,
    pub offset: i64,
    pub key: Option<String>,
    pub value: Option<String>,
    pub timestamp: Option<i64>,
}

fn create_consumer(bootstrap_servers: &str) -> Result<BaseConsumer, rdkafka::error::KafkaError> {
    ClientConfig::new()
        .set("bootstrap.servers", bootstrap_servers)
        .set("group.id", "kafka-ui-rust")
        .set("enable.auto.commit", "false")
        .set("session.timeout.ms", "5000")
        .create()
}

pub async fn list_topics(bootstrap_servers: &str) -> Result<Vec<TopicInfo>, AppError> {
    let consumer = create_consumer(bootstrap_servers)
        .map_err(|e| AppError::KafkaError(e.to_string()))?;
    let metadata = consumer
        .fetch_metadata(None, Duration::from_secs(5))
        .map_err(|e| AppError::KafkaError(e.to_string()))?;

    let mut topics = Vec::new();
    for topic in metadata.topics() {
        if topic.name().starts_with("__") {
            continue;
        }
        let partition_count = topic.partitions().len();
        let replication_factor = if partition_count > 0 {
            topic.partitions()[0].replicas().len() as i32
        } else {
            0
        };
        topics.push(TopicInfo {
            name: topic.name().to_string(),
            partition_count,
            replication_factor,
        });
    }
    Ok(topics)
}

pub async fn topic_detail(
    bootstrap_servers: &str,
    topic_name: &str,
) -> Result<TopicDetail, AppError> {
    let consumer = create_consumer(bootstrap_servers)
        .map_err(|e| AppError::KafkaError(e.to_string()))?;
    let metadata = consumer
        .fetch_metadata(Some(topic_name), Duration::from_secs(5))
        .map_err(|e| AppError::KafkaError(e.to_string()))?;

    let topic = metadata.topics().first().ok_or(AppError::TopicNotFound)?;
    if topic.name() != topic_name {
        return Err(AppError::TopicNotFound);
    }

    let partitions = topic
        .partitions()
        .iter()
        .map(|p| PartitionInfo {
            id: p.id(),
            leader: p.leader(),
            replicas: p.replicas().to_vec(),
            isr: p.isr().to_vec(),
        })
        .collect();

    Ok(TopicDetail {
        name: topic_name.to_string(),
        partitions,
    })
}

fn fetch_from_partition(
    consumer: &BaseConsumer,
    topic: &str,
    partition: i32,
    offset: Offset,
    limit: usize,
) -> Result<Vec<MessageRecord>, AppError> {
    // Resolve offset to actual position using watermarks
    // low = earliest available offset, high = next offset to be assigned (one past last message)
    let (low, high) = consumer
        .fetch_watermarks(topic, partition, Duration::from_secs(5))
        .map_err(|e| AppError::KafkaError(e.to_string()))?;

    tracing::info!("watermarks partition={} low={} high={}", partition, low, high);

    if high <= low {
        return Ok(Vec::new());
    }

    let actual_offset = match offset {
        Offset::Beginning => Offset::Offset(low),
        Offset::OffsetTail(n) => {
            let start = high.saturating_sub(n).max(low);
            Offset::Offset(start)
        }
        Offset::End => Offset::Offset(high),
        other => other,
    };

    let mut tpl = rdkafka::TopicPartitionList::new();
    tpl.add_partition_offset(topic, partition, actual_offset)
        .map_err(|e| AppError::KafkaError(e.to_string()))?;
    consumer
        .assign(&tpl)
        .map_err(|e| AppError::KafkaError(e.to_string()))?;

    let mut messages = Vec::new();
    let mut empty_polls = 0;
    let deadline = std::time::Instant::now() + Duration::from_secs(15);

    tracing::info!("polling partition={} low={} high={} offset={:?} limit={}", partition, low, high, actual_offset, limit);

    while messages.len() < limit && std::time::Instant::now() < deadline {
        match consumer.poll(Duration::from_millis(500)) {
            Some(Ok(msg)) => {
                empty_polls = 0;
                tracing::info!("got msg partition={} offset={}", msg.partition(), msg.offset());
                messages.push(MessageRecord {
                    partition: msg.partition(),
                    offset: msg.offset(),
                    key: msg.key().map(|k| String::from_utf8_lossy(k).to_string()),
                    value: msg.payload().map(|v| String::from_utf8_lossy(v).to_string()),
                    timestamp: msg.timestamp().to_millis(),
                });
            }
            Some(Err(e)) => {
                tracing::warn!("poll error: {}", e);
                return Err(AppError::KafkaError(e.to_string()));
            }
            None => {
                empty_polls += 1;
                tracing::debug!("empty poll #{}", empty_polls);
                if empty_polls >= 10 {
                    break;
                }
            }
        }
    }

    tracing::info!("done polling partition={} messages={}", partition, messages.len());
    Ok(messages)
}

pub async fn fetch_messages(
    bootstrap_servers: &str,
    topic: &str,
    partition: i32,
    offset: i64,
    limit: usize,
) -> Result<Vec<MessageRecord>, AppError> {
    let kafka_offset = if offset == -1 {
        Offset::OffsetTail(limit as i64)
    } else if offset == -2 {
        Offset::Beginning
    } else {
        Offset::Offset(offset)
    };

    if partition >= 0 {
        // Single partition
        let consumer = create_consumer(bootstrap_servers)
            .map_err(|e| AppError::KafkaError(e.to_string()))?;
        fetch_from_partition(&consumer, topic, partition, kafka_offset, limit)
    } else {
        // All partitions: fetch from each and merge
        let consumer = create_consumer(bootstrap_servers)
            .map_err(|e| AppError::KafkaError(e.to_string()))?;
        let metadata = consumer
            .fetch_metadata(Some(topic), Duration::from_secs(5))
            .map_err(|e| AppError::KafkaError(e.to_string()))?;

        let topic_meta = metadata.topics().first().ok_or(AppError::TopicNotFound)?;
        let partitions: Vec<i32> = topic_meta.partitions().iter().map(|p| p.id()).collect();
        let per_partition_limit = std::cmp::max(1, limit / partitions.len());

        let mut all_messages = Vec::new();
        for p in partitions {
            let consumer = create_consumer(bootstrap_servers)
                .map_err(|e| AppError::KafkaError(e.to_string()))?;
            match fetch_from_partition(&consumer, topic, p, kafka_offset, per_partition_limit) {
                Ok(msgs) => all_messages.extend(msgs),
                Err(_) => continue,
            }
        }

        // Sort by timestamp descending (newest first), fallback to partition+offset
        all_messages.sort_by(|a, b| {
            match (b.timestamp, a.timestamp) {
                (Some(bt), Some(at)) => bt.cmp(&at),
                (Some(_), None) => std::cmp::Ordering::Less,
                (None, Some(_)) => std::cmp::Ordering::Greater,
                (None, None) => {
                    let a_key = (a.partition, a.offset);
                    let b_key = (b.partition, b.offset);
                    b_key.cmp(&a_key)
                }
            }
        });

        all_messages.truncate(limit);
        Ok(all_messages)
    }
}
