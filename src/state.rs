use std::collections::HashMap;
use std::sync::{Arc, RwLock};

use crate::cluster::model::Cluster;

#[derive(Clone)]
pub struct AppState {
    pub clusters: Arc<RwLock<HashMap<String, Cluster>>>,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            clusters: Arc::new(RwLock::new(HashMap::new())),
        }
    }
}
