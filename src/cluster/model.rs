use serde::{Deserialize, Serialize};

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

#[derive(Debug, Deserialize)]
pub struct CreateClusterRequest {
    pub name: String,
    pub bootstrap_servers: String,
}

#[derive(Debug, Deserialize)]
pub struct MoveClusterRequest {
    pub parent_group_id: Option<String>,
    pub order: i32,
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;
    use std::sync::Arc;
    use tokio::sync::RwLock;

    #[tokio::test]
    async fn test_cluster_store_operations() {
        let store: Arc<RwLock<HashMap<String, Cluster>>> = Arc::new(RwLock::new(HashMap::new()));
        let cluster = Cluster {
            id: "id-1".to_string(),
            name: "local".to_string(),
            bootstrap_servers: "localhost:9092".to_string(),
            parent_group_id: None,
            order: 0,
        };
        store.write().await.insert(cluster.id.clone(), cluster.clone());

        let clusters: Vec<Cluster> = store.read().await.values().cloned().collect();
        assert_eq!(clusters.len(), 1);
        assert_eq!(clusters[0].name, "local");
        assert_eq!(clusters[0].bootstrap_servers, "localhost:9092");
    }

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
}
