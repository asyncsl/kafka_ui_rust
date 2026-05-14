use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;

use crate::cluster::model::Cluster;

fn data_path() -> std::path::PathBuf {
    if let Some(dir) = std::env::var_os("CARGO_MANIFEST_DIR") {
        return std::path::PathBuf::from(dir)
            .join("data")
            .join("clusters.json");
    }

    // When running the binary directly, walk up from the exe location
    // to find the project root (directory containing Cargo.toml or data/)
    if let Ok(exe) = std::env::current_exe() {
        let mut dir = exe.parent();
        while let Some(d) = dir {
            let data_file = d.join("data").join("clusters.json");
            if data_file.exists() {
                return data_file;
            }
            if d.join("Cargo.toml").exists() {
                return d.join("data").join("clusters.json");
            }
            dir = d.parent();
        }
    }

    std::path::PathBuf::from("data").join("clusters.json")
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
