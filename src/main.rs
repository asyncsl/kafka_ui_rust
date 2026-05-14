mod api;
mod cluster;
mod consumer;
mod error;
mod kafka;
mod state;
mod static_assets;
mod topic;

use axum::{routing::get, Router};
use std::net::SocketAddr;
use tokio::net::TcpListener;

use crate::state::AppState;

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt::init();

    let state = AppState::new().await;

    let app = Router::new()
        .nest("/api", api::router())
        .route("/", get(static_assets::root_handler))
        .route("/{*path}", get(static_assets::handler))
        .with_state(state);

    let addr = SocketAddr::from(([127, 0, 0, 1], 8080));
    let listener = TcpListener::bind(addr).await.unwrap();
    tracing::info!("Listening on {}", addr);

    axum::serve(listener, app).await.unwrap();
}
