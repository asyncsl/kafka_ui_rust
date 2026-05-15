# Cluster Grouping Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add multi-level group management to the cluster page with drag-and-drop. Clusters can be nested under groups; groups can be nested under groups; both can be reorganized via drag.

**Architecture:** Extend the existing Axum + React stack. Backend gains a new `group/` module (model + handler) parallel to `cluster/`, with a second persistence file `data/groups.json`. Backend remains source of truth; frontend assembles tree from two flat queries. Drag-and-drop uses `@dnd-kit` with optimistic update + rollback.

**Tech Stack:** Rust (axum 0.8, tokio, serde, uuid), React 19 (TypeScript, TanStack Query v5, @dnd-kit/core + sortable, Tailwind CSS v3, Vite)

---

## File Structure

```
kafka_ui_rust/
├── src/
│   ├── error.rs                            # MODIFY: rename existing GroupNotFound → ConsumerGroupNotFound, add cluster-group variants
│   ├── state.rs                            # MODIFY: add `groups` field, load/save both files
│   ├── cluster/
│   │   └── model.rs                        # MODIFY: add parent_group_id + order with #[serde(default)]
│   │   └── handler.rs                      # MODIFY: add move_cluster handler
│   └── group/                              # NEW module
│       ├── mod.rs
│       ├── model.rs                        # Group struct + request DTOs
│       └── handler.rs                      # CRUD + move + validation
│   └── api/router.rs                       # MODIFY: wire /api/groups + /move routes
│
├── frontend/src/
│   ├── types/index.ts                      # MODIFY: extend Cluster, add Group, Selection
│   ├── api/
│   │   ├── clusters.ts                     # MODIFY: add moveCluster
│   │   └── groups.ts                       # NEW
│   ├── hooks/
│   │   └── useClusterTree.ts               # NEW + test
│   ├── components/cluster/                 # NEW directory
│   │   ├── ClusterTree.tsx                 # Tree shell + DnD context
│   │   ├── GroupNode.tsx                   # Single tree row (drag source/target)
│   │   ├── ClusterCard.tsx                 # Extracted from ClusterListPage
│   │   ├── ClusterDetailPanel.tsx          # Right panel with view-mode toggle
│   │   ├── GroupEditModal.tsx              # Create/edit modal
│   │   └── IconPicker.tsx                  # Emoji picker
│   ├── pages/ClusterListPage.tsx           # REWRITE: two-column layout
│   └── utils/order.ts                      # NEW: order field helpers (bisection)
│
├── data/
│   ├── clusters.json                       # Existing, additive fields
│   └── groups.json                         # NEW
```

---

## Important Notes (read before starting)

- **`AppError::GroupNotFound` collision.** The existing enum already has a `GroupNotFound` variant whose display string is "Consumer group not found" (intended for the consumer-group feature, currently not returned by any handler). This plan renames it to `ConsumerGroupNotFound` so that `GroupNotFound` in the new code unambiguously means "cluster-group not found". This rename is in Task 1, before any new variants are added.
- **Backward compatibility for clusters.json.** The existing file has objects like `{id, name, bootstrap_servers}`. Adding `parent_group_id` and `order` with `#[serde(default)]` ensures old files load. Old clusters appear under "Ungrouped" with `order = 0`.
- **Commits.** Each task ends with a commit step using conventional `feat(...)` / `refactor(...)` prefixes. Include the spec ref `(spec: 2026-05-15-cluster-grouping-design.md)` in the first commit of each phase for traceability.

---

## Phase 1 — Backend

### Task 1: Rename existing `AppError::GroupNotFound` to `ConsumerGroupNotFound`

**Why first:** prevents a naming conflict with the new cluster-group variants we add in Task 5.

**Files:**
- Modify: `src/error.rs`

- [ ] **Step 1: Rename variant + display string + status mapping**

Replace the entire contents of `src/error.rs` with:

```rust
use axum::{http::StatusCode, response::IntoResponse, Json};
use serde_json::json;

#[derive(Debug, Clone)]
pub enum AppError {
    ClusterNotFound,
    TopicNotFound,
    ConsumerGroupNotFound,
    KafkaError(String),
    BadRequest(String),
}

impl std::fmt::Display for AppError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            AppError::ClusterNotFound => write!(f, "Cluster not found"),
            AppError::TopicNotFound => write!(f, "Topic not found"),
            AppError::ConsumerGroupNotFound => write!(f, "Consumer group not found"),
            AppError::KafkaError(msg) => write!(f, "Kafka error: {}", msg),
            AppError::BadRequest(msg) => write!(f, "Bad request: {}", msg),
        }
    }
}

impl std::error::Error for AppError {}

impl IntoResponse for AppError {
    fn into_response(self) -> axum::response::Response {
        let (status, message) = match &self {
            AppError::ClusterNotFound => (StatusCode::NOT_FOUND, self.to_string()),
            AppError::TopicNotFound => (StatusCode::NOT_FOUND, self.to_string()),
            AppError::ConsumerGroupNotFound => (StatusCode::NOT_FOUND, self.to_string()),
            AppError::KafkaError(_) => (StatusCode::BAD_GATEWAY, self.to_string()),
            AppError::BadRequest(_) => (StatusCode::BAD_REQUEST, self.to_string()),
        };
        (status, Json(json!({ "error": message }))).into_response()
    }
}
```

- [ ] **Step 2: Verify no other file references the old name**

Run: `grep -rn "GroupNotFound" src/`
Expected: only `src/error.rs` matches (the new `ConsumerGroupNotFound`). If any other file still says `AppError::GroupNotFound`, replace those references with `AppError::ConsumerGroupNotFound`.

- [ ] **Step 3: Compile check**

Run: `cargo check`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/error.rs
git commit -m "$(cat <<'EOF'
refactor(error): rename GroupNotFound to ConsumerGroupNotFound

Prepare for the cluster-grouping feature, which introduces its own
GroupNotFound variant for cluster groups. (spec: 2026-05-15-cluster-grouping-design.md)
EOF
)"
```

---

### Task 2: Create the `Group` model

**Files:**
- Create: `src/group/mod.rs`
- Create: `src/group/model.rs`

- [ ] **Step 1: Write the failing test**

Create `src/group/model.rs`:

```rust
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Group {
    pub id: String,
    pub name: String,
    pub parent_id: Option<String>,
    pub color: Option<String>,
    pub icon: Option<String>,
    pub description: Option<String>,
    pub order: i32,
}

#[derive(Debug, Deserialize)]
pub struct CreateGroupRequest {
    pub name: String,
    pub parent_id: Option<String>,
    pub color: Option<String>,
    pub icon: Option<String>,
    pub description: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateGroupRequest {
    pub name: Option<String>,
    pub color: Option<String>,
    pub icon: Option<String>,
    pub description: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct MoveGroupRequest {
    pub parent_id: Option<String>,
    pub order: i32,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn group_roundtrips_through_json() {
        let g = Group {
            id: "g-1".into(),
            name: "业务A".into(),
            parent_id: None,
            color: Some("#f59e0b".into()),
            icon: Some("🛒".into()),
            description: Some("Order team".into()),
            order: 1024,
        };
        let json = serde_json::to_string(&g).unwrap();
        let back: Group = serde_json::from_str(&json).unwrap();
        assert_eq!(back.id, "g-1");
        assert_eq!(back.name, "业务A");
        assert_eq!(back.color.as_deref(), Some("#f59e0b"));
        assert_eq!(back.icon.as_deref(), Some("🛒"));
        assert_eq!(back.order, 1024);
    }

    #[test]
    fn nested_group_serializes_parent_id() {
        let parent = Group {
            id: "p".into(),
            name: "root".into(),
            parent_id: None,
            color: None,
            icon: None,
            description: None,
            order: 0,
        };
        let child = Group {
            id: "c".into(),
            name: "child".into(),
            parent_id: Some(parent.id.clone()),
            color: None,
            icon: None,
            description: None,
            order: 0,
        };
        let json = serde_json::to_string(&child).unwrap();
        assert!(json.contains("\"parent_id\":\"p\""));
    }
}
```

Create `src/group/mod.rs`:

```rust
pub mod model;
```

- [ ] **Step 2: Register module in main.rs**

Edit `src/main.rs` — add `mod group;` to the module list (alphabetical: between `error` and `kafka`):

```rust
mod api;
mod cluster;
mod consumer;
mod error;
mod group;
mod kafka;
mod state;
mod static_assets;
mod topic;
```

- [ ] **Step 3: Run test to verify it passes**

Run: `cargo test group::model`
Expected: 2 tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/group/ src/main.rs
git commit -m "feat(group): add Group model with request DTOs"
```

---

### Task 3: Extend `Cluster` with `parent_group_id` and `order`

**Files:**
- Modify: `src/cluster/model.rs`

- [ ] **Step 1: Write the failing test (legacy JSON loads with defaults)**

Add the following to `src/cluster/model.rs` inside the existing `#[cfg(test)] mod tests`:

```rust
    #[test]
    fn legacy_cluster_json_loads_with_defaults() {
        let legacy = r#"{
            "id": "id-1",
            "name": "local",
            "bootstrap_servers": "localhost:9092"
        }"#;
        let cluster: Cluster = serde_json::from_str(legacy).unwrap();
        assert_eq!(cluster.parent_group_id, None);
        assert_eq!(cluster.order, 0);
    }

    #[test]
    fn new_cluster_serializes_grouping_fields() {
        let c = Cluster {
            id: "id-1".into(),
            name: "x".into(),
            bootstrap_servers: "localhost:9092".into(),
            parent_group_id: Some("g-1".into()),
            order: 1024,
        };
        let json = serde_json::to_string(&c).unwrap();
        assert!(json.contains("\"parent_group_id\":\"g-1\""));
        assert!(json.contains("\"order\":1024"));
    }
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cargo test cluster::model`
Expected: compile error — fields don't exist.

- [ ] **Step 3: Add fields to the struct**

Replace the `Cluster` struct definition in `src/cluster/model.rs` with:

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Cluster {
    pub id: String,
    pub name: String,
    pub bootstrap_servers: String,
    #[serde(default)]
    pub parent_group_id: Option<String>,
    #[serde(default)]
    pub order: i32,
}
```

Also add the `MoveClusterRequest` DTO just below `CreateClusterRequest`:

```rust
#[derive(Debug, Deserialize)]
pub struct MoveClusterRequest {
    pub parent_group_id: Option<String>,
    pub order: i32,
}
```

- [ ] **Step 4: Fix the existing test constructor**

The existing `test_cluster_store_operations` test constructs a `Cluster` without the new fields and will no longer compile. Update it to include both:

```rust
        let cluster = Cluster {
            id: "id-1".to_string(),
            name: "local".to_string(),
            bootstrap_servers: "localhost:9092".to_string(),
            parent_group_id: None,
            order: 0,
        };
```

- [ ] **Step 5: Fix `create_cluster` handler**

`src/cluster/handler.rs` builds a `Cluster` literal that's now missing two fields. In the `create_cluster` function, replace the struct literal with:

```rust
    let cluster = Cluster {
        id: id.clone(),
        name: req.name,
        bootstrap_servers: req.bootstrap_servers,
        parent_group_id: None,
        order: 0,
    };
```

- [ ] **Step 6: Run tests**

Run: `cargo test cluster::model`
Expected: all 3 tests pass.

Run: `cargo check`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/cluster/
git commit -m "feat(cluster): add parent_group_id and order fields with serde defaults"
```

---

### Task 4: Extend `AppState` with `groups` and dual-file persistence

**Files:**
- Modify: `src/state.rs`

- [ ] **Step 1: Write the new state.rs**

Replace the entire contents of `src/state.rs` with:

```rust
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;

use crate::cluster::model::Cluster;
use crate::group::model::Group;

fn data_dir() -> std::path::PathBuf {
    if let Some(dir) = std::env::var_os("CARGO_MANIFEST_DIR") {
        return std::path::PathBuf::from(dir).join("data");
    }

    if let Ok(exe) = std::env::current_exe() {
        let mut dir = exe.parent();
        while let Some(d) = dir {
            if d.join("data").join("clusters.json").exists() {
                return d.join("data");
            }
            if d.join("Cargo.toml").exists() {
                return d.join("data");
            }
            dir = d.parent();
        }
    }

    std::path::PathBuf::from("data")
}

fn clusters_path() -> std::path::PathBuf {
    data_dir().join("clusters.json")
}

fn groups_path() -> std::path::PathBuf {
    data_dir().join("groups.json")
}

#[derive(Clone)]
pub struct AppState {
    pub clusters: Arc<RwLock<HashMap<String, Cluster>>>,
    pub groups: Arc<RwLock<HashMap<String, Group>>>,
}

impl AppState {
    pub async fn new() -> Self {
        let clusters = match tokio::fs::read_to_string(clusters_path()).await {
            Ok(content) => serde_json::from_str(&content).unwrap_or_default(),
            Err(_) => HashMap::new(),
        };
        let groups = match tokio::fs::read_to_string(groups_path()).await {
            Ok(content) => serde_json::from_str(&content).unwrap_or_default(),
            Err(_) => HashMap::new(),
        };
        Self {
            clusters: Arc::new(RwLock::new(clusters)),
            groups: Arc::new(RwLock::new(groups)),
        }
    }

    pub async fn save(&self) -> Result<(), std::io::Error> {
        let dir = data_dir();
        tokio::fs::create_dir_all(&dir).await?;

        let clusters = self.clusters.read().await;
        let json = serde_json::to_string_pretty(&*clusters)?;
        drop(clusters);
        tokio::fs::write(clusters_path(), json).await?;

        let groups = self.groups.read().await;
        let json = serde_json::to_string_pretty(&*groups)?;
        drop(groups);
        tokio::fs::write(groups_path(), json).await?;

        Ok(())
    }
}
```

- [ ] **Step 2: Compile check**

Run: `cargo check`
Expected: no errors.

- [ ] **Step 3: Smoke test**

Run: `cargo test`
Expected: existing tests still pass (the model tests don't depend on AppState).

- [ ] **Step 4: Commit**

```bash
git add src/state.rs
git commit -m "feat(state): persist clusters and groups to separate files"
```

---

### Task 5: Group CRUD handlers — list, create, patch

**Files:**
- Create: `src/group/handler.rs`
- Modify: `src/group/mod.rs`
- Modify: `src/error.rs` (add new variants)

- [ ] **Step 1: Extend `AppError`**

In `src/error.rs`, add three new variants and update `Display` + `IntoResponse`:

```rust
#[derive(Debug, Clone)]
pub enum AppError {
    ClusterNotFound,
    TopicNotFound,
    ConsumerGroupNotFound,
    GroupNotFound,
    GroupNotEmpty { group_count: usize, cluster_count: usize },
    CycleDetected,
    KafkaError(String),
    BadRequest(String),
}
```

In `Display::fmt`, add arms:

```rust
            AppError::GroupNotFound => write!(f, "Group not found"),
            AppError::GroupNotEmpty { group_count, cluster_count } => write!(
                f,
                "Group is not empty (contains {} subgroup(s) and {} cluster(s))",
                group_count, cluster_count
            ),
            AppError::CycleDetected => write!(f, "Move would create a cycle"),
```

In `IntoResponse::into_response`, add arms:

```rust
            AppError::GroupNotFound => (StatusCode::NOT_FOUND, self.to_string()),
            AppError::GroupNotEmpty { .. } => (StatusCode::CONFLICT, self.to_string()),
            AppError::CycleDetected => (StatusCode::CONFLICT, self.to_string()),
```

- [ ] **Step 2: Write `src/group/handler.rs`**

```rust
use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use regex::Regex;
use std::sync::OnceLock;

use crate::error::AppError;
use crate::group::model::{CreateGroupRequest, Group, UpdateGroupRequest};
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
            return Err(AppError::BadRequest(
                "color must match #RRGGBB".into(),
            ));
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

pub async fn list_groups(
    State(state): State<AppState>,
) -> Result<Json<Vec<Group>>, AppError> {
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
```

- [ ] **Step 3: Add `regex` dependency**

In `Cargo.toml` `[dependencies]`, add:

```toml
regex = "1"
```

- [ ] **Step 4: Update `src/group/mod.rs`**

```rust
pub mod handler;
pub mod model;
```

- [ ] **Step 5: Write tests for create/update/delete**

Append to `src/group/handler.rs`:

```rust
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
        let err = delete_group(
            axum::extract::State(state),
            axum::extract::Path(parent.id),
        )
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
        let status = delete_group(
            axum::extract::State(state),
            axum::extract::Path(g.id),
        )
        .await
        .unwrap();
        assert_eq!(status, StatusCode::NO_CONTENT);
    }
}
```

- [ ] **Step 6: Run tests**

Run: `cargo test group::handler`
Expected: 5 tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/group/ src/error.rs Cargo.toml Cargo.lock
git commit -m "feat(group): add list/create/update/delete handlers with validation"
```

---

### Task 6: Group move handler with cycle detection

**Files:**
- Modify: `src/group/handler.rs`

- [ ] **Step 1: Write the failing test**

Append to the `tests` module in `src/group/handler.rs`:

```rust
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
```

- [ ] **Step 2: Add `MoveGroupRequest` to the imports**

At the top of `src/group/handler.rs`, change the model import to include `MoveGroupRequest`:

```rust
use crate::group::model::{CreateGroupRequest, Group, MoveGroupRequest, UpdateGroupRequest};
```

- [ ] **Step 3: Implement `move_group`**

Append to `src/group/handler.rs` (before the `#[cfg(test)]` block):

```rust
fn collect_descendant_ids(groups: &HashMap<String, Group>, root_id: &str) -> std::collections::HashSet<String> {
    use std::collections::HashSet;
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

    let group = groups.get_mut(&id).unwrap();
    group.parent_id = req.parent_id;
    group.order = req.order;
    let updated = group.clone();
    drop(groups);
    let _ = state.save().await;
    Ok(Json(updated))
}
```

Note: this requires `use std::collections::HashMap;` at the top of the file. Add it next to the other imports.

- [ ] **Step 4: Run tests**

Run: `cargo test group::handler`
Expected: all tests pass (now 7).

- [ ] **Step 5: Commit**

```bash
git add src/group/handler.rs
git commit -m "feat(group): add move handler with cycle detection"
```

---

### Task 7: Cluster move handler

**Files:**
- Modify: `src/cluster/handler.rs`

- [ ] **Step 1: Write the failing test**

Append a test module to `src/cluster/handler.rs`:

```rust
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
```

- [ ] **Step 2: Implement `move_cluster`**

Append to `src/cluster/handler.rs` (before the `#[cfg(test)]` block):

```rust
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
```

- [ ] **Step 3: Run tests**

Run: `cargo test cluster::handler`
Expected: 3 tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/cluster/handler.rs
git commit -m "feat(cluster): add move handler that validates target group"
```

---

### Task 8: Wire group + move routes in router

**Files:**
- Modify: `src/api/router.rs`

- [ ] **Step 1: Update imports and add routes**

Replace the entire `src/api/router.rs` with:

```rust
use axum::routing::{delete, get, patch, post};
use axum::Router;
use tower_http::cors::CorsLayer;

use crate::cluster::handler::{create_cluster, delete_cluster, list_clusters, move_cluster};
use crate::consumer::handler::{
    get_consumer_group_lag_handler, list_consumer_groups_handler,
};
use crate::group::handler::{create_group, delete_group, list_groups, move_group, update_group};
use crate::state::AppState;
use crate::topic::handler::{
    create_topic_handler, delete_topic_handler, fetch_messages_handler,
    get_topic_counts_handler, list_topics_handler, produce_message_handler,
    topic_detail_full_handler, topic_detail_handler,
};

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/clusters", get(list_clusters).post(create_cluster))
        .route("/clusters/{id}", delete(delete_cluster))
        .route("/clusters/{id}/move", post(move_cluster))
        .route("/clusters/{id}/topics", get(list_topics_handler).post(create_topic_handler))
        .route("/clusters/{id}/topics/counts", post(get_topic_counts_handler))
        .route("/clusters/{id}/topics/{name}", get(topic_detail_handler).delete(delete_topic_handler))
        .route("/clusters/{id}/topics/{name}/detail", get(topic_detail_full_handler))
        .route("/clusters/{id}/topics/{name}/messages", get(fetch_messages_handler))
        .route("/clusters/{id}/topics/{name}/messages/produce", post(produce_message_handler))
        .route("/clusters/{id}/consumer-groups", get(list_consumer_groups_handler))
        .route("/clusters/{id}/consumer-groups/{name}/lag", get(get_consumer_group_lag_handler))
        .route("/groups", get(list_groups).post(create_group))
        .route("/groups/{id}", patch(update_group).delete(delete_group))
        .route("/groups/{id}/move", post(move_group))
        .layer(CorsLayer::permissive())
}
```

- [ ] **Step 2: End-to-end check**

Run: `cargo run` (background)
In another terminal:
```bash
curl -s -X POST http://localhost:8080/api/groups -H "Content-Type: application/json" \
  -d '{"name":"test-group"}'
curl -s http://localhost:8080/api/groups
```
Expected: first returns created group JSON; second returns array containing it.

Stop the server.

- [ ] **Step 3: Commit**

```bash
git add src/api/router.rs
git commit -m "feat(api): wire /api/groups and /move routes"
```

---

## Phase 1 Checkpoint

At this point the backend supports group CRUD, group moves with cycle detection, and cluster moves — all persisted to `data/groups.json` and `data/clusters.json`.

Run `cargo test` and confirm all tests pass before moving to Phase 2.

---

## Phase 2 — Frontend data layer (no UI changes)

### Task 9: Extend TypeScript types

**Files:**
- Modify: `frontend/src/types/index.ts`

- [ ] **Step 1: Update Cluster and add Group + Selection**

Edit `frontend/src/types/index.ts`. Replace the existing `Cluster` interface with:

```ts
export interface Cluster {
  id: string;
  name: string;
  bootstrap_servers: string;
  parent_group_id: string | null;
  order: number;
}

export interface Group {
  id: string;
  name: string;
  parent_id: string | null;
  color: string | null;
  icon: string | null;
  description: string | null;
  order: number;
}

export type Selection =
  | { kind: 'all' }
  | { kind: 'ungrouped' }
  | { kind: 'group'; id: string };

export type ViewMode = 'direct' | 'recursive';
```

Leave the rest of the file (Topic/Consumer types) untouched.

- [ ] **Step 2: Compile check**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors. (Note: TypeScript may warn that existing code passes a `Cluster` without the new fields. Those usage sites will be fixed in subsequent tasks; ignore for now if they only appear in `ClusterListPage.tsx`, which Task 18 rewrites.)

- [ ] **Step 3: Commit**

```bash
git add frontend/src/types/index.ts
git commit -m "feat(types): extend Cluster with grouping fields and add Group/Selection"
```

---

### Task 10: Groups API client

**Files:**
- Create: `frontend/src/api/groups.ts`

- [ ] **Step 1: Write the client**

```ts
import { api } from './client';
import type { Group } from '../types';

export const listGroups = () =>
  api.get<Group[]>('/groups').then((r) => r.data);

export const createGroup = (data: {
  name: string;
  parent_id?: string | null;
  color?: string | null;
  icon?: string | null;
  description?: string | null;
}) => api.post<Group>('/groups', data).then((r) => r.data);

export const updateGroup = (
  id: string,
  data: {
    name?: string;
    color?: string | null;
    icon?: string | null;
    description?: string | null;
  }
) => api.patch<Group>(`/groups/${id}`, data).then((r) => r.data);

export const deleteGroup = (id: string) =>
  api.delete(`/groups/${id}`);

export const moveGroup = (
  id: string,
  data: { parent_id: string | null; order: number }
) => api.post<Group>(`/groups/${id}/move`, data).then((r) => r.data);
```

- [ ] **Step 2: Compile check**

Run: `cd frontend && npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/api/groups.ts
git commit -m "feat(api): add groups client (list/create/update/delete/move)"
```

---

### Task 11: Add `moveCluster` to clusters API

**Files:**
- Modify: `frontend/src/api/clusters.ts`

- [ ] **Step 1: Add the function**

Append to `frontend/src/api/clusters.ts`:

```ts
export const moveCluster = (
  id: string,
  data: { parent_group_id: string | null; order: number }
) => api.post<Cluster>(`/clusters/${id}/move`, data).then((r) => r.data);
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/api/clusters.ts
git commit -m "feat(api): add moveCluster"
```

---

### Task 12: `useClusterTree` — pure assembly hook + tests

**Files:**
- Create: `frontend/src/hooks/useClusterTree.ts`
- Create: `frontend/src/hooks/useClusterTree.test.ts`

- [ ] **Step 1: Define types and write the failing test**

Create `frontend/src/hooks/useClusterTree.ts`:

```ts
import { useMemo } from 'react';
import type { Cluster, Group } from '../types';

export interface GroupTreeNode {
  group: Group;
  children: GroupTreeNode[];
  clusters: Cluster[];
  depth: number;
}

export interface ClusterTree {
  roots: GroupTreeNode[];
  ungrouped: Cluster[];
  byId: Map<string, GroupTreeNode>;
}

export function assembleClusterTree(
  groups: Group[],
  clusters: Cluster[]
): ClusterTree {
  const sortFn = <T extends { id: string; order: number }>(a: T, b: T) =>
    a.order === b.order ? a.id.localeCompare(b.id) : a.order - b.order;

  const sortedGroups = [...groups].sort(sortFn);
  const sortedClusters = [...clusters].sort(sortFn);

  const byId = new Map<string, GroupTreeNode>();
  for (const g of sortedGroups) {
    byId.set(g.id, { group: g, children: [], clusters: [], depth: 0 });
  }

  const roots: GroupTreeNode[] = [];
  for (const g of sortedGroups) {
    const node = byId.get(g.id)!;
    if (g.parent_id && byId.has(g.parent_id)) {
      const parent = byId.get(g.parent_id)!;
      node.depth = parent.depth + 1;
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }

  const ungrouped: Cluster[] = [];
  for (const c of sortedClusters) {
    if (c.parent_group_id && byId.has(c.parent_group_id)) {
      byId.get(c.parent_group_id)!.clusters.push(c);
    } else {
      ungrouped.push(c);
    }
  }

  return { roots, ungrouped, byId };
}

export function collectDescendantClusters(node: GroupTreeNode): Cluster[] {
  const out: Cluster[] = [...node.clusters];
  for (const child of node.children) {
    out.push(...collectDescendantClusters(child));
  }
  return out;
}

export function collectDescendantGroupIds(node: GroupTreeNode): Set<string> {
  const out = new Set<string>();
  const walk = (n: GroupTreeNode) => {
    for (const c of n.children) {
      out.add(c.group.id);
      walk(c);
    }
  };
  walk(node);
  return out;
}

export function useClusterTree(groups: Group[], clusters: Cluster[]): ClusterTree {
  return useMemo(() => assembleClusterTree(groups, clusters), [groups, clusters]);
}
```

Create `frontend/src/hooks/useClusterTree.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  assembleClusterTree,
  collectDescendantClusters,
  collectDescendantGroupIds,
} from './useClusterTree';
import type { Cluster, Group } from '../types';

const g = (id: string, parent: string | null, order = 0): Group => ({
  id,
  name: id,
  parent_id: parent,
  color: null,
  icon: null,
  description: null,
  order,
});

const c = (
  id: string,
  parent: string | null,
  order = 0
): Cluster => ({
  id,
  name: id,
  bootstrap_servers: 'localhost:9092',
  parent_group_id: parent,
  order,
});

describe('assembleClusterTree', () => {
  it('places top-level groups under roots', () => {
    const tree = assembleClusterTree([g('A', null), g('B', null)], []);
    expect(tree.roots.map((r) => r.group.id)).toEqual(['A', 'B']);
  });

  it('nests child groups under their parent', () => {
    const tree = assembleClusterTree(
      [g('A', null), g('A1', 'A'), g('A2', 'A')],
      []
    );
    expect(tree.roots).toHaveLength(1);
    expect(tree.roots[0].children.map((c) => c.group.id)).toEqual(['A1', 'A2']);
  });

  it('sorts siblings by (order, id)', () => {
    const tree = assembleClusterTree(
      [g('Z', null, 10), g('A', null, 10), g('M', null, 5)],
      []
    );
    expect(tree.roots.map((r) => r.group.id)).toEqual(['M', 'A', 'Z']);
  });

  it('puts clusters with unknown parent into ungrouped', () => {
    const tree = assembleClusterTree([], [c('cl', 'missing-group')]);
    expect(tree.ungrouped.map((cl) => cl.id)).toEqual(['cl']);
  });

  it('puts clusters with null parent into ungrouped', () => {
    const tree = assembleClusterTree([], [c('cl', null)]);
    expect(tree.ungrouped.map((cl) => cl.id)).toEqual(['cl']);
  });

  it('attaches clusters to their groups', () => {
    const tree = assembleClusterTree(
      [g('A', null)],
      [c('cl1', 'A'), c('cl2', 'A')]
    );
    expect(tree.roots[0].clusters.map((c) => c.id)).toEqual(['cl1', 'cl2']);
  });

  it('sets depth based on parent chain', () => {
    const tree = assembleClusterTree(
      [g('A', null), g('A1', 'A'), g('A1a', 'A1')],
      []
    );
    expect(tree.roots[0].depth).toBe(0);
    expect(tree.roots[0].children[0].depth).toBe(1);
    expect(tree.roots[0].children[0].children[0].depth).toBe(2);
  });
});

describe('collectDescendantClusters', () => {
  it('collects clusters from self + all descendants', () => {
    const tree = assembleClusterTree(
      [g('A', null), g('A1', 'A')],
      [c('top', 'A'), c('nested', 'A1')]
    );
    const ids = collectDescendantClusters(tree.roots[0]).map((c) => c.id);
    expect(ids).toEqual(['top', 'nested']);
  });
});

describe('collectDescendantGroupIds', () => {
  it('returns all nested group ids (excluding self)', () => {
    const tree = assembleClusterTree(
      [g('A', null), g('A1', 'A'), g('A1a', 'A1'), g('B', null)],
      []
    );
    const ids = collectDescendantGroupIds(tree.roots[0]);
    expect([...ids].sort()).toEqual(['A1', 'A1a']);
  });
});
```

- [ ] **Step 2: Install vitest as a dev dep**

Run from `frontend/`:
```bash
cd frontend && npm install --save-dev vitest
```

Add a `test` script to `frontend/package.json`'s `"scripts"`:
```json
    "test": "vitest run"
```

- [ ] **Step 3: Run the tests**

Run: `cd frontend && npm test`
Expected: 9 tests pass.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/hooks/ frontend/package.json frontend/package-lock.json
git commit -m "feat(hooks): add useClusterTree assembly with unit tests"
```

---

## Phase 2 Checkpoint

Frontend now has types, API clients, and a tested assembly hook. UI still shows the old single-list layout — no visible change yet.

---

## Phase 3 — Static UI (no drag yet)

### Task 13: Extract `ClusterCard` from `ClusterListPage`

**Files:**
- Create: `frontend/src/components/cluster/ClusterCard.tsx`

- [ ] **Step 1: Write the component**

```tsx
import { Link } from 'react-router-dom';
import type { Cluster } from '../../types';

interface Props {
  cluster: Cluster;
  onDelete: (id: string) => void;
  /** Animation delay in seconds (optional). */
  animationDelay?: number;
}

export default function ClusterCard({ cluster, onDelete, animationDelay = 0 }: Props) {
  return (
    <div
      className="glass-panel rounded-2xl p-6 glow-border group animate-fade-in-up"
      style={{ animationDelay: `${animationDelay}s` }}
    >
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500/20 to-orange-600/10 border border-amber-500/20 flex items-center justify-center">
            <svg className="w-5 h-5 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
            </svg>
          </div>
          <div>
            <h3 className="font-display text-lg font-semibold text-slate-100 group-hover:text-amber-400 transition-colors">
              {cluster.name}
            </h3>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-xs text-slate-500 font-mono-data">ACTIVE</span>
            </div>
          </div>
        </div>
        <button
          className="btn-danger rounded-lg px-3 py-1.5 text-xs opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={() => onDelete(cluster.id)}
        >
          Delete
        </button>
      </div>

      <div className="mb-5">
        <div className="text-xs text-slate-500 mb-1 font-mono-data uppercase tracking-wider">
          Bootstrap Servers
        </div>
        <div className="font-mono-data text-sm text-cyan-400 bg-cyan-500/5 border border-cyan-500/10 rounded-lg px-3 py-2">
          {cluster.bootstrap_servers}
        </div>
      </div>

      <Link
        to={`/clusters/${cluster.id}/topics`}
        className="block w-full text-center py-2.5 rounded-xl bg-slate-800/50 border border-white/5 text-slate-300 text-sm font-medium hover:bg-cyan-500/10 hover:border-cyan-500/20 hover:text-cyan-400 transition-all"
      >
        Browse Topics →
      </Link>
    </div>
  );
}
```

- [ ] **Step 2: Compile check**

Run: `cd frontend && npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/
git commit -m "feat(components): extract ClusterCard from ClusterListPage"
```

---

### Task 14: `IconPicker` component

**Files:**
- Create: `frontend/src/components/cluster/IconPicker.tsx`

- [ ] **Step 1: Write the picker**

```tsx
const PRESET_ICONS = [
  '🛒', '📦', '🔧', '🎯', '🚀', '⚙️', '🧪', '📊',
  '🔐', '💾', '📡', '🌐', '🎨', '🏷️', '🔔', '⭐',
];

interface Props {
  value: string | null;
  onChange: (icon: string | null) => void;
}

export default function IconPicker({ value, onChange }: Props) {
  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        onClick={() => onChange(null)}
        className={`w-9 h-9 rounded-lg border text-xs flex items-center justify-center transition-colors ${
          value === null
            ? 'border-cyan-500/60 bg-cyan-500/10 text-cyan-400'
            : 'border-white/10 text-slate-500 hover:border-white/20'
        }`}
        title="No icon"
      >
        ∅
      </button>
      {PRESET_ICONS.map((icon) => (
        <button
          key={icon}
          type="button"
          onClick={() => onChange(icon)}
          className={`w-9 h-9 rounded-lg border text-lg flex items-center justify-center transition-colors ${
            value === icon
              ? 'border-amber-500/60 bg-amber-500/10'
              : 'border-white/10 hover:border-white/30'
          }`}
        >
          {icon}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/cluster/IconPicker.tsx
git commit -m "feat(components): add IconPicker with preset emojis"
```

---

### Task 15: `GroupEditModal` (create + edit)

**Files:**
- Create: `frontend/src/components/cluster/GroupEditModal.tsx`

- [ ] **Step 1: Write the modal**

```tsx
import { useEffect, useState } from 'react';
import type { Group } from '../../types';
import IconPicker from './IconPicker';

const PRESET_COLORS = [
  '#f59e0b', '#22d3ee', '#a78bfa', '#34d399',
  '#f87171', '#fb923c', '#60a5fa', '#e879f9',
];

interface Props {
  /** When editing existing group, pass it here. When creating new, pass null. */
  group: Group | null;
  /** Used as parent_id when creating a new group (ignored when editing). */
  parentId: string | null;
  open: boolean;
  saving?: boolean;
  errorMessage?: string | null;
  onClose: () => void;
  onSave: (data: {
    name: string;
    color: string | null;
    icon: string | null;
    description: string | null;
    /** Only meaningful when creating. */
    parent_id?: string | null;
  }) => void;
}

export default function GroupEditModal({
  group,
  parentId,
  open,
  saving,
  errorMessage,
  onClose,
  onSave,
}: Props) {
  const isEdit = group !== null;
  const [name, setName] = useState('');
  const [color, setColor] = useState<string | null>(null);
  const [icon, setIcon] = useState<string | null>(null);
  const [description, setDescription] = useState('');

  useEffect(() => {
    if (!open) return;
    setName(group?.name ?? '');
    setColor(group?.color ?? null);
    setIcon(group?.icon ?? null);
    setDescription(group?.description ?? '');
  }, [open, group]);

  if (!open) return null;

  const submit = () => {
    if (!name.trim()) return;
    onSave({
      name: name.trim(),
      color,
      icon,
      description: description.trim() || null,
      ...(isEdit ? {} : { parent_id: parentId }),
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="glass-panel rounded-2xl p-6 w-full max-w-md mx-4 glow-border">
        <h2 className="font-display text-xl font-bold text-slate-100 mb-4">
          {isEdit ? 'Edit Group' : 'New Group'}
        </h2>

        <div className="space-y-4">
          <div>
            <label className="block text-xs uppercase tracking-wider text-slate-500 mb-1 font-mono-data">
              Name
            </label>
            <input
              autoFocus
              className="terminal-input rounded-xl px-4 py-2 text-sm w-full"
              maxLength={64}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-xs uppercase tracking-wider text-slate-500 mb-1 font-mono-data">
              Color
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setColor(null)}
                className={`w-9 h-9 rounded-lg border text-xs flex items-center justify-center ${
                  color === null
                    ? 'border-cyan-500/60 bg-cyan-500/10 text-cyan-400'
                    : 'border-white/10 text-slate-500 hover:border-white/20'
                }`}
                title="No color"
              >
                ∅
              </button>
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={`w-9 h-9 rounded-lg border-2 ${
                    color === c ? 'border-white' : 'border-white/10'
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs uppercase tracking-wider text-slate-500 mb-1 font-mono-data">
              Icon
            </label>
            <IconPicker value={icon} onChange={setIcon} />
          </div>

          <div>
            <label className="block text-xs uppercase tracking-wider text-slate-500 mb-1 font-mono-data">
              Description
            </label>
            <textarea
              className="terminal-input rounded-xl px-4 py-2 text-sm w-full resize-none"
              rows={2}
              maxLength={200}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          {errorMessage && (
            <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
              {errorMessage}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-sm text-slate-300 hover:bg-white/5 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={saving || !name.trim()}
            className="btn-primary rounded-xl px-4 py-2 text-sm disabled:opacity-50"
          >
            {saving ? 'Saving…' : isEdit ? 'Save' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/cluster/GroupEditModal.tsx
git commit -m "feat(components): add GroupEditModal for create/edit"
```

---

### Task 16: `GroupNode` and `ClusterTree` (no drag yet)

**Files:**
- Create: `frontend/src/components/cluster/GroupNode.tsx`
- Create: `frontend/src/components/cluster/ClusterTree.tsx`

- [ ] **Step 1: Write `GroupNode.tsx`**

```tsx
import type { GroupTreeNode } from '../../hooks/useClusterTree';
import type { Selection } from '../../types';

interface Props {
  node: GroupTreeNode;
  selection: Selection;
  expandedIds: Set<string>;
  onToggle: (id: string) => void;
  onSelect: (sel: Selection) => void;
  onEdit: (node: GroupTreeNode) => void;
  onAddChild: (parentId: string) => void;
  onDelete: (node: GroupTreeNode) => void;
}

export default function GroupNode({
  node,
  selection,
  expandedIds,
  onToggle,
  onSelect,
  onEdit,
  onAddChild,
  onDelete,
}: Props) {
  const expanded = expandedIds.has(node.group.id);
  const isSelected = selection.kind === 'group' && selection.id === node.group.id;
  const childCount = node.children.length + node.clusters.length;
  const canExpand = node.children.length > 0 || node.clusters.length > 0;
  const isEmpty = childCount === 0;

  return (
    <div>
      <div
        className={`group flex items-center gap-1 px-2 py-1.5 rounded-lg cursor-pointer transition-colors ${
          isSelected
            ? 'bg-amber-500/10 text-amber-400'
            : 'hover:bg-white/5 text-slate-300'
        }`}
        style={{ paddingLeft: `${8 + node.depth * 16}px` }}
        onClick={() => {
          onSelect({ kind: 'group', id: node.group.id });
          if (!expanded && canExpand) onToggle(node.group.id);
        }}
      >
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggle(node.group.id);
          }}
          className={`w-4 h-4 flex items-center justify-center text-slate-500 hover:text-slate-300 ${
            canExpand ? '' : 'opacity-30 cursor-default'
          }`}
        >
          {canExpand ? (expanded ? '▾' : '▸') : '·'}
        </button>

        {node.group.icon && <span className="text-sm">{node.group.icon}</span>}

        <span
          className="flex-1 text-sm truncate"
          style={node.group.color ? { color: node.group.color } : undefined}
        >
          {node.group.name}
        </span>

        <span className="text-xs text-slate-500 font-mono-data">{childCount}</span>

        <button
          type="button"
          className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-slate-300 px-1"
          onClick={(e) => {
            e.stopPropagation();
            const action = window.prompt(
              'Action: e (edit), a (add child), d (delete)',
              'e'
            );
            if (action === 'e') onEdit(node);
            else if (action === 'a') onAddChild(node.group.id);
            else if (action === 'd') {
              if (isEmpty) onDelete(node);
              else window.alert('Group not empty — cannot delete');
            }
          }}
          title="Group actions"
        >
          ⋯
        </button>
      </div>

      {expanded && (
        <div>
          {node.children.map((child) => (
            <GroupNode
              key={child.group.id}
              node={child}
              selection={selection}
              expandedIds={expandedIds}
              onToggle={onToggle}
              onSelect={onSelect}
              onEdit={onEdit}
              onAddChild={onAddChild}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}
```

Note: the `⋯` button uses `window.prompt` as a placeholder menu. Task 17's polish task can replace it with a proper dropdown. The behavior already wires through all three actions correctly.

- [ ] **Step 2: Write `ClusterTree.tsx`**

```tsx
import type { ClusterTree as Tree } from '../../hooks/useClusterTree';
import type { Selection } from '../../types';
import GroupNode from './GroupNode';
import type { GroupTreeNode } from '../../hooks/useClusterTree';

interface Props {
  tree: Tree;
  selection: Selection;
  expandedIds: Set<string>;
  onToggle: (id: string) => void;
  onSelect: (sel: Selection) => void;
  onEditGroup: (node: GroupTreeNode) => void;
  onAddChildGroup: (parentId: string) => void;
  onDeleteGroup: (node: GroupTreeNode) => void;
}

export default function ClusterTree({
  tree,
  selection,
  expandedIds,
  onToggle,
  onSelect,
  onEditGroup,
  onAddChildGroup,
  onDeleteGroup,
}: Props) {
  return (
    <div className="text-sm space-y-0.5">
      <button
        type="button"
        onClick={() => onSelect({ kind: 'all' })}
        className={`w-full text-left px-2 py-1.5 rounded-lg transition-colors ${
          selection.kind === 'all'
            ? 'bg-amber-500/10 text-amber-400'
            : 'hover:bg-white/5 text-slate-300'
        }`}
      >
        <span className="mr-1">▾</span>
        All Clusters
      </button>

      {tree.roots.map((node) => (
        <GroupNode
          key={node.group.id}
          node={node}
          selection={selection}
          expandedIds={expandedIds}
          onToggle={onToggle}
          onSelect={onSelect}
          onEdit={onEditGroup}
          onAddChild={onAddChildGroup}
          onDelete={onDeleteGroup}
        />
      ))}

      <button
        type="button"
        onClick={() => onSelect({ kind: 'ungrouped' })}
        className={`w-full text-left px-2 py-1.5 rounded-lg transition-colors ${
          selection.kind === 'ungrouped'
            ? 'bg-amber-500/10 text-amber-400'
            : 'hover:bg-white/5 text-slate-400'
        }`}
      >
        <span className="mr-1">▸</span>
        Ungrouped <span className="text-xs text-slate-500 font-mono-data ml-1">({tree.ungrouped.length})</span>
      </button>
    </div>
  );
}
```

- [ ] **Step 3: Compile check**

Run: `cd frontend && npx tsc --noEmit`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/cluster/
git commit -m "feat(components): add GroupNode and ClusterTree (no drag yet)"
```

---

### Task 17: `ClusterDetailPanel`

**Files:**
- Create: `frontend/src/components/cluster/ClusterDetailPanel.tsx`

- [ ] **Step 1: Write the panel**

```tsx
import type { Cluster, Selection, ViewMode } from '../../types';
import type { ClusterTree, GroupTreeNode } from '../../hooks/useClusterTree';
import { collectDescendantClusters } from '../../hooks/useClusterTree';
import ClusterCard from './ClusterCard';

interface Props {
  tree: ClusterTree;
  selection: Selection;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  onDeleteCluster: (id: string) => void;
  onOpenAddCluster: () => void;
}

function clustersForSelection(
  tree: ClusterTree,
  selection: Selection,
  viewMode: ViewMode
): Cluster[] {
  if (selection.kind === 'all') {
    const fromGroups = tree.roots.flatMap((r) => collectDescendantClusters(r));
    return [...fromGroups, ...tree.ungrouped];
  }
  if (selection.kind === 'ungrouped') {
    return tree.ungrouped;
  }
  const node: GroupTreeNode | undefined = tree.byId.get(selection.id);
  if (!node) return [];
  return viewMode === 'direct' ? node.clusters : collectDescendantClusters(node);
}

function titleFor(tree: ClusterTree, selection: Selection): string {
  if (selection.kind === 'all') return 'All Clusters';
  if (selection.kind === 'ungrouped') return 'Ungrouped';
  return tree.byId.get(selection.id)?.group.name ?? 'Unknown group';
}

export default function ClusterDetailPanel({
  tree,
  selection,
  viewMode,
  onViewModeChange,
  onDeleteCluster,
  onOpenAddCluster,
}: Props) {
  const clusters = clustersForSelection(tree, selection, viewMode);
  const showViewToggle = selection.kind === 'group';
  const title = titleFor(tree, selection);

  return (
    <div className="flex-1 min-w-0">
      <div className="flex items-center justify-between mb-5 gap-3">
        <h2 className="font-display text-xl font-semibold text-slate-200 truncate">{title}</h2>
        <div className="flex items-center gap-3">
          {showViewToggle && (
            <div className="flex items-center gap-1 text-xs font-mono-data">
              <button
                type="button"
                onClick={() => onViewModeChange('direct')}
                className={`px-3 py-1.5 rounded-lg border ${
                  viewMode === 'direct'
                    ? 'border-cyan-500/40 bg-cyan-500/10 text-cyan-400'
                    : 'border-white/10 text-slate-500 hover:border-white/20'
                }`}
              >
                Direct
              </button>
              <button
                type="button"
                onClick={() => onViewModeChange('recursive')}
                className={`px-3 py-1.5 rounded-lg border ${
                  viewMode === 'recursive'
                    ? 'border-cyan-500/40 bg-cyan-500/10 text-cyan-400'
                    : 'border-white/10 text-slate-500 hover:border-white/20'
                }`}
              >
                Recursive
              </button>
            </div>
          )}
          <button
            type="button"
            onClick={onOpenAddCluster}
            className="btn-primary rounded-xl px-4 py-2 text-sm whitespace-nowrap"
          >
            + Add Cluster
          </button>
        </div>
      </div>

      {clusters.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {clusters.map((c, idx) => (
            <ClusterCard
              key={c.id}
              cluster={c}
              onDelete={onDeleteCluster}
              animationDelay={0.05 * idx}
            />
          ))}
        </div>
      ) : (
        <div className="glass-panel rounded-2xl p-16 text-center">
          <p className="text-slate-500 font-display text-lg mb-1">
            {selection.kind === 'all'
              ? 'No clusters connected'
              : `No clusters in ${title}`}
          </p>
          <p className="text-slate-600 text-sm">
            Drag clusters here or click + Add Cluster.
          </p>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/cluster/ClusterDetailPanel.tsx
git commit -m "feat(components): add ClusterDetailPanel with view-mode toggle"
```

---

### Task 18: Rewrite `ClusterListPage` to two-column layout

**Files:**
- Modify: `frontend/src/pages/ClusterListPage.tsx`

- [ ] **Step 1: Replace the page**

Replace the entire contents of `frontend/src/pages/ClusterListPage.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createCluster, deleteCluster, listClusters } from '../api/clusters';
import {
  createGroup,
  deleteGroup,
  listGroups,
  updateGroup,
} from '../api/groups';
import { useClusterTree } from '../hooks/useClusterTree';
import type { Group, Selection, ViewMode } from '../types';
import ClusterTree from '../components/cluster/ClusterTree';
import ClusterDetailPanel from '../components/cluster/ClusterDetailPanel';
import GroupEditModal from '../components/cluster/GroupEditModal';
import type { GroupTreeNode } from '../hooks/useClusterTree';

const EXPANDED_KEY = 'kafka-ui:expanded-group-ids';

function loadExpanded(): Set<string> {
  try {
    const raw = localStorage.getItem(EXPANDED_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

export default function ClusterListPage() {
  const queryClient = useQueryClient();

  const { data: clusters = [], isLoading: cl } = useQuery({
    queryKey: ['clusters'],
    queryFn: listClusters,
  });
  const { data: groups = [], isLoading: gl } = useQuery({
    queryKey: ['groups'],
    queryFn: listGroups,
  });
  const tree = useClusterTree(groups, clusters);

  const [selection, setSelection] = useState<Selection>({ kind: 'all' });
  const [viewMode, setViewMode] = useState<ViewMode>('recursive');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(loadExpanded);
  const [showAddCluster, setShowAddCluster] = useState(false);
  const [name, setName] = useState('');
  const [bootstrapServers, setBootstrapServers] = useState('');

  // Group modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<Group | null>(null);
  const [modalParentId, setModalParentId] = useState<string | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);

  // Sync expandedIds → localStorage, pruning ids that no longer exist
  useEffect(() => {
    const existing = new Set(groups.map((g) => g.id));
    const pruned = new Set([...expandedIds].filter((id) => existing.has(id)));
    if (pruned.size !== expandedIds.size) {
      setExpandedIds(pruned);
    }
    try {
      localStorage.setItem(EXPANDED_KEY, JSON.stringify([...pruned]));
    } catch {
      /* ignore */
    }
  }, [groups, expandedIds]);

  const createClusterMutation = useMutation({
    mutationFn: createCluster,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clusters'] });
      setName('');
      setBootstrapServers('');
      setShowAddCluster(false);
    },
  });

  const deleteClusterMutation = useMutation({
    mutationFn: deleteCluster,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clusters'] });
    },
  });

  const createGroupMutation = useMutation({
    mutationFn: createGroup,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['groups'] });
      setModalOpen(false);
      setModalError(null);
    },
    onError: (e: unknown) => {
      const message = extractError(e);
      setModalError(message);
    },
  });

  const updateGroupMutation = useMutation({
    mutationFn: ({ id, ...data }: { id: string; name?: string; color?: string | null; icon?: string | null; description?: string | null }) =>
      updateGroup(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['groups'] });
      setModalOpen(false);
      setModalError(null);
    },
    onError: (e: unknown) => {
      setModalError(extractError(e));
    },
  });

  const deleteGroupMutation = useMutation({
    mutationFn: deleteGroup,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['groups'] });
    },
    onError: (e: unknown) => {
      window.alert(extractError(e));
    },
  });

  if (cl || gl) {
    return (
      <div className="max-w-7xl mx-auto px-6 py-12 flex items-center justify-center">
        <div className="flex items-center gap-3 text-slate-500 font-mono-data">
          <div className="w-5 h-5 border-2 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin" />
          INITIALIZING...
        </div>
      </div>
    );
  }

  const toggleExpanded = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const openCreateGroup = () => {
    setEditingGroup(null);
    setModalParentId(selection.kind === 'group' ? selection.id : null);
    setModalError(null);
    setModalOpen(true);
  };

  const openEditGroup = (node: GroupTreeNode) => {
    setEditingGroup(node.group);
    setModalParentId(node.group.parent_id);
    setModalError(null);
    setModalOpen(true);
  };

  const openCreateChildGroup = (parentId: string) => {
    setEditingGroup(null);
    setModalParentId(parentId);
    setModalError(null);
    setModalOpen(true);
  };

  const handleSaveGroup = (data: {
    name: string;
    color: string | null;
    icon: string | null;
    description: string | null;
    parent_id?: string | null;
  }) => {
    if (editingGroup) {
      updateGroupMutation.mutate({
        id: editingGroup.id,
        name: data.name,
        color: data.color,
        icon: data.icon,
        description: data.description,
      });
    } else {
      createGroupMutation.mutate({
        ...data,
        parent_id: data.parent_id ?? null,
      });
    }
  };

  const handleAddCluster = () => {
    createClusterMutation.mutate({
      name,
      bootstrap_servers: bootstrapServers,
    });
  };

  return (
    <div className="max-w-7xl mx-auto px-6 py-10">
      <div className="mb-8 flex items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl font-bold text-gradient-amber mb-1">Clusters</h1>
          <p className="text-slate-500 text-sm">Manage your Kafka cluster connections</p>
        </div>
        <button
          type="button"
          onClick={openCreateGroup}
          className="btn-primary rounded-xl px-4 py-2 text-sm whitespace-nowrap"
        >
          + New Group
        </button>
      </div>

      <div className="flex flex-col md:flex-row gap-6">
        <aside className="md:w-72 md:flex-shrink-0 glass-panel rounded-2xl p-3">
          <ClusterTree
            tree={tree}
            selection={selection}
            expandedIds={expandedIds}
            onToggle={toggleExpanded}
            onSelect={setSelection}
            onEditGroup={openEditGroup}
            onAddChildGroup={openCreateChildGroup}
            onDeleteGroup={(node) => deleteGroupMutation.mutate(node.group.id)}
          />
        </aside>

        <div className="flex-1 min-w-0">
          {showAddCluster && (
            <div className="glass-panel rounded-2xl p-5 mb-5 glow-border">
              <div className="flex flex-col sm:flex-row gap-3">
                <input
                  autoFocus
                  className="terminal-input rounded-xl px-4 py-2 text-sm flex-1"
                  placeholder="Cluster name..."
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
                <input
                  className="terminal-input rounded-xl px-4 py-2 text-sm flex-[2]"
                  placeholder="localhost:9092"
                  value={bootstrapServers}
                  onChange={(e) => setBootstrapServers(e.target.value)}
                />
                <button
                  type="button"
                  className="btn-primary rounded-xl px-4 py-2 text-sm"
                  onClick={handleAddCluster}
                  disabled={!name.trim() || !bootstrapServers.trim()}
                >
                  Connect
                </button>
                <button
                  type="button"
                  className="px-4 py-2 rounded-xl text-sm text-slate-400 hover:bg-white/5"
                  onClick={() => setShowAddCluster(false)}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
          <ClusterDetailPanel
            tree={tree}
            selection={selection}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            onDeleteCluster={(id) => deleteClusterMutation.mutate(id)}
            onOpenAddCluster={() => setShowAddCluster(true)}
          />
        </div>
      </div>

      <GroupEditModal
        group={editingGroup}
        parentId={modalParentId}
        open={modalOpen}
        saving={createGroupMutation.isPending || updateGroupMutation.isPending}
        errorMessage={modalError}
        onClose={() => setModalOpen(false)}
        onSave={handleSaveGroup}
      />
    </div>
  );
}

function extractError(e: unknown): string {
  type AxiosLike = { response?: { data?: { error?: string } }; message?: string };
  const ax = e as AxiosLike;
  return ax?.response?.data?.error ?? ax?.message ?? 'Unknown error';
}
```

- [ ] **Step 2: Manual smoke test**

Start backend + frontend dev servers, open `http://localhost:5173`.
Verify in browser:
- Tree shows "All Clusters", "Ungrouped" rows
- Existing clusters appear under Ungrouped
- Clicking "+ New Group" opens the modal
- Creating a group adds it to the tree
- Editing a group via the `⋯` button → "e" updates name/color
- Deleting an empty group works
- Deleting a non-empty group shows an alert

(The `window.prompt`/`window.alert` UX is a placeholder; functionality matters here.)

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/ClusterListPage.tsx
git commit -m "feat(page): rewrite ClusterListPage to two-column tree layout"
```

---

## Phase 3 Checkpoint

UI now shows tree + detail panel, full CRUD on groups works, the "Add Cluster" inline form is preserved. No drag-and-drop yet — clusters can only be moved by editing JSON.

---

## Phase 4 — Drag & Drop

### Task 19: Install `@dnd-kit` and add a no-op `DndContext`

**Files:**
- Modify: `frontend/package.json`
- Modify: `frontend/src/pages/ClusterListPage.tsx`

- [ ] **Step 1: Install dnd-kit**

Run from `frontend/`:
```bash
cd frontend && npm install @dnd-kit/core@^6.3 @dnd-kit/sortable@^8.0 @dnd-kit/utilities@^3.2
```

- [ ] **Step 2: Add the order helper module**

Create `frontend/src/utils/order.ts`:

```ts
export const ORDER_STEP = 1024;

export function nextOrderForAppend(siblingOrders: number[]): number {
  if (siblingOrders.length === 0) return ORDER_STEP;
  return Math.max(...siblingOrders) + ORDER_STEP;
}

/** Insert `inserted` between `before` and `after` (each possibly undefined). */
export function orderBetween(
  before: number | undefined,
  after: number | undefined
): number {
  if (before === undefined && after === undefined) return ORDER_STEP;
  if (before === undefined) return (after as number) - ORDER_STEP;
  if (after === undefined) return before + ORDER_STEP;
  return Math.floor((before + after) / 2);
}

/** Returns true when bisection has run out of integer headroom. Caller should re-order siblings. */
export function needsResequence(
  before: number | undefined,
  after: number | undefined
): boolean {
  if (before === undefined || after === undefined) return false;
  return after - before < 2;
}
```

- [ ] **Step 3: Add `DndContext` and `DragOverlay` placeholders to the page**

In `frontend/src/pages/ClusterListPage.tsx`, at the top add imports:

```tsx
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
```

Inside `ClusterListPage`, before the `return`:

```tsx
  const [activeDrag, setActiveDrag] = useState<
    | { kind: 'group'; id: string; label: string }
    | { kind: 'cluster'; id: string; label: string }
    | null
  >(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
    useSensor(KeyboardSensor)
  );

  const onDragStart = (e: DragStartEvent) => {
    const data = e.active.data.current as
      | { kind: 'group'; label: string }
      | { kind: 'cluster'; label: string }
      | undefined;
    if (!data) return;
    setActiveDrag({ kind: data.kind, id: String(e.active.id), label: data.label });
  };

  const onDragEnd = (_e: DragEndEvent) => {
    // Filled in by Tasks 22 and 23
    setActiveDrag(null);
  };
```

Wrap the existing outer JSX in `<DndContext>`:

```tsx
    <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
      <div className="max-w-7xl mx-auto px-6 py-10">
        {/* …existing layout… */}
      </div>
      <DragOverlay>
        {activeDrag && (
          <div className="px-3 py-1.5 rounded-lg bg-cyan-500/20 border border-cyan-500/60 text-cyan-300 text-sm font-medium shadow-lg shadow-cyan-500/30">
            {activeDrag.label}
          </div>
        )}
      </DragOverlay>
    </DndContext>
```

- [ ] **Step 4: Compile + run check**

Run: `cd frontend && npx tsc --noEmit`
Expected: clean.

Open the page; verify it still renders unchanged (no drag behavior yet, but no console errors).

- [ ] **Step 5: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/src/
git commit -m "feat(dnd): install @dnd-kit and add DndContext shell"
```

---

### Task 20: Make `GroupNode` draggable and droppable

**Files:**
- Modify: `frontend/src/components/cluster/GroupNode.tsx`

- [ ] **Step 1: Add drag wiring**

Replace the top of `GroupNode.tsx` (imports and component signature) with:

```tsx
import { useDraggable, useDroppable } from '@dnd-kit/core';
import type { GroupTreeNode } from '../../hooks/useClusterTree';
import type { Selection } from '../../types';

interface Props {
  node: GroupTreeNode;
  selection: Selection;
  expandedIds: Set<string>;
  /** IDs that should refuse drops (descendants of the currently-dragged group). */
  forbiddenDropIds: Set<string>;
  onToggle: (id: string) => void;
  onSelect: (sel: Selection) => void;
  onEdit: (node: GroupTreeNode) => void;
  onAddChild: (parentId: string) => void;
  onDelete: (node: GroupTreeNode) => void;
}

export default function GroupNode({
  node,
  selection,
  expandedIds,
  forbiddenDropIds,
  onToggle,
  onSelect,
  onEdit,
  onAddChild,
  onDelete,
}: Props) {
  const expanded = expandedIds.has(node.group.id);
  const isSelected = selection.kind === 'group' && selection.id === node.group.id;
  const childCount = node.children.length + node.clusters.length;
  const canExpand = node.children.length > 0 || node.clusters.length > 0;
  const isEmpty = childCount === 0;
  const isForbidden = forbiddenDropIds.has(node.group.id);

  const dragId = `group:${node.group.id}`;
  const dropId = `drop-group:${node.group.id}`;

  const draggable = useDraggable({
    id: dragId,
    data: { kind: 'group', label: node.group.name, sourceId: node.group.id },
    disabled: false,
  });

  const droppable = useDroppable({
    id: dropId,
    data: { kind: 'group', targetId: node.group.id },
    disabled: isForbidden,
  });

  const rowRef = (el: HTMLDivElement | null) => {
    draggable.setNodeRef(el);
    droppable.setNodeRef(el);
  };

  const hoverStyle = droppable.isOver
    ? isForbidden
      ? 'ring-2 ring-red-500/60 ring-dashed cursor-not-allowed'
      : 'ring-2 ring-cyan-500/60 shadow-cyan-500/30 shadow-lg'
    : '';
```

Then in the row JSX, change the outer `<div>` to use the ref and listeners:

```tsx
      <div
        ref={rowRef}
        {...draggable.attributes}
        {...draggable.listeners}
        className={`group flex items-center gap-1 px-2 py-1.5 rounded-lg cursor-pointer transition-colors ${
          isSelected ? 'bg-amber-500/10 text-amber-400' : 'hover:bg-white/5 text-slate-300'
        } ${hoverStyle} ${draggable.isDragging ? 'opacity-40' : ''}`}
        style={{
          paddingLeft: `${8 + node.depth * 16}px`,
          ...(draggable.transform
            ? { transform: `translate3d(${draggable.transform.x}px, ${draggable.transform.y}px, 0)` }
            : {}),
        }}
        onClick={() => {
          onSelect({ kind: 'group', id: node.group.id });
          if (!expanded && canExpand) onToggle(node.group.id);
        }}
      >
```

In the recursive `node.children.map(...)` call, pass `forbiddenDropIds` through:

```tsx
          {node.children.map((child) => (
            <GroupNode
              key={child.group.id}
              node={child}
              selection={selection}
              expandedIds={expandedIds}
              forbiddenDropIds={forbiddenDropIds}
              onToggle={onToggle}
              onSelect={onSelect}
              onEdit={onEdit}
              onAddChild={onAddChild}
              onDelete={onDelete}
            />
          ))}
```

- [ ] **Step 2: Plumb the `forbiddenDropIds` prop through `ClusterTree.tsx`**

Add the prop in `ClusterTree.tsx`'s `Props`:

```tsx
  forbiddenDropIds: Set<string>;
```

And pass it to each `<GroupNode>`:

```tsx
        <GroupNode
          key={node.group.id}
          node={node}
          selection={selection}
          expandedIds={expandedIds}
          forbiddenDropIds={forbiddenDropIds}
          /* …rest of props… */
        />
```

- [ ] **Step 3: Compute `forbiddenDropIds` in `ClusterListPage`**

Add the import and computation in `ClusterListPage.tsx`:

```tsx
import { collectDescendantGroupIds } from '../hooks/useClusterTree';
```

After computing `tree`:

```tsx
  const forbiddenDropIds = useMemo(() => {
    if (!activeDrag || activeDrag.kind !== 'group') return new Set<string>();
    const node = tree.byId.get(activeDrag.id);
    if (!node) return new Set<string>();
    const ids = collectDescendantGroupIds(node);
    ids.add(activeDrag.id); // can't drop into itself
    return ids;
  }, [activeDrag, tree]);
```

Don't forget `import { useMemo } from 'react'` at the top.

Pass it to `<ClusterTree>`:

```tsx
          <ClusterTree
            tree={tree}
            selection={selection}
            expandedIds={expandedIds}
            forbiddenDropIds={forbiddenDropIds}
            /* …rest of props… */
          />
```

- [ ] **Step 4: Compile check**

Run: `cd frontend && npx tsc --noEmit`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/cluster/ frontend/src/pages/ClusterListPage.tsx
git commit -m "feat(dnd): make GroupNode draggable + droppable with cycle prevention"
```

---

### Task 21: Make `ClusterCard` draggable

**Files:**
- Modify: `frontend/src/components/cluster/ClusterCard.tsx`

- [ ] **Step 1: Add draggable wiring**

At the top of `ClusterCard.tsx`, add:

```tsx
import { useDraggable } from '@dnd-kit/core';
```

Replace the component body to attach the draggable:

```tsx
export default function ClusterCard({ cluster, onDelete, animationDelay = 0 }: Props) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `cluster:${cluster.id}`,
    data: { kind: 'cluster', label: cluster.name, sourceId: cluster.id },
  });

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={`glass-panel rounded-2xl p-6 glow-border group animate-fade-in-up ${
        isDragging ? 'opacity-40' : ''
      }`}
      style={{
        animationDelay: `${animationDelay}s`,
        ...(transform
          ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
          : {}),
      }}
    >
      {/* …existing card content unchanged… */}
    </div>
  );
}
```

Keep the rest of the card body intact.

- [ ] **Step 2: Verify nothing else broke**

Open the page; clusters should still render. Dragging a card should now show the `DragOverlay` label, but releases do nothing yet.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/cluster/ClusterCard.tsx
git commit -m "feat(dnd): make ClusterCard a drag source"
```

---

### Task 22: `onDragEnd` for group → group moves with optimistic update

**Files:**
- Modify: `frontend/src/pages/ClusterListPage.tsx`

- [ ] **Step 1: Replace the no-op `onDragEnd`**

In `ClusterListPage.tsx`, replace the existing `onDragEnd` and add a helper for resolving drop targets. Add the import at the top:

```tsx
import { moveGroup } from '../api/groups';
import { moveCluster } from '../api/clusters';
import { nextOrderForAppend } from '../utils/order';
import type { Cluster, Group, Selection, ViewMode } from '../types';
```

Inside the component:

```tsx
  type DropTarget =
    | { kind: 'group'; id: string }
    | { kind: 'ungrouped' }
    | { kind: 'all' };

  const parseDropTarget = (rawId: string | number | null | undefined): DropTarget | null => {
    if (typeof rawId !== 'string') return null;
    if (rawId === 'drop-ungrouped') return { kind: 'ungrouped' };
    if (rawId === 'drop-all') return { kind: 'all' };
    if (rawId.startsWith('drop-group:')) {
      return { kind: 'group', id: rawId.slice('drop-group:'.length) };
    }
    return null;
  };

  const onDragEnd = (e: DragEndEvent) => {
    setActiveDrag(null);
    const sourceData = e.active.data.current as
      | { kind: 'group'; sourceId: string }
      | { kind: 'cluster'; sourceId: string }
      | undefined;
    if (!sourceData) return;

    const target = parseDropTarget(e.over?.id as string | undefined);
    if (!target) return;
    if (target.kind === 'all') return; // "All" is read-only

    if (sourceData.kind === 'group') {
      handleGroupDrop(sourceData.sourceId, target);
    } else {
      handleClusterDrop(sourceData.sourceId, target);
    }
  };

  const handleGroupDrop = (sourceId: string, target: DropTarget) => {
    if (target.kind === 'all') return;
    if (target.kind === 'group' && target.id === sourceId) return;
    if (forbiddenDropIds.has(target.kind === 'group' ? target.id : '__none__')) return;

    const newParentId = target.kind === 'ungrouped' ? null : target.id;
    const siblings = groups.filter((g) => g.parent_id === newParentId && g.id !== sourceId);
    const newOrder = nextOrderForAppend(siblings.map((s) => s.order));

    const prev = queryClient.getQueryData<Group[]>(['groups']) ?? [];
    const next = prev.map((g) =>
      g.id === sourceId ? { ...g, parent_id: newParentId, order: newOrder } : g
    );
    queryClient.setQueryData(['groups'], next);

    moveGroup(sourceId, { parent_id: newParentId, order: newOrder })
      .then(() => {
        queryClient.invalidateQueries({ queryKey: ['groups'] });
      })
      .catch((err) => {
        queryClient.setQueryData(['groups'], prev);
        window.alert(`Failed to move group: ${extractError(err)}`);
      });
  };

  const handleClusterDrop = (sourceId: string, target: DropTarget) => {
    const newParentGroupId =
      target.kind === 'ungrouped' ? null : target.kind === 'group' ? target.id : null;

    const siblings = clusters.filter(
      (c) => c.parent_group_id === newParentGroupId && c.id !== sourceId
    );
    const newOrder = nextOrderForAppend(siblings.map((s) => s.order));

    const prev = queryClient.getQueryData<Cluster[]>(['clusters']) ?? [];
    const next = prev.map((c) =>
      c.id === sourceId
        ? { ...c, parent_group_id: newParentGroupId, order: newOrder }
        : c
    );
    queryClient.setQueryData(['clusters'], next);

    moveCluster(sourceId, { parent_group_id: newParentGroupId, order: newOrder })
      .then(() => {
        queryClient.invalidateQueries({ queryKey: ['clusters'] });
      })
      .catch((err) => {
        queryClient.setQueryData(['clusters'], prev);
        window.alert(`Failed to move cluster: ${extractError(err)}`);
      });
  };
```

- [ ] **Step 2: Compile check**

Run: `cd frontend && npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/ClusterListPage.tsx
git commit -m "feat(dnd): handle group and cluster drops with optimistic update + rollback"
```

---

### Task 23: Make "All" and "Ungrouped" rows valid drop targets

**Files:**
- Modify: `frontend/src/components/cluster/ClusterTree.tsx`

- [ ] **Step 1: Wrap the two virtual rows with `useDroppable`**

Replace the top of `ClusterTree.tsx`:

```tsx
import { useDroppable } from '@dnd-kit/core';
import type { ClusterTree as Tree, GroupTreeNode } from '../../hooks/useClusterTree';
import type { Selection } from '../../types';
import GroupNode from './GroupNode';

interface Props {
  tree: Tree;
  selection: Selection;
  expandedIds: Set<string>;
  forbiddenDropIds: Set<string>;
  onToggle: (id: string) => void;
  onSelect: (sel: Selection) => void;
  onEditGroup: (node: GroupTreeNode) => void;
  onAddChildGroup: (parentId: string) => void;
  onDeleteGroup: (node: GroupTreeNode) => void;
}

function VirtualRow({
  id,
  selected,
  onSelect,
  label,
  count,
}: {
  id: 'drop-all' | 'drop-ungrouped';
  selected: boolean;
  onSelect: () => void;
  label: string;
  count?: number;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id,
    data: { kind: id === 'drop-ungrouped' ? 'ungrouped' : 'all' },
    disabled: id === 'drop-all', // "All" is selectable but not a valid drop target
  });
  return (
    <button
      ref={setNodeRef}
      type="button"
      onClick={onSelect}
      className={`w-full text-left px-2 py-1.5 rounded-lg transition-colors ${
        selected
          ? 'bg-amber-500/10 text-amber-400'
          : 'hover:bg-white/5 text-slate-300'
      } ${isOver ? 'ring-2 ring-cyan-500/60 shadow-cyan-500/30 shadow' : ''}`}
    >
      <span className="mr-1">▾</span>
      {label}
      {typeof count === 'number' && (
        <span className="text-xs text-slate-500 font-mono-data ml-1">({count})</span>
      )}
    </button>
  );
}
```

Replace the JSX body to use `VirtualRow`:

```tsx
export default function ClusterTree({
  tree,
  selection,
  expandedIds,
  forbiddenDropIds,
  onToggle,
  onSelect,
  onEditGroup,
  onAddChildGroup,
  onDeleteGroup,
}: Props) {
  return (
    <div className="text-sm space-y-0.5">
      <VirtualRow
        id="drop-all"
        selected={selection.kind === 'all'}
        onSelect={() => onSelect({ kind: 'all' })}
        label="All Clusters"
      />

      {tree.roots.map((node) => (
        <GroupNode
          key={node.group.id}
          node={node}
          selection={selection}
          expandedIds={expandedIds}
          forbiddenDropIds={forbiddenDropIds}
          onToggle={onToggle}
          onSelect={onSelect}
          onEdit={onEditGroup}
          onAddChild={onAddChildGroup}
          onDelete={onDeleteGroup}
        />
      ))}

      <VirtualRow
        id="drop-ungrouped"
        selected={selection.kind === 'ungrouped'}
        onSelect={() => onSelect({ kind: 'ungrouped' })}
        label="Ungrouped"
        count={tree.ungrouped.length}
      />
    </div>
  );
}
```

- [ ] **Step 2: Manual smoke test**

Start dev servers. Verify:
- Dragging a group over "Ungrouped" highlights it; dropping promotes the group to root parent.
- Dragging a cluster over "Ungrouped" works the same.
- Dropping anywhere on "All" does nothing (it's disabled as drop target).
- Dragging into a child of yourself does nothing (red-dashed ring, no commit).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/cluster/ClusterTree.tsx
git commit -m "feat(dnd): allow drops on Ungrouped virtual node"
```

---

## Phase 4 Checkpoint

Drag-and-drop now works for both groups and clusters, with optimistic updates, rollback on server error, and visual cycle prevention. Same-parent reorder still goes to the end (no in-between insertion yet — kept out of scope per spec's "implementation order").

---

## Phase 5 — Polish

### Task 24: Replace prompt-based group menu with a proper popover

**Files:**
- Modify: `frontend/src/components/cluster/GroupNode.tsx`

- [ ] **Step 1: Replace `window.prompt` with an inline dropdown**

Replace the `⋯` button block in `GroupNode.tsx` with a controlled menu. Add at the top of the component:

```tsx
import { useState } from 'react';
```

Inside the component body:

```tsx
  const [menuOpen, setMenuOpen] = useState(false);
```

Replace the `⋯` button JSX with:

```tsx
        <div className="relative" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-slate-300 px-1"
            onClick={() => setMenuOpen((o) => !o)}
            title="Group actions"
          >
            ⋯
          </button>
          {menuOpen && (
            <div
              className="absolute right-0 top-full mt-1 z-20 w-40 glass-panel rounded-lg py-1 text-xs"
              onMouseLeave={() => setMenuOpen(false)}
            >
              <button
                type="button"
                className="w-full text-left px-3 py-1.5 hover:bg-white/5"
                onClick={() => {
                  setMenuOpen(false);
                  onEdit(node);
                }}
              >
                Edit
              </button>
              <button
                type="button"
                className="w-full text-left px-3 py-1.5 hover:bg-white/5"
                onClick={() => {
                  setMenuOpen(false);
                  onAddChild(node.group.id);
                }}
              >
                Add child
              </button>
              <button
                type="button"
                disabled={!isEmpty}
                className={`w-full text-left px-3 py-1.5 ${
                  isEmpty ? 'text-red-400 hover:bg-red-500/10' : 'text-slate-600 cursor-not-allowed'
                }`}
                onClick={() => {
                  setMenuOpen(false);
                  if (isEmpty) onDelete(node);
                }}
                title={isEmpty ? undefined : 'Group is not empty'}
              >
                Delete
              </button>
            </div>
          )}
        </div>
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/cluster/GroupNode.tsx
git commit -m "feat(ux): replace prompt with inline group actions menu"
```

---

### Task 25: Mobile responsive — Tab layout under `md` breakpoint

**Files:**
- Modify: `frontend/src/pages/ClusterListPage.tsx`

- [ ] **Step 1: Add a mobile tab toggle**

Inside `ClusterListPage`, add state:

```tsx
  const [mobileTab, setMobileTab] = useState<'tree' | 'clusters'>('tree');
```

Just above the two-column wrapper, add:

```tsx
      <div className="md:hidden flex gap-1 mb-3 text-xs font-mono-data">
        <button
          type="button"
          onClick={() => setMobileTab('tree')}
          className={`px-3 py-2 rounded-lg border ${
            mobileTab === 'tree'
              ? 'border-cyan-500/40 bg-cyan-500/10 text-cyan-400'
              : 'border-white/10 text-slate-500'
          }`}
        >
          Tree
        </button>
        <button
          type="button"
          onClick={() => setMobileTab('clusters')}
          className={`px-3 py-2 rounded-lg border ${
            mobileTab === 'clusters'
              ? 'border-cyan-500/40 bg-cyan-500/10 text-cyan-400'
              : 'border-white/10 text-slate-500'
          }`}
        >
          Clusters
        </button>
      </div>
```

Update the two-column wrapper to hide each side on mobile:

```tsx
        <aside className={`md:w-72 md:flex-shrink-0 glass-panel rounded-2xl p-3 ${
          mobileTab === 'tree' ? '' : 'hidden md:block'
        }`}>
```

```tsx
        <div className={`flex-1 min-w-0 ${
          mobileTab === 'clusters' ? '' : 'hidden md:block'
        }`}>
```

- [ ] **Step 2: Manual check**

Resize browser to <640px width; tab toggle appears, switching panes works.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/ClusterListPage.tsx
git commit -m "feat(ux): mobile tab toggle between tree and clusters"
```

---

### Task 26: End-to-end acceptance verification

**Files:** none (manual verification + final commit)

- [ ] **Step 1: Run the full test suite**

```bash
cargo test
cd frontend && npm test
```
Expected: all passing.

- [ ] **Step 2: Manual golden-path verification**

Start backend and frontend dev servers:

```bash
cargo run &
cd frontend && npm run dev &
```

In the browser (`http://localhost:5173`):

1. Create a top-level group "业务A".
2. Edit it: set icon 🛒, color `#f59e0b`.
3. Add a child group "prod" under "业务A".
4. Drag an existing cluster from "Ungrouped" into "prod" → verify the cluster moves and appears under "prod".
5. Drag "prod" onto "业务B" (create "业务B" first) → verify reparenting succeeds.
6. Try to drag "业务A" onto "prod" (its descendant) → red-dashed ring, drop does nothing.
7. Try to delete "业务A" (non-empty) → menu shows Delete disabled with tooltip.
8. Move clusters back to Ungrouped, delete the empty groups one by one.
9. Refresh the browser → tree state and cluster placement persist (loaded from `data/groups.json`).
10. Stop the backend, attempt a drag → toast/alert shows the network error, view returns to prior state.

- [ ] **Step 3: Final commit (changelog)**

If a CHANGELOG.md or release note file exists in the repo, append an entry summarizing the feature. Otherwise:

```bash
git log --oneline | head -25
```
Sanity-check the commit history reads as a coherent feature shipping.

```bash
git status
```
Confirm clean working tree.

---

## Phase 5 Checkpoint — Feature Complete

All goals from `docs/superpowers/specs/2026-05-15-cluster-grouping-design.md` are implemented:
- Multi-level group nesting with persistence
- Drag-and-drop for both groups and clusters
- Cycle prevention (client + server)
- Optimistic updates with rollback
- View mode toggle (Direct/Recursive) on group selection
- Mobile-responsive tab fallback
- Backward-compatible cluster JSON loading

---

## Out of scope (deferred per spec §9)

- Tag-based multi-dimensional filtering
- Group-level permissions / ACL
- Cross-cluster bulk operations
- Custom theme for group colors/icons (only preset palette shipped)
- Undo/redo for drag operations
- Multi-tab live sync via WebSocket
- Same-sibling order insertion via bisection (`orderBetween` is in `utils/order.ts` but not wired into the UI — drops always append; the helper is exported so a follow-up task can wire it without changing the API)

