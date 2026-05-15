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
