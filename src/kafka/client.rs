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

pub async fn fetch_messages(
    bootstrap_servers: &str,
    topic: &str,
    partition: i32,
    offset: i64,
    limit: usize,
) -> Result<Vec<MessageRecord>, AppError> {
    let consumer = create_consumer(bootstrap_servers)
        .map_err(|e| AppError::KafkaError(e.to_string()))?;

    let mut tpl = rdkafka::TopicPartitionList::new();
    tpl.add_partition(topic, partition);
    consumer
        .assign(&tpl)
        .map_err(|e| AppError::KafkaError(e.to_string()))?;

    consumer
        .seek(topic, partition, Offset::Offset(offset), Duration::from_secs(5))
        .map_err(|e| AppError::KafkaError(e.to_string()))?;

    let mut messages = Vec::new();
    let deadline = std::time::Instant::now() + Duration::from_secs(10);

    while messages.len() < limit && std::time::Instant::now() < deadline {
        match consumer.poll(Duration::from_millis(100)) {
            Some(Ok(msg)) => {
                messages.push(MessageRecord {
                    partition: msg.partition(),
                    offset: msg.offset(),
                    key: msg.key().map(|k| String::from_utf8_lossy(k).to_string()),
                    value: msg.payload().map(|v| String::from_utf8_lossy(v).to_string()),
                    timestamp: msg.timestamp().to_millis(),
                });
            }
            Some(Err(e)) => return Err(AppError::KafkaError(e.to_string())),
            None => break,
        }
    }

    Ok(messages)
}
