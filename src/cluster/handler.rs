use axum::{
    Json,
    extract::{Path, State},
    http::StatusCode,
};

use crate::cluster::model::{Cluster, CreateClusterRequest};
use crate::error::AppError;
use crate::state::AppState;

pub async fn list_clusters(State(state): State<AppState>) -> Result<Json<Vec<Cluster>>, AppError> {
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

pub async fn move_cluster(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(req): Json<crate::cluster::model::MoveClusterRequest>,
) -> Result<Json<Cluster>, AppError> {
    if let Some(gid) = &req.parent_group_id {
        if !state.groups.read().await.contains_key(gid) {
            return Err(AppError::GroupNotFound);
        }
    }

    let mut clusters = state.clusters.write().await;
    let cluster = clusters.get_mut(&id).ok_or(AppError::ClusterNotFound)?;
    cluster.parent_group_id = req.parent_group_id;
    cluster.order = req.order;
    let updated = cluster.clone();
    drop(clusters);
    let _ = state.save().await;
    Ok(Json(updated))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::group::model::Group;
    use std::collections::HashMap;
    use std::sync::Arc;
    use tokio::sync::RwLock;

    fn state_with(clusters: Vec<Cluster>, groups: Vec<Group>) -> AppState {
        let cmap: HashMap<String, Cluster> =
            clusters.into_iter().map(|c| (c.id.clone(), c)).collect();
        let gmap: HashMap<String, Group> =
            groups.into_iter().map(|g| (g.id.clone(), g)).collect();
        AppState {
            clusters: Arc::new(RwLock::new(cmap)),
            groups: Arc::new(RwLock::new(gmap)),
        }
    }

    #[tokio::test]
    async fn move_cluster_into_group_updates_fields() {
        let cluster = Cluster {
            id: "c-1".into(),
            name: "x".into(),
            bootstrap_servers: "localhost:9092".into(),
            parent_group_id: None,
            order: 0,
        };
        let group = Group {
            id: "g-1".into(),
            name: "g".into(),
            parent_id: None,
            color: None,
            icon: None,
            description: None,
            order: 0,
        };
        let state = state_with(vec![cluster], vec![group]);
        let moved = move_cluster(
            axum::extract::State(state),
            axum::extract::Path("c-1".into()),
            Json(crate::cluster::model::MoveClusterRequest {
                parent_group_id: Some("g-1".into()),
                order: 2048,
            }),
        )
        .await
        .unwrap()
        .0;
        assert_eq!(moved.parent_group_id.as_deref(), Some("g-1"));
        assert_eq!(moved.order, 2048);
    }

    #[tokio::test]
    async fn move_cluster_to_unknown_group_404() {
        let cluster = Cluster {
            id: "c-1".into(),
            name: "x".into(),
            bootstrap_servers: "localhost:9092".into(),
            parent_group_id: None,
            order: 0,
        };
        let state = state_with(vec![cluster], vec![]);
        let err = move_cluster(
            axum::extract::State(state),
            axum::extract::Path("c-1".into()),
            Json(crate::cluster::model::MoveClusterRequest {
                parent_group_id: Some("nope".into()),
                order: 0,
            }),
        )
        .await
        .err()
        .unwrap();
        assert!(matches!(err, AppError::GroupNotFound));
    }

    #[tokio::test]
    async fn move_cluster_to_root_succeeds() {
        let cluster = Cluster {
            id: "c-1".into(),
            name: "x".into(),
            bootstrap_servers: "localhost:9092".into(),
            parent_group_id: Some("g-old".into()),
            order: 1024,
        };
        let state = state_with(vec![cluster], vec![]);
        let moved = move_cluster(
            axum::extract::State(state),
            axum::extract::Path("c-1".into()),
            Json(crate::cluster::model::MoveClusterRequest {
                parent_group_id: None,
                order: 5,
            }),
        )
        .await
        .unwrap()
        .0;
        assert_eq!(moved.parent_group_id, None);
        assert_eq!(moved.order, 5);
    }
}
