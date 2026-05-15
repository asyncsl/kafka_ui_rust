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
