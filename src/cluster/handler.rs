use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};

use crate::cluster::model::{Cluster, CreateClusterRequest};
use crate::error::AppError;
use crate::state::AppState;

pub async fn list_clusters(
    State(state): State<AppState>,
) -> Result<Json<Vec<Cluster>>, AppError> {
    let clusters = state.clusters.read().await;
    let list: Vec<Cluster> = clusters.values().cloned().collect();
    Ok(Json(list))
}

pub async fn create_cluster(
    State(state): State<AppState>,
    Json(req): Json<CreateClusterRequest>,
) -> Result<Json<Cluster>, AppError> {
    if req.name.trim().is_empty() || req.bootstrap_servers.trim().is_empty() {
        return Err(AppError::BadRequest(
            "name and bootstrap_servers are required".to_string(),
        ));
    }
    let id = uuid::Uuid::new_v4().to_string();
    let cluster = Cluster {
        id: id.clone(),
        name: req.name,
        bootstrap_servers: req.bootstrap_servers,
        parent_group_id: None,
        order: 0,
    };
    state.clusters.write().await.insert(id, cluster.clone());
    let _ = state.save().await;
    Ok(Json(cluster))
}

pub async fn delete_cluster(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<StatusCode, AppError> {
    let removed = state.clusters.write().await.remove(&id).is_some();
    if !removed {
        return Err(AppError::ClusterNotFound);
    }
    let _ = state.save().await;
    Ok(StatusCode::NO_CONTENT)
}
