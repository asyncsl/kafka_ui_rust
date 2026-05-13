use axum::routing::{delete, get};
use axum::Router;
use tower_http::cors::CorsLayer;

use crate::cluster::handler::{create_cluster, delete_cluster, list_clusters};
use crate::state::AppState;
use crate::topic::handler::{
    fetch_messages_handler, list_topics_handler, topic_detail_handler,
};

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/clusters", get(list_clusters).post(create_cluster))
        .route("/clusters/{id}", delete(delete_cluster))
        .route("/clusters/{id}/topics", get(list_topics_handler))
        .route("/clusters/{id}/topics/{name}", get(topic_detail_handler))
        .route(
            "/clusters/{id}/topics/{name}/messages",
            get(fetch_messages_handler),
        )
        .layer(CorsLayer::permissive())
}
