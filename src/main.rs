mod cluster;
mod error;
mod kafka;
mod state;
mod topic;
mod api;

use axum::{routing::get, Router};
use std::net::SocketAddr;
use tokio::net::TcpListener;

use crate::state::AppState;

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt::init();

    let state = AppState::new();

    let app = Router::new()
        .route("/", get(|| async { "Hello, Kafka UI!" }))
        .with_state(state);

    let addr = SocketAddr::from(([127, 0, 0, 1], 8080));
    let listener = TcpListener::bind(addr).await.unwrap();
    tracing::info!("Listening on {}", addr);

    axum::serve(listener, app).await.unwrap();
}
