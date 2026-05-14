use axum::{
    extract::{Path, State},
    Json,
};

use crate::error::AppError;
use crate::kafka::client::{get_consumer_group_lag, list_consumer_groups};
use crate::state::AppState;

pub async fn list_consumer_groups_handler(
    State(state): State<AppState>,
    Path(cluster_id): Path<String>,
) -> Result<Json<Vec<crate::kafka::client::ConsumerGroupInfo>>, AppError> {
    let clusters = state.clusters.read().await;
    let cluster = clusters.get(&cluster_id).ok_or(AppError::ClusterNotFound)?;
    let groups = list_consumer_groups(&cluster.bootstrap_servers).await?;
    Ok(Json(groups))
}

pub async fn get_consumer_group_lag_handler(
    State(state): State<AppState>,
    Path((cluster_id, group_name)): Path<(String, String)>,
) -> Result<Json<Vec<crate::kafka::client::ConsumerGroupLag>>, AppError> {
    let clusters = state.clusters.read().await;
    let cluster = clusters.get(&cluster_id).ok_or(AppError::ClusterNotFound)?;
    let lags = get_consumer_group_lag(&cluster.bootstrap_servers, &group_name).await?;
    Ok(Json(lags))
}
