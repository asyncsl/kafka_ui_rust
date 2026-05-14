use axum::{
    body::Body,
    extract::Path,
    http::{header, StatusCode},
    response::{IntoResponse, Response},
};
use rust_embed::RustEmbed;

#[derive(RustEmbed)]
#[folder = "frontend/dist/"]
struct Assets;

pub async fn handler(Path(path): Path<String>) -> impl IntoResponse {
    let path = if path.is_empty() || path.ends_with('/') {
        "index.html".to_string()
    } else {
        path
    };

    match Assets::get(&path) {
        Some(content) => {
            let mime = mime_guess::from_path(&path).first_or_octet_stream();
            Response::builder()
                .header(header::CONTENT_TYPE, mime.as_ref())
                .body(Body::from(content.data))
                .unwrap()
        }
        None => {
            // SPA fallback — serve index.html so React Router handles the path
            Assets::get("index.html")
                .map(|content| {
                    Response::builder()
                        .header(header::CONTENT_TYPE, "text/html")
                        .body(Body::from(content.data))
                        .unwrap()
                })
                .unwrap_or_else(|| StatusCode::NOT_FOUND.into_response())
        }
    }
}

pub async fn root_handler() -> impl IntoResponse {
    handler(Path("index.html".to_string())).await
}
