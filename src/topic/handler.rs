use axum::{
    extract::{Path, Query, State},
    Json,
};
use serde::Deserialize;

use crate::error::AppError;
use crate::kafka::client::{fetch_messages, list_topics, topic_detail};
use crate::state::AppState;

#[derive(Debug, Deserialize)]
pub struct MessageQuery {
    partition: i32,
    offset: i64,
    #[serde(default = "default_limit")]
    limit: usize,
}

fn default_limit() -> usize {
    100
}

pub async fn list_topics_handler(
    State(state): State<AppState>,
    Path(cluster_id): Path<String>,
) -> Result<Json<Vec<crate::kafka::client::TopicInfo>>, AppError> {
    let clusters = state.clusters.read().await;
    let cluster = clusters.get(&cluster_id).ok_or(AppError::ClusterNotFound)?;
    let topics = list_topics(&cluster.bootstrap_servers).await?;
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

pub async fn fetch_messages_handler(
    State(state): State<AppState>,
    Path((cluster_id, topic_name)): Path<(String, String)>,
    Query(params): Query<MessageQuery>,
) -> Result<Json<Vec<crate::kafka::client::MessageRecord>>, AppError> {
    let clusters = state.clusters.read().await;
    let cluster = clusters.get(&cluster_id).ok_or(AppError::ClusterNotFound)?;
    let messages = fetch_messages(
        &cluster.bootstrap_servers,
        &topic_name,
        params.partition,
        params.offset,
        params.limit,
    )
    .await?;
    Ok(Json(messages))
}
