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
