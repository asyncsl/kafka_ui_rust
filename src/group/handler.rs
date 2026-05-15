use axum::{
    Json,
    extract::{Path, State},
    http::StatusCode,
};
use regex::Regex;
use std::collections::HashMap;
use std::collections::HashSet;
use std::sync::OnceLock;

use crate::error::AppError;
use crate::group::model::{CreateGroupRequest, Group, MoveGroupRequest, UpdateGroupRequest};
use crate::state::AppState;

const NAME_MAX_LEN: usize = 64;
const ICON_MAX_LEN: usize = 8;

fn color_regex() -> &'static Regex {
    static R: OnceLock<Regex> = OnceLock::new();
    R.get_or_init(|| Regex::new(r"^#[0-9a-fA-F]{6}$").unwrap())
}

fn validate_name(name: &str) -> Result<String, AppError> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err(AppError::BadRequest("name is required".into()));
    }
    if trimmed.chars().count() > NAME_MAX_LEN {
        return Err(AppError::BadRequest(format!(
            "name must be ≤ {} characters",
            NAME_MAX_LEN
        )));
    }
    Ok(trimmed.to_string())
}

fn validate_color(color: &Option<String>) -> Result<(), AppError> {
    if let Some(c) = color {
        if !color_regex().is_match(c) {
            return Err(AppError::BadRequest("color must match #RRGGBB".into()));
        }
    }
    Ok(())
}

fn validate_icon(icon: &Option<String>) -> Result<(), AppError> {
    if let Some(i) = icon {
        if i.chars().count() > ICON_MAX_LEN {
            return Err(AppError::BadRequest(format!(
                "icon must be ≤ {} characters",
                ICON_MAX_LEN
            )));
        }
    }
    Ok(())
}

pub async fn list_groups(State(state): State<AppState>) -> Result<Json<Vec<Group>>, AppError> {
    let groups = state.groups.read().await;
    let mut list: Vec<Group> = groups.values().cloned().collect();
    list.sort_by(|a, b| a.order.cmp(&b.order).then_with(|| a.id.cmp(&b.id)));
    Ok(Json(list))
}

pub async fn create_group(
    State(state): State<AppState>,
    Json(req): Json<CreateGroupRequest>,
) -> Result<Json<Group>, AppError> {
    let name = validate_name(&req.name)?;
    validate_color(&req.color)?;
    validate_icon(&req.icon)?;

    if let Some(pid) = &req.parent_id {
        let groups = state.groups.read().await;
        if !groups.contains_key(pid) {
            return Err(AppError::GroupNotFound);
        }
    }

    let id = uuid::Uuid::new_v4().to_string();
    let next_order = {
        let groups = state.groups.read().await;
        groups
            .values()
            .filter(|g| g.parent_id == req.parent_id)
            .map(|g| g.order)
            .max()
            .map(|m| m + 1024)
            .unwrap_or(1024)
    };

    let group = Group {
        id: id.clone(),
        name,
        parent_id: req.parent_id,
        color: req.color,
        icon: req.icon,
        description: req.description,
        order: next_order,
    };
    state.groups.write().await.insert(id, group.clone());
    let _ = state.save().await;
    Ok(Json(group))
}

pub async fn update_group(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(req): Json<UpdateGroupRequest>,
) -> Result<Json<Group>, AppError> {
    validate_color(&req.color)?;
    validate_icon(&req.icon)?;

    let mut groups = state.groups.write().await;
    let group = groups.get_mut(&id).ok_or(AppError::GroupNotFound)?;

    if let Some(name) = req.name {
        group.name = validate_name(&name)?;
    }
    if let Some(color) = req.color {
        group.color = Some(color);
    }
    if let Some(icon) = req.icon {
        group.icon = Some(icon);
    }
    if let Some(desc) = req.description {
        group.description = Some(desc);
    }
    let updated = group.clone();
    drop(groups);
    let _ = state.save().await;
    Ok(Json(updated))
}

pub async fn delete_group(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<StatusCode, AppError> {
    let group_count = state
        .groups
        .read()
        .await
        .values()
        .filter(|g| g.parent_id.as_deref() == Some(&id))
        .count();
    let cluster_count = state
        .clusters
        .read()
        .await
        .values()
        .filter(|c| c.parent_group_id.as_deref() == Some(&id))
        .count();

    if group_count + cluster_count > 0 {
        return Err(AppError::GroupNotEmpty {
            group_count,
            cluster_count,
        });
    }

    let removed = state.groups.write().await.remove(&id).is_some();
    if !removed {
        return Err(AppError::GroupNotFound);
    }
    let _ = state.save().await;
    Ok(StatusCode::NO_CONTENT)
}

fn collect_descendant_ids(groups: &HashMap<String, Group>, root_id: &str) -> HashSet<String> {
    let mut out: HashSet<String> = HashSet::new();
    let mut stack: Vec<String> = vec![root_id.to_string()];
    while let Some(current) = stack.pop() {
        for g in groups.values() {
            if g.parent_id.as_deref() == Some(&current) && !out.contains(&g.id) {
                out.insert(g.id.clone());
                stack.push(g.id.clone());
            }
        }
    }
    out
}

pub async fn move_group(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(req): Json<MoveGroupRequest>,
) -> Result<Json<Group>, AppError> {
    let mut groups = state.groups.write().await;
    if !groups.contains_key(&id) {
        return Err(AppError::GroupNotFound);
    }

    if let Some(new_parent) = &req.parent_id {
        if new_parent == &id {
            return Err(AppError::CycleDetected);
        }
        if !groups.contains_key(new_parent) {
            return Err(AppError::GroupNotFound);
        }
        let descendants = collect_descendant_ids(&groups, &id);
        if descendants.contains(new_parent) {
            return Err(AppError::CycleDetected);
        }
    }

    let group = groups.get_mut(&id).ok_or(AppError::GroupNotFound)?;
    group.parent_id = req.parent_id;
    group.order = req.order;
    let updated = group.clone();
    drop(groups);
    let _ = state.save().await;
    Ok(Json(updated))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;
    use std::sync::Arc;
    use tokio::sync::RwLock;

    fn empty_state() -> AppState {
        AppState {
            clusters: Arc::new(RwLock::new(HashMap::new())),
            groups: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    #[tokio::test]
    async fn create_group_assigns_order_per_parent() {
        let state = empty_state();
        let g1 = create_group(
            axum::extract::State(state.clone()),
            Json(CreateGroupRequest {
                name: "a".into(),
                parent_id: None,
                color: None,
                icon: None,
                description: None,
            }),
        )
        .await
        .unwrap()
        .0;
        let g2 = create_group(
            axum::extract::State(state.clone()),
            Json(CreateGroupRequest {
                name: "b".into(),
                parent_id: None,
                color: None,
                icon: None,
                description: None,
            }),
        )
        .await
        .unwrap()
        .0;
        assert_eq!(g1.order, 1024);
        assert_eq!(g2.order, 2048);
    }

    #[tokio::test]
    async fn create_group_rejects_invalid_color() {
        let state = empty_state();
        let err = create_group(
            axum::extract::State(state),
            Json(CreateGroupRequest {
                name: "a".into(),
                parent_id: None,
                color: Some("not-a-color".into()),
                icon: None,
                description: None,
            }),
        )
        .await
        .err()
        .unwrap();
        assert!(matches!(err, AppError::BadRequest(_)));
    }

    #[tokio::test]
    async fn create_group_rejects_missing_parent() {
        let state = empty_state();
        let err = create_group(
            axum::extract::State(state),
            Json(CreateGroupRequest {
                name: "a".into(),
                parent_id: Some("does-not-exist".into()),
                color: None,
                icon: None,
                description: None,
            }),
        )
        .await
        .err()
        .unwrap();
        assert!(matches!(err, AppError::GroupNotFound));
    }

    #[tokio::test]
    async fn delete_non_empty_group_returns_conflict() {
        let state = empty_state();
        let parent = create_group(
            axum::extract::State(state.clone()),
            Json(CreateGroupRequest {
                name: "p".into(),
                parent_id: None,
                color: None,
                icon: None,
                description: None,
            }),
        )
        .await
        .unwrap()
        .0;
        let _child = create_group(
            axum::extract::State(state.clone()),
            Json(CreateGroupRequest {
                name: "c".into(),
                parent_id: Some(parent.id.clone()),
                color: None,
                icon: None,
                description: None,
            }),
        )
        .await
        .unwrap()
        .0;
        let err = delete_group(axum::extract::State(state), axum::extract::Path(parent.id))
            .await
            .err()
            .unwrap();
        assert!(matches!(
            err,
            AppError::GroupNotEmpty {
                group_count: 1,
                cluster_count: 0
            }
        ));
    }

    #[tokio::test]
    async fn delete_empty_group_succeeds() {
        let state = empty_state();
        let g = create_group(
            axum::extract::State(state.clone()),
            Json(CreateGroupRequest {
                name: "x".into(),
                parent_id: None,
                color: None,
                icon: None,
                description: None,
            }),
        )
        .await
        .unwrap()
        .0;
        let status = delete_group(axum::extract::State(state), axum::extract::Path(g.id))
            .await
            .unwrap();
        assert_eq!(status, StatusCode::NO_CONTENT);
    }

    #[tokio::test]
    async fn move_group_into_descendant_is_cycle() {
        let state = empty_state();
        let g_a = create_group(
            axum::extract::State(state.clone()),
            Json(CreateGroupRequest {
                name: "a".into(),
                parent_id: None,
                color: None,
                icon: None,
                description: None,
            }),
        )
        .await
        .unwrap()
        .0;
        let g_b = create_group(
            axum::extract::State(state.clone()),
            Json(CreateGroupRequest {
                name: "b".into(),
                parent_id: Some(g_a.id.clone()),
                color: None,
                icon: None,
                description: None,
            }),
        )
        .await
        .unwrap()
        .0;
        let err = move_group(
            axum::extract::State(state),
            axum::extract::Path(g_a.id.clone()),
            Json(MoveGroupRequest {
                parent_id: Some(g_b.id),
                order: 0,
            }),
        )
        .await
        .err()
        .unwrap();
        assert!(matches!(err, AppError::CycleDetected));
    }

    #[tokio::test]
    async fn move_group_to_self_is_cycle() {
        let state = empty_state();
        let g = create_group(
            axum::extract::State(state.clone()),
            Json(CreateGroupRequest {
                name: "x".into(),
                parent_id: None,
                color: None,
                icon: None,
                description: None,
            }),
        )
        .await
        .unwrap()
        .0;
        let err = move_group(
            axum::extract::State(state),
            axum::extract::Path(g.id.clone()),
            Json(MoveGroupRequest {
                parent_id: Some(g.id),
                order: 0,
            }),
        )
        .await
        .err()
        .unwrap();
        assert!(matches!(err, AppError::CycleDetected));
    }

    #[tokio::test]
    async fn move_group_to_nonexistent_parent_is_404() {
        let state = empty_state();
        let g = create_group(
            axum::extract::State(state.clone()),
            Json(CreateGroupRequest {
                name: "x".into(),
                parent_id: None,
                color: None,
                icon: None,
                description: None,
            }),
        )
        .await
        .unwrap()
        .0;
        let err = move_group(
            axum::extract::State(state),
            axum::extract::Path(g.id),
            Json(MoveGroupRequest {
                parent_id: Some("does-not-exist".into()),
                order: 0,
            }),
        )
        .await
        .err()
        .unwrap();
        assert!(matches!(err, AppError::GroupNotFound));
    }

    #[tokio::test]
    async fn move_group_to_root_succeeds() {
        let state = empty_state();
        let parent = create_group(
            axum::extract::State(state.clone()),
            Json(CreateGroupRequest {
                name: "p".into(),
                parent_id: None,
                color: None,
                icon: None,
                description: None,
            }),
        )
        .await
        .unwrap()
        .0;
        let child = create_group(
            axum::extract::State(state.clone()),
            Json(CreateGroupRequest {
                name: "c".into(),
                parent_id: Some(parent.id.clone()),
                color: None,
                icon: None,
                description: None,
            }),
        )
        .await
        .unwrap()
        .0;
        let moved = move_group(
            axum::extract::State(state),
            axum::extract::Path(child.id),
            Json(MoveGroupRequest {
                parent_id: None,
                order: 99,
            }),
        )
        .await
        .unwrap()
        .0;
        assert_eq!(moved.parent_id, None);
        assert_eq!(moved.order, 99);
    }
}
