//! tlk-save server: the HTTP API behind <https://talkdedsec.github.io/tlk-save/>.

mod config;
mod error;
mod formats;
mod jobs;
mod limit;
mod proctree;
mod routes;
mod urls;
mod ytdlp;

use std::{net::SocketAddr, sync::Arc, time::Duration};

use clap::Parser;
use tracing_subscriber::EnvFilter;

use crate::{
    config::Config,
    jobs::Manager,
    limit::{Cache, RateLimiter},
    routes::AppState,
    ytdlp::Engine,
};

#[tokio::main]
async fn main() -> std::io::Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_env("TLK_SAVE_LOG")
                .unwrap_or_else(|_| EnvFilter::new("info,tower_http=warn")),
        )
        .init();

    let cfg = Arc::new(Config::parse());

    // Files from a previous run are orphans: no job points at them any more.
    let _ = tokio::fs::remove_dir_all(cfg.jobs_dir()).await;
    tokio::fs::create_dir_all(cfg.jobs_dir()).await?;

    let engine = Arc::new(Engine::new(cfg.clone()));
    if let Some(v) = engine.refresh_version().await {
        tracing::info!("yt-dlp {v}");
    } else {
        tracing::error!("yt-dlp not found at {:?}; set TLK_SAVE_YTDLP", cfg.ytdlp);
    }

    let jobs = Arc::new(Manager::new(cfg.clone(), engine.clone()));
    jobs.spawn_sweeper();

    let state = Arc::new(AppState {
        cfg: cfg.clone(),
        engine: engine.clone(),
        jobs,
        limiter: RateLimiter::default(),
        cache: Cache::new(Duration::from_secs(300), 512),
    });

    if cfg.update_hours > 0 {
        let engine = engine.clone();
        let every = Duration::from_secs(cfg.update_hours * 3600);
        tokio::spawn(async move {
            let mut tick = tokio::time::interval(every);
            loop {
                tick.tick().await;
                engine.self_update().await;
            }
        });
    }

    {
        let state = state.clone();
        tokio::spawn(async move {
            let mut tick = tokio::time::interval(Duration::from_secs(300));
            loop {
                tick.tick().await;
                state.limiter.prune();
            }
        });
    }

    let listener = tokio::net::TcpListener::bind(cfg.listen).await?;
    tracing::info!(
        "tlk-save {} listening on http://{}",
        env!("CARGO_PKG_VERSION"),
        cfg.listen
    );
    axum::serve(
        listener,
        routes::router(state).into_make_service_with_connect_info::<SocketAddr>(),
    )
    .with_graceful_shutdown(async {
        let _ = tokio::signal::ctrl_c().await;
        tracing::info!("shutting down");
    })
    .await
}
