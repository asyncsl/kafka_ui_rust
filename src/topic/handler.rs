use axum::{
    extract::{Path, Query, State},
    Json,
};
use serde::{Deserialize, Serialize};

use crate::error::AppError;
use crate::kafka::client::{
    create_topic, delete_topic, fetch_messages, get_topic_message_counts, list_topics,
    produce_message, topic_detail, topic_detail_with_watermarks,
};
use crate::state::AppState;

#[derive(Debug, Deserialize)]
pub struct MessageQuery {
    partition: i32,
    offset: i64,
    #[serde(default = "default_limit")]
    limit: usize,
    #[serde(default)]
    seek_offsets: Option<String>,
    #[serde(default)]
    seek_direction: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct ListTopicsQuery {
    #[serde(default)]
    search: Option<String>,
    #[serde(default = "default_page")]
    page: usize,
    #[serde(default = "default_per_page")]
    per_page: usize,
}

fn default_limit() -> usize {
    100
}

fn default_page() -> usize {
    1
}

fn default_per_page() -> usize {
    20
}

pub async fn list_topics_handler(
    State(state): State<AppState>,
    Path(cluster_id): Path<String>,
    Query(params): Query<ListTopicsQuery>,
) -> Result<Json<crate::kafka::client::TopicListResponse>, AppError> {
    let clusters = state.clusters.read().await;
    let cluster = clusters.get(&cluster_id).ok_or(AppError::ClusterNotFound)?;
    let search_ref = params.search.as_deref();
    let topics = list_topics(&cluster.bootstrap_servers, search_ref, params.page, params.per_page).await?;
    Ok(Json(topics))
}

pub async fn topic_detail_handler(
    State(state): State<AppState>,
    Path((cluster_id, topic_name)): Path<(String, String)>,
) -> Result<Json<crate::kafka::client::TopicDetail>, AppError> {
    let clusters = state.clusters.read().await;
    let cluster = clusters.get(&cluster_id).ok_or(AppError::ClusterNotFound)?;
    let detail = topic_detail(&cluster.bootstrap_servers, &topic_name).await?;
    Ok(Json(detail))
}

#[derive(Debug, Deserialize)]
pub struct TopicCountsRequest {
    pub topics: Vec<String>,
}

#[derive(Debug, Serialize)]
pub struct TopicCountsResponse {
    pub counts: std::collections::HashMap<String, i64>,
}

pub async fn get_topic_counts_handler(
    State(state): State<AppState>,
    Path(cluster_id): Path<String>,
    Json(req): Json<TopicCountsRequest>,
) -> Result<Json<TopicCountsResponse>, AppError> {
    let clusters = state.clusters.read().await;
    let cluster = clusters.get(&cluster_id).ok_or(AppError::ClusterNotFound)?;
    let counts = get_topic_message_counts(&cluster.bootstrap_servers, &req.topics).await?;
    Ok(Json(TopicCountsResponse { counts }))
}

pub async fn fetch_messages_handler(
    State(state): State<AppState>,
    Path((cluster_id, topic_name)): Path<(String, String)>,
    Query(params): Query<MessageQuery>,
) -> Result<Json<crate::kafka::client::MessageFetchResult>, AppError> {
    let seek_offsets: Option<std::collections::HashMap<i32, i64>> = params
        .seek_offsets
        .as_deref()
        .and_then(|s| serde_json::from_str(s).ok());

    let seek_forward = params.seek_direction.as_deref() == Some("after");

    let clusters = state.clusters.read().await;
    let cluster = clusters.get(&cluster_id).ok_or(AppError::ClusterNotFound)?;
    let result = fetch_messages(
        &cluster.bootstrap_servers,
        &topic_name,
        params.partition,
        params.offset,
        params.limit,
        seek_offsets.as_ref(),
        seek_forward,
    )
    .await?;
    Ok(Json(result))
}

#[derive(Debug, Deserialize)]
pub struct ProduceMessageRequest {
    pub partition: Option<i32>,
    pub key: Option<String>,
    pub value: String,
}

pub async fn produce_message_handler(
    State(state): State<AppState>,
    Path((cluster_id, topic_name)): Path<(String, String)>,
    Json(req): Json<ProduceMessageRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    let clusters = state.clusters.read().await;
    let cluster = clusters.get(&cluster_id).ok_or(AppError::ClusterNotFound)?;
    produce_message(
        &cluster.bootstrap_servers,
        &topic_name,
        req.partition,
        req.key,
        req.value,
    )
    .await?;
    Ok(Json(serde_json::json!({ "success": true })))
}

#[derive(Debug, Deserialize)]
pub struct CreateTopicRequest {
    pub name: String,
    pub partition_count: i32,
    pub replication_factor: i32,
}

pub async fn create_topic_handler(
    State(state): State<AppState>,
    Path(cluster_id): Path<String>,
    Json(req): Json<CreateTopicRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    let clusters = state.clusters.read().await;
    let cluster = clusters.get(&cluster_id).ok_or(AppError::ClusterNotFound)?;
    create_topic(
        &cluster.bootstrap_servers,
        &req.name,
        req.partition_count,
        req.replication_factor,
    )
    .await?;
    Ok(Json(serde_json::json!({ "success": true })))
}

pub async fn delete_topic_handler(
    State(state): State<AppState>,
    Path((cluster_id, topic_name)): Path<(String, String)>,
) -> Result<Json<serde_json::Value>, AppError> {
    let clusters = state.clusters.read().await;
    let cluster = clusters.get(&cluster_id).ok_or(AppError::ClusterNotFound)?;
    delete_topic(&cluster.bootstrap_servers, &topic_name).await?;
    Ok(Json(serde_json::json!({ "success": true })))
}

pub async fn topic_detail_full_handler(
    State(state): State<AppState>,
    Path((cluster_id, topic_name)): Path<(String, String)>,
) -> Result<Json<crate::kafka::client::TopicDetailFull>, AppError> {
    let clusters = state.clusters.read().await;
    let cluster = clusters.get(&cluster_id).ok_or(AppError::ClusterNotFound)?;
    let detail = topic_detail_with_watermarks(&cluster.bootstrap_servers, &topic_name).await?;
    Ok(Json(detail))
}
