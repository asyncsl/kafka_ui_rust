use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;

use crate::cluster::model::Cluster;

const DATA_PATH: &str = "data/clusters.json";

#[derive(Clone)]
pub struct AppState {
    pub clusters: Arc<RwLock<HashMap<String, Cluster>>>,
}

impl AppState {
    pub async fn new() -> Self {
        let clusters = match tokio::fs::read_to_string(DATA_PATH).await {
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

        if let Some(parent) = std::path::Path::new(DATA_PATH).parent() {
            tokio::fs::create_dir_all(parent).await?;
        }
        tokio::fs::write(DATA_PATH, json).await
    }
}
