use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;

use crate::cluster::model::Cluster;

fn data_path() -> std::path::PathBuf {
    std::env::var_os("CARGO_MANIFEST_DIR")
        .map(std::path::PathBuf::from)
        .unwrap_or_else(|| {
            std::env::current_exe()
                .ok()
                .and_then(|p| p.parent().map(|p| p.to_path_buf()))
                .unwrap_or_default()
        })
        .join("data")
        .join("clusters.json")
}

#[derive(Clone)]
pub struct AppState {
    pub clusters: Arc<RwLock<HashMap<String, Cluster>>>,
}

impl AppState {
    pub async fn new() -> Self {
        let path = data_path();
        let clusters = match tokio::fs::read_to_string(&path).await {
            Ok(content) => serde_json::from_str(&content).unwrap_or_default(),
            Err(_) => HashMap::new(),
        };
        Self {
            clusters: Arc::new(RwLock::new(clusters)),
        }
    }

    pub async fn save(&self) -> Result<(), std::io::Error> {
        let clusters = self.clusters.read().await;
        let json = serde_json::to_string_pretty(&*clusters)?;
        drop(clusters);

        let path = data_path();
        if let Some(parent) = path.parent() {
            tokio::fs::create_dir_all(parent).await?;
        }
        tokio::fs::write(path, json).await
    }
}
