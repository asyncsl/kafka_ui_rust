use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Cluster {
    pub id: String,
    pub name: String,
    pub bootstrap_servers: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateClusterRequest {
    pub name: String,
    pub bootstrap_servers: String,
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;
    use std::sync::{Arc, RwLock};

    #[test]
    fn test_cluster_store_operations() {
        let store: Arc<RwLock<HashMap<String, Cluster>>> = Arc::new(RwLock::new(HashMap::new()));
        let cluster = Cluster {
            id: "id-1".to_string(),
            name: "local".to_string(),
            bootstrap_servers: "localhost:9092".to_string(),
        };
        store.write().unwrap().insert(cluster.id.clone(), cluster.clone());

        let clusters: Vec<Cluster> = store.read().unwrap().values().cloned().collect();
        assert_eq!(clusters.len(), 1);
        assert_eq!(clusters[0].name, "local");
        assert_eq!(clusters[0].bootstrap_servers, "localhost:9092");
    }
}
