mod api;
mod cluster;
mod consumer;
mod error;
mod kafka;
mod state;
mod static_assets;
mod topic;

use axum::{routing::get, Router};
use clap::Parser;
use std::net::SocketAddr;
use tokio::net::TcpListener;

use crate::state::AppState;

#[derive(Parser)]
#[command(name = "kafka_ui_rust")]
#[command(about = "Kafka management Web UI")]
struct Args {
    /// Bind address
    #[arg(short = 'H', long, env = "HOST", default_value = "127.0.0.1")]
    host: String,

    /// Listen port
    #[arg(short, long, env = "PORT", default_value = "8080")]
    port: u16,
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt::init();

    let args = Args::parse();

    let state = AppState::new().await;

    let app = Router::new()
        .nest("/api", api::router())
        .route("/", get(static_assets::root_handler))
        .route("/{*path}", get(static_assets::handler))
        .with_state(state);

    let addr: SocketAddr = format!("{}:{}", args.host, args.port)
        .parse()
        .expect("Invalid host or port");
    let listener = TcpListener::bind(addr).await.unwrap();
    tracing::info!("Listening on {}", addr);

    axum::serve(listener, app).await.unwrap();
}
