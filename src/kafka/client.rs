use rdkafka::admin::{AdminClient, AdminOptions, NewTopic, TopicReplication};
use rdkafka::client::DefaultClientContext;
use rdkafka::config::ClientConfig;
use rdkafka::consumer::{BaseConsumer, Consumer};
use rdkafka::message::Message;
use rdkafka::producer::{BaseProducer, BaseRecord, Producer};
use rdkafka::Offset;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Duration;

use crate::error::AppError;

static GROUP_COUNTER: AtomicU64 = AtomicU64::new(0);

#[derive(Debug, Clone, serde::Serialize)]
pub struct TopicInfo {
    pub name: String,
    pub partition_count: usize,
    pub replication_factor: i32,
    pub message_count: i64,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct TopicListResponse {
    pub topics: Vec<TopicInfo>,
    pub total: usize,
    pub page: usize,
    pub per_page: usize,
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

#[derive(Debug, Clone, serde::Serialize)]
pub struct MessageFetchResult {
    pub messages: Vec<MessageRecord>,
    pub cursors: std::collections::HashMap<i32, i64>,
}

fn create_consumer(bootstrap_servers: &str) -> Result<BaseConsumer, rdkafka::error::KafkaError> {
    let counter = GROUP_COUNTER.fetch_add(1, Ordering::SeqCst);
    let group_id = format!("kafka-ui-rust-{}", counter);
    ClientConfig::new()
        .set("bootstrap.servers", bootstrap_servers)
        .set("group.id", group_id)
        .set("enable.auto.commit", "false")
        .set("session.timeout.ms", "5000")
        .create()
}

pub async fn list_topics(
    bootstrap_servers: &str,
    search: Option<&str>,
    page: usize,
    per_page: usize,
) -> Result<TopicListResponse, AppError> {
    let consumer = create_consumer(bootstrap_servers)
        .map_err(|e| AppError::KafkaError(e.to_string()))?;
    let metadata = consumer
        .fetch_metadata(None, Duration::from_secs(5))
        .map_err(|e| AppError::KafkaError(e.to_string()))?;
    drop(consumer);

    let search_lower = search.map(|s| s.to_lowercase());
    let mut all_topics = Vec::new();
    for topic in metadata.topics() {
        if topic.name().starts_with("__") {
            continue;
        }
        if let Some(ref s) = search_lower {
            if !topic.name().to_lowercase().contains(s) {
                continue;
            }
        }
        let partition_count = topic.partitions().len();
        let replication_factor = if partition_count > 0 {
            topic.partitions()[0].replicas().len() as i32
        } else {
            0
        };
        all_topics.push((topic.name().to_string(), partition_count, replication_factor));
    }

    let total = all_topics.len();
    let page = page.max(1);
    let per_page = per_page.max(1).min(100);
    let skip = (page - 1) * per_page;
    let page_topics: Vec<_> = all_topics.into_iter().skip(skip).take(per_page).collect();

    let topics = page_topics
        .into_iter()
        .map(|(name, partition_count, replication_factor)| TopicInfo {
            name,
            partition_count,
            replication_factor,
            message_count: 0,
        })
        .collect();

    Ok(TopicListResponse {
        topics,
        total,
        page,
        per_page,
    })
}

pub async fn get_topic_message_counts(
    bootstrap_servers: &str,
    topics: &[String],
) -> Result<std::collections::HashMap<String, i64>, AppError> {
    // Step 1: fetch metadata for all topics with a single consumer
    let consumer = create_consumer(bootstrap_servers)
        .map_err(|e| AppError::KafkaError(e.to_string()))?;
    let metadata = consumer
        .fetch_metadata(None, Duration::from_secs(5))
        .map_err(|e| AppError::KafkaError(e.to_string()))?;
    drop(consumer);

    // Build a flat list of (topic, partition) jobs
    let mut jobs: Vec<(String, i32)> = Vec::new();
    for topic_meta in metadata.topics() {
        if !topics.contains(&topic_meta.name().to_string()) {
            continue;
        }
        for p in topic_meta.partitions() {
            jobs.push((topic_meta.name().to_string(), p.id()));
        }
    }

    // Step 2: fetch watermarks concurrently using a shared consumer.
    // librdkafka is fully thread-safe, so multiple threads can call
    // fetch_watermarks on the same consumer simultaneously.
    let consumer = std::sync::Arc::new(
        create_consumer(bootstrap_servers)
            .map_err(|e| AppError::KafkaError(e.to_string()))?,
    );
    let semaphore = std::sync::Arc::new(tokio::sync::Semaphore::new(12));
    let mut handles = Vec::new();

    for (topic_name, partition) in jobs {
        let permit = semaphore.clone().acquire_owned().await.unwrap();
        let consumer = consumer.clone();

        handles.push(tokio::task::spawn_blocking(move || {
            let _permit = permit;
            let count = consumer
                .fetch_watermarks(&topic_name, partition, Duration::from_millis(500))
                .map(|(low, high)| (high - low).max(0))
                .unwrap_or(0);
            (topic_name, partition, count)
        }));
    }

    let mut result: std::collections::HashMap<String, i64> =
        std::collections::HashMap::new();
    for h in handles {
        match h.await {
            Ok((topic_name, _partition, count)) => {
                *result.entry(topic_name).or_insert(0) += count;
            }
            Err(e) => tracing::warn!("message count task error: {}", e),
        }
    }
    Ok(result)
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
    seek_offset: Option<i64>,
    seek_forward: bool,
) -> Result<Vec<MessageRecord>, AppError> {
    // Resolve offset to actual position using watermarks
    // low = earliest available offset, high = next offset to be assigned (one past last message)
    let (low, high) = consumer
        .fetch_watermarks(topic, partition, Duration::from_secs(5))
        .map_err(|e| AppError::KafkaError(e.to_string()))?;

    tracing::info!("watermarks partition={} low={} high={} seek={:?}", partition, low, high, seek_offset);

    if high <= low {
        return Ok(Vec::new());
    }

    let actual_offset = if let Some(seek) = seek_offset {
        if seek_forward {
            // Forward read: start from seek, read forward
            Offset::Offset(seek.max(low))
        } else {
            // Backward read: start from seek - limit, read forward, then filter
            let start = seek.saturating_sub(limit as i64).max(low);
            Offset::Offset(start)
        }
    } else {
        match offset {
            Offset::Beginning => Offset::Beginning,
            Offset::OffsetTail(n) => {
                let start = high.saturating_sub(n).max(low);
                Offset::Offset(start)
            }
            Offset::End => Offset::Offset(high),
            other => other,
        }
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

    tracing::info!("polling partition={} low={} high={} offset={:?} limit={} seek={:?}", partition, low, high, actual_offset, limit, seek_offset);

    while messages.len() < limit && std::time::Instant::now() < deadline {
        // Dynamic timeout: longer on first poll to let consumer connect,
        // shorter once we've started reading to avoid waiting on empty partitions.
        let poll_timeout = if messages.is_empty() {
            Duration::from_millis(500)
        } else {
            Duration::from_millis(100)
        };
        match consumer.poll(poll_timeout) {
            Some(Ok(msg)) => {
                empty_polls = 0;
                // When backward seek_offset is set, filter out messages at or beyond the seek boundary
                if let Some(seek) = seek_offset {
                    if !seek_forward && msg.offset() >= seek {
                        // We've reached the boundary — stop polling this partition
                        tracing::info!("reached seek boundary partition={} offset={} seek={}", partition, msg.offset(), seek);
                        break;
                    }
                }
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
                tracing::info!("empty poll #{}", empty_polls);
                if empty_polls >= 3 {
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
    seek_offsets: Option<&std::collections::HashMap<i32, i64>>,
    seek_forward: bool,
) -> Result<MessageFetchResult, AppError> {
    let kafka_offset = if offset == -1 {
        Offset::OffsetTail(limit as i64)
    } else if offset == -2 {
        Offset::Beginning
    } else {
        Offset::Offset(offset)
    };

    let bs = bootstrap_servers.to_string();
    let t = topic.to_string();
    let ko = kafka_offset;
    let pl = limit;
    let sf = seek_forward;
    // newest (offset == -1) -> descending; otherwise ascending
    let sort_desc = offset == -1;

    if partition >= 0 {
        // Single partition: one consumer, one blocking task
        let seek = seek_offsets.and_then(|m| m.get(&partition).copied());
        let mut msgs = tokio::task::spawn_blocking(move || {
            let consumer = create_consumer(&bs)
                .map_err(|e| AppError::KafkaError(e.to_string()))?;
            let result = fetch_from_partition(&consumer, &t, partition, ko, pl, seek, sf);
            drop(consumer);
            result
        })
        .await
        .map_err(|e| AppError::KafkaError(e.to_string()))??;

        if sort_desc {
            msgs.reverse();
        }

        let cursors = if let Some(first) = msgs.first() {
            let mut map = std::collections::HashMap::new();
            if sort_desc {
                let min_offset = msgs.iter().filter(|m| m.partition == first.partition).map(|m| m.offset).min().unwrap_or(first.offset);
                map.insert(first.partition, min_offset);
            } else {
                let max_offset = msgs.iter().filter(|m| m.partition == first.partition).map(|m| m.offset).max().unwrap_or(first.offset);
                map.insert(first.partition, max_offset);
            }
            map
        } else {
            std::collections::HashMap::new()
        };

        Ok(MessageFetchResult { messages: msgs, cursors })
    } else {
        // All partitions: single consumer, assign all partitions at once
        let seek_map = seek_offsets.cloned().unwrap_or_default();

        let result = tokio::task::spawn_blocking(move || {
            let consumer = create_consumer(&bs)
                .map_err(|e| AppError::KafkaError(e.to_string()))?;
            let metadata = consumer
                .fetch_metadata(Some(&t), Duration::from_secs(5))
                .map_err(|e| AppError::KafkaError(e.to_string()))?;
            let topic_meta = metadata.topics().first().ok_or(AppError::TopicNotFound)?;
            let partitions: Vec<i32> =
                topic_meta.partitions().iter().map(|p| p.id()).collect();

            if partitions.is_empty() {
                return Ok(MessageFetchResult {
                    messages: Vec::new(),
                    cursors: std::collections::HashMap::new(),
                });
            }

            // Fetch watermarks for all partitions using the same consumer
            let mut watermarks = std::collections::HashMap::new();
            for &p in &partitions {
                if let Ok((low, high)) = consumer.fetch_watermarks(&t, p, Duration::from_secs(1)) {
                    watermarks.insert(p, (low, high));
                }
            }

            // Build TopicPartitionList with per-partition offsets
            let mut tpl = rdkafka::TopicPartitionList::new();
            for &p in &partitions {
                let (low, high) = watermarks.get(&p).copied().unwrap_or((0, 0));
                let actual_offset = if let Some(seek) = seek_map.get(&p) {
                    if sf {
                        Offset::Offset((*seek).max(low))
                    } else {
                        let start = seek.saturating_sub(pl as i64).max(low);
                        Offset::Offset(start)
                    }
                } else {
                    match ko {
                        Offset::Beginning => Offset::Beginning,
                        Offset::OffsetTail(n) => {
                            let start = high.saturating_sub(n).max(low);
                            Offset::Offset(start)
                        }
                        Offset::End => Offset::Offset(high),
                        other => other,
                    }
                };
                tpl.add_partition_offset(&t, p, actual_offset)
                    .map_err(|e| AppError::KafkaError(e.to_string()))?;
            }

            consumer
                .assign(&tpl)
                .map_err(|e| AppError::KafkaError(e.to_string()))?;

            // Poll messages from all partitions simultaneously
            let mut all_messages = Vec::new();
            let mut paused_partitions: std::collections::HashSet<i32> =
                std::collections::HashSet::new();
            let mut empty_polls = 0;
            let deadline = std::time::Instant::now() + Duration::from_secs(15);

            while all_messages.len() < pl && std::time::Instant::now() < deadline {
                let poll_timeout = if all_messages.is_empty() {
                    Duration::from_millis(500)
                } else {
                    Duration::from_millis(100)
                };
                match consumer.poll(poll_timeout) {
                    Some(Ok(msg)) => {
                        empty_polls = 0;
                        // Check backward seek boundary
                        if let Some(seek) = seek_map.get(&msg.partition()) {
                            if !sf && msg.offset() >= *seek {
                                // Pause this partition so it doesn't keep
                                // returning messages we've already seen
                                if !paused_partitions.contains(&msg.partition()) {
                                    let mut pause_tpl =
                                        rdkafka::TopicPartitionList::new();
                                    pause_tpl.add_partition(&t, msg.partition());
                                    if consumer.pause(&pause_tpl).is_ok() {
                                        paused_partitions.insert(msg.partition());
                                    }
                                }
                                continue;
                            }
                        }
                        all_messages.push(MessageRecord {
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
                        if empty_polls >= 3 {
                            break;
                        }
                    }
                }
            }

            // Sort and truncate
            if sort_desc {
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
            } else {
                all_messages.sort_by(|a, b| {
                    match (a.timestamp, b.timestamp) {
                        (Some(at), Some(bt)) => at.cmp(&bt),
                        (Some(_), None) => std::cmp::Ordering::Less,
                        (None, Some(_)) => std::cmp::Ordering::Greater,
                        (None, None) => {
                            let a_key = (a.partition, a.offset);
                            let b_key = (b.partition, b.offset);
                            a_key.cmp(&b_key)
                        }
                    }
                });
            }
            all_messages.truncate(pl);

            // Compute cursors
            let mut cursors: std::collections::HashMap<i32, i64> =
                std::collections::HashMap::new();
            if sort_desc {
                for m in &all_messages {
                    cursors
                        .entry(m.partition)
                        .and_modify(|v| *v = (*v).min(m.offset))
                        .or_insert(m.offset);
                }
            } else {
                for m in &all_messages {
                    cursors
                        .entry(m.partition)
                        .and_modify(|v| *v = (*v).max(m.offset))
                        .or_insert(m.offset);
                }
            }

            Ok(MessageFetchResult {
                messages: all_messages,
                cursors,
            })
        })
        .await
        .map_err(|e| AppError::KafkaError(e.to_string()))??;

        Ok(result)
    }
}

// ---------------------------------------------------------------------------
// Consumer Groups
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, serde::Serialize)]
pub struct ConsumerGroupInfo {
    pub name: String,
    pub state: String,
    pub protocol: String,
    pub members: usize,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct ConsumerGroupLag {
    pub topic: String,
    pub partition: i32,
    pub current_offset: i64,
    pub high_watermark: i64,
    pub lag: i64,
}

pub async fn list_consumer_groups(
    bootstrap_servers: &str,
) -> Result<Vec<ConsumerGroupInfo>, AppError> {
    let consumer = create_consumer(bootstrap_servers)
        .map_err(|e| AppError::KafkaError(e.to_string()))?;
    let group_list = consumer
        .fetch_group_list(None, Duration::from_secs(5))
        .map_err(|e| AppError::KafkaError(e.to_string()))?;
    drop(consumer);

    let mut groups = Vec::new();
    for group in group_list.groups() {
        groups.push(ConsumerGroupInfo {
            name: group.name().to_string(),
            state: group.state().to_string(),
            protocol: group.protocol().to_string(),
            members: group.members().len(),
        });
    }
    Ok(groups)
}

pub async fn get_consumer_group_lag(
    bootstrap_servers: &str,
    group_name: &str,
) -> Result<Vec<ConsumerGroupLag>, AppError> {
    let bs = bootstrap_servers.to_string();
    let gn = group_name.to_string();

    let lags = tokio::task::spawn_blocking(move || {
        // 1. Create a consumer with the target group.id
        let group_consumer: BaseConsumer = ClientConfig::new()
            .set("bootstrap.servers", &bs)
            .set("group.id", &gn)
            .set("enable.auto.commit", "false")
            .create()
            .map_err(|e| AppError::KafkaError(e.to_string()))?;

        // 2. Fetch metadata for all topics
        let metadata = group_consumer
            .fetch_metadata(None, Duration::from_secs(5))
            .map_err(|e| AppError::KafkaError(e.to_string()))?;

        // 3. Build TopicPartitionList with all topics/partitions
        let mut tpl = rdkafka::TopicPartitionList::new();
        for topic in metadata.topics() {
            if topic.name().starts_with("__") {
                continue;
            }
            for p in topic.partitions() {
                tpl.add_partition(topic.name(), p.id());
            }
        }

        if tpl.count() == 0 {
            return Ok::<_, AppError>(Vec::new());
        }

        // 4. Assign all partitions and query committed offsets
        group_consumer
            .assign(&tpl)
            .map_err(|e| AppError::KafkaError(e.to_string()))?;
        let committed = group_consumer
            .committed(Duration::from_secs(10))
            .map_err(|e| AppError::KafkaError(e.to_string()))?;

        let mut result = Vec::new();
        for elem in committed.elements() {
            let partition = elem.partition();
            let topic = elem.topic().to_string();
            let offset = elem.offset().to_raw().unwrap_or(-1);

            // Skip partitions that have no committed offset
            if offset < 0 {
                continue;
            }

            let (low, high) = group_consumer
                .fetch_watermarks(&topic, partition, Duration::from_secs(5))
                .unwrap_or((0, 0));

            let lag = (high - offset).max(0);

            result.push(ConsumerGroupLag {
                topic,
                partition,
                current_offset: offset,
                high_watermark: high,
                lag,
            });
        }
        Ok::<_, AppError>(result)
    })
    .await
    .map_err(|e| AppError::KafkaError(e.to_string()))??;

    Ok(lags)
}

// ---------------------------------------------------------------------------
// Produce Message
// ---------------------------------------------------------------------------

pub async fn produce_message(
    bootstrap_servers: &str,
    topic: &str,
    partition: Option<i32>,
    key: Option<String>,
    value: String,
) -> Result<(), AppError> {
    let producer: BaseProducer = ClientConfig::new()
        .set("bootstrap.servers", bootstrap_servers)
        .create()
        .map_err(|e| AppError::KafkaError(e.to_string()))?;

    let mut record = BaseRecord::to(topic).payload(&value);
    if let Some(ref k) = key {
        record = record.key(k.as_bytes());
    }
    if let Some(p) = partition {
        record = record.partition(p);
    }

    producer
        .send(record)
        .map_err(|(e, _)| AppError::KafkaError(e.to_string()))?;

    producer
        .flush(Duration::from_secs(5))
        .map_err(|e| AppError::KafkaError(e.to_string()))?;

    Ok(())
}

// ---------------------------------------------------------------------------
// Topic Management
// ---------------------------------------------------------------------------

pub async fn create_topic(
    bootstrap_servers: &str,
    topic_name: &str,
    partition_count: i32,
    replication_factor: i32,
) -> Result<(), AppError> {
    let admin: AdminClient<DefaultClientContext> = ClientConfig::new()
        .set("bootstrap.servers", bootstrap_servers)
        .create()
        .map_err(|e| AppError::KafkaError(e.to_string()))?;

    let new_topic = NewTopic::new(
        topic_name,
        partition_count,
        TopicReplication::Fixed(replication_factor),
    );

    let opts = AdminOptions::new().operation_timeout(Some(Duration::from_secs(10)));

    admin
        .create_topics(&[new_topic], &opts)
        .await
        .map_err(|e| AppError::KafkaError(e.to_string()))?;

    Ok(())
}

pub async fn delete_topic(
    bootstrap_servers: &str,
    topic_name: &str,
) -> Result<(), AppError> {
    let admin: AdminClient<DefaultClientContext> = ClientConfig::new()
        .set("bootstrap.servers", bootstrap_servers)
        .create()
        .map_err(|e| AppError::KafkaError(e.to_string()))?;

    let opts = AdminOptions::new().operation_timeout(Some(Duration::from_secs(10)));

    admin
        .delete_topics(&[topic_name], &opts)
        .await
        .map_err(|e| AppError::KafkaError(e.to_string()))?;

    Ok(())
}

// ---------------------------------------------------------------------------
// Topic Detail with Watermarks
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, serde::Serialize)]
pub struct PartitionDetail {
    pub id: i32,
    pub leader: i32,
    pub replicas: Vec<i32>,
    pub isr: Vec<i32>,
    pub low_watermark: i64,
    pub high_watermark: i64,
    pub message_count: i64,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct TopicDetailFull {
    pub name: String,
    pub partitions: Vec<PartitionDetail>,
}

pub async fn topic_detail_with_watermarks(
    bootstrap_servers: &str,
    topic_name: &str,
) -> Result<TopicDetailFull, AppError> {
    let consumer = create_consumer(bootstrap_servers)
        .map_err(|e| AppError::KafkaError(e.to_string()))?;
    let metadata = consumer
        .fetch_metadata(Some(topic_name), Duration::from_secs(5))
        .map_err(|e| AppError::KafkaError(e.to_string()))?;

    let topic = metadata.topics().first().ok_or(AppError::TopicNotFound)?;
    if topic.name() != topic_name {
        return Err(AppError::TopicNotFound);
    }

    let mut partitions = Vec::new();
    for p in topic.partitions() {
        let (low, high) = consumer
            .fetch_watermarks(topic_name, p.id(), Duration::from_secs(5))
            .unwrap_or((0, 0));
        partitions.push(PartitionDetail {
            id: p.id(),
            leader: p.leader(),
            replicas: p.replicas().to_vec(),
            isr: p.isr().to_vec(),
            low_watermark: low,
            high_watermark: high,
            message_count: (high - low).max(0),
        });
    }

    Ok(TopicDetailFull {
        name: topic_name.to_string(),
        partitions,
    })
}
