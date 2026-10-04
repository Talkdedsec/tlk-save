//! HTTP routes. JSON in, JSON, an event stream, or a file out.

use std::{convert::Infallible, net::SocketAddr, sync::Arc, time::Duration};

use axum::{
    Json, Router,
    body::Body,
    extract::{ConnectInfo, DefaultBodyLimit, Path, Request, State},
    http::{HeaderMap, HeaderName, HeaderValue, Method, StatusCode, header},
    middleware::{self, Next},
    response::{
        Response,
        sse::{Event as SseEvent, KeepAlive, Sse},
    },
    routing::{get, post},
};
use futures_util::{Stream, StreamExt, stream};
use percent_encoding::{AsciiSet, NON_ALPHANUMERIC, utf8_percent_encode};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

use tower::ServiceExt;
use tower_http::{
    cors::{AllowOrigin, Any, CorsLayer},
    services::ServeFile,
    trace::TraceLayer,
};

use crate::{
    config::Config,
    error::ApiError,
    formats::{self, Choice, Section},
    jobs::{JobView, Manager},
    limit::{Cache, RateLimiter},
    thumbs::Thumbs,
    urls,
    ytdlp::Engine,
};

pub struct AppState {
    pub cfg: Arc<Config>,
    pub engine: Arc<Engine>,
    pub jobs: Arc<Manager>,
    pub limiter: RateLimiter,
    pub cache: Cache<Arc<Info>>,
    pub thumbs: Thumbs,
}

type Shared = State<Arc<AppState>>;

#[derive(Debug, Clone, Serialize)]
pub struct Info {
    pub id: Option<String>,
    pub title: String,
    pub uploader: Option<String>,
    pub duration: Option<f64>,
    pub thumbnail: Option<String>,
    pub platform: &'static str,
    pub url: String,
    pub vertical: bool,
    pub options: Vec<Choice>,
}

#[derive(Deserialize)]
struct LinkBody {
    url: String,
}

#[derive(Deserialize)]
struct JobBody {
    url: String,
    option: String,
    /// Optional section, seconds from the start. Both or neither.
    start: Option<f64>,
    end: Option<f64>,
}

pub fn router(state: Arc<AppState>) -> Router {
    let cors = CorsLayer::new()
        .allow_methods([Method::GET, Method::POST, Method::DELETE])
        .allow_headers([header::CONTENT_TYPE])
        .expose_headers([header::CONTENT_DISPOSITION, header::CONTENT_LENGTH])
        .max_age(Duration::from_secs(3600));
    let cors = if state.cfg.origins.iter().any(|o| o == "*") {
        cors.allow_origin(Any)
    } else {
        let origins: Vec<HeaderValue> = state
            .cfg
            .origins
            .iter()
            .filter_map(|o| o.parse().ok())
            .collect();
        cors.allow_origin(AllowOrigin::list(origins))
    };

    Router::new()
        .route("/", get(root))
        .route("/api/health", get(health))
        .route("/api/info", post(info))
        .route("/api/jobs", post(create_job))
        .route("/api/jobs/{id}", get(job_status).delete(cancel_job))
        .route("/api/jobs/{id}/events", get(job_events))
        .route("/api/jobs/{id}/file", get(job_file))
        .route("/api/thumb/{token}", get(thumb))
        .fallback(|| async { ApiError::new("not_found", StatusCode::NOT_FOUND) })
        .layer(DefaultBodyLimit::max(16 * 1024))
        .layer(cors)
        .layer(middleware::from_fn(private_network_access))
        .layer(TraceLayer::new_for_http())
        .with_state(state)
}

/// Chrome's Private Network Access preflight: lets the public site reach a
/// copy of this server running on the visitor's own machine (127.0.0.1).
async fn private_network_access(request: Request, next: Next) -> Response {
    let asks = request
        .headers()
        .get("access-control-request-private-network")
        .is_some_and(|v| v == "true");
    let mut response = next.run(request).await;
    let headers = response.headers_mut();
    headers.insert(
        "x-content-type-options",
        HeaderValue::from_static("nosniff"),
    );
    headers.insert("referrer-policy", HeaderValue::from_static("no-referrer"));
    if asks {
        response.headers_mut().insert(
            HeaderName::from_static("access-control-allow-private-network"),
            HeaderValue::from_static("true"),
        );
    }
    response
}

fn client(state: &AppState, headers: &HeaderMap, addr: SocketAddr) -> String {
    if state.cfg.trust_proxy
        && let Some(first) = headers
            .get("x-forwarded-for")
            .and_then(|v| v.to_str().ok())
            .and_then(|v| v.split(',').next())
            .map(str::trim)
            .filter(|v| !v.is_empty())
    {
        return first.to_owned();
    }
    addr.ip().to_string()
}

async fn root() -> Json<Value> {
    Json(json!({ "name": "tlk-save", "version": env!("CARGO_PKG_VERSION") }))
}

async fn health(State(state): Shared) -> Json<Value> {
    let ytdlp = state.engine.version().await;
    Json(json!({
        "ok": ytdlp.is_some(),
        "version": env!("CARGO_PKG_VERSION"),
        "ytdlp": ytdlp,
        "active": state.jobs.active(),
        "workers": state.cfg.workers,
        "limits": {
            "max_duration": state.cfg.max_duration,
            "max_filesize": state.cfg.max_filesize(),
            "file_ttl": state.cfg.file_ttl,
        },
    }))
}

async fn info(
    State(state): Shared,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    Json(body): Json<LinkBody>,
) -> Result<Json<Arc<Info>>, ApiError> {
    let url = urls::validate(&body.url)?;
    if let Some(hit) = state.cache.get(&url) {
        return Ok(Json(hit));
    }
    state.limiter.check(
        &client(&state, &headers, addr),
        "info",
        state.cfg.info_per_minute,
    )?;

    let raw = state.engine.describe(&url).await?;
    let mut info = to_info(&raw, &url, &state.cfg)?;
    // The site loads the picture from here, never from the video site.
    info.thumbnail = info.thumbnail.and_then(|t| state.thumbs.register(&t));
    let info = Arc::new(info);
    state.cache.put(url, info.clone());
    state.cache.put(info.url.clone(), info.clone());
    Ok(Json(info))
}

fn to_info(raw: &Value, asked: &str, cfg: &Config) -> Result<Info, ApiError> {
    let unprocessable = |code| ApiError::new(code, StatusCode::UNPROCESSABLE_ENTITY);
    let s = |key: &str| {
        raw.get(key)
            .and_then(Value::as_str)
            .filter(|v| !v.is_empty())
            .map(str::to_owned)
    };

    if s("_type").as_deref() == Some("playlist") {
        return Err(unprocessable("playlist"));
    }
    if raw.get("is_live").and_then(Value::as_bool) == Some(true)
        || matches!(s("live_status").as_deref(), Some("is_live" | "is_upcoming"))
    {
        return Err(unprocessable("live"));
    }
    let duration = raw.get("duration").and_then(Value::as_f64);
    if duration.is_some_and(|d| d > cfg.max_duration as f64) {
        return Err(unprocessable("too_long"));
    }
    let mut options = formats::build(raw);
    for option in &mut options {
        option.too_large = option.size.is_some_and(|s| s > cfg.max_filesize());
    }
    if options.is_empty() {
        return Err(unprocessable("unavailable").with_detail("no downloadable formats"));
    }

    let (w, h) = (
        raw.get("width").and_then(Value::as_f64),
        raw.get("height").and_then(Value::as_f64),
    );
    Ok(Info {
        id: s("id"),
        title: s("title").or_else(|| s("id")).unwrap_or_default(),
        uploader: s("uploader")
            .or_else(|| s("channel"))
            .or_else(|| s("creator")),
        duration,
        thumbnail: s("thumbnail"),
        platform: formats::platform_of(&s("extractor_key").unwrap_or_default()),
        url: s("webpage_url").unwrap_or_else(|| asked.to_owned()),
        vertical: matches!((w, h), (Some(w), Some(h)) if h > w),
        options,
    })
}

async fn create_job(
    State(state): Shared,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    Json(body): Json<JobBody>,
) -> Result<(StatusCode, Json<JobView>), ApiError> {
    let url = urls::validate(&body.url)?;
    if formats::args(&body.option, None).is_none() {
        return Err(ApiError::bad("invalid_option"));
    }
    let known = state.cache.get(&url);
    let section = match (body.start, body.end) {
        (None, None) => None,
        (Some(start), Some(end)) => {
            let duration = known.as_ref().and_then(|i| i.duration);
            Some(
                Section::new(start, end, duration)
                    .ok_or_else(|| ApiError::bad("invalid_section"))?,
            )
        }
        _ => return Err(ApiError::bad("invalid_section")),
    };
    if let Some(info) = &known {
        match info.options.iter().find(|o| o.id == body.option) {
            None => return Err(ApiError::bad("invalid_option")),
            Some(o) if o.too_large => {
                return Err(ApiError::new("too_large", StatusCode::UNPROCESSABLE_ENTITY));
            }
            Some(_) => {}
        }
    }
    let who = client(&state, &headers, addr);
    state
        .limiter
        .check(&who, "jobs", state.cfg.jobs_per_minute)?;

    let target = known.map_or(url, |info| info.url.clone());
    let view = state.jobs.create(target, body.option, section, &who)?;
    Ok((StatusCode::ACCEPTED, Json(view)))
}

async fn thumb(State(state): Shared, Path(token): Path<String>) -> Result<Response, ApiError> {
    state.thumbs.fetch(&token).await
}

async fn job_status(
    State(state): Shared,
    Path(id): Path<String>,
) -> Result<Json<JobView>, ApiError> {
    Ok(Json(state.jobs.get(&id)?.snapshot()))
}

/// Only the visitor who started a job can stop it; a shared job keeps
/// running for anyone else waiting on the same file.
async fn cancel_job(
    State(state): Shared,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Result<Json<JobView>, ApiError> {
    let job = state.jobs.get(&id)?;
    if job.client == client(&state, &headers, addr) {
        job.cancel.cancel();
    }
    Ok(Json(job.snapshot()))
}

/// Server-sent events: one `job` event per change, ending after the last state.
async fn job_events(
    State(state): Shared,
    Path(id): Path<String>,
) -> Result<Sse<impl Stream<Item = Result<SseEvent, Infallible>>>, ApiError> {
    let job = state.jobs.get(&id)?;
    // The current state first, then every change. The stream ends right
    // after a final state instead of waiting for a change that never comes.
    let stream = stream::unfold(
        (job.view.subscribe(), true, false),
        |(mut rx, first, done)| async move {
            if done || (!first && rx.changed().await.is_err()) {
                return None;
            }
            let view = rx.borrow_and_update().clone();
            let finished = !view.state.is_active();
            Some((view, (rx, false, finished)))
        },
    )
    .map(|view| {
        Ok(SseEvent::default()
            .event("job")
            .json_data(&view)
            .unwrap_or_default())
    });
    Ok(Sse::new(stream).keep_alive(KeepAlive::new().interval(Duration::from_secs(15))))
}

/// RFC 6266 filename: an ASCII fallback plus the real name in UTF-8.
fn content_disposition(name: &str) -> HeaderValue {
    const ATTR: &AsciiSet = &NON_ALPHANUMERIC
        .remove(b'-')
        .remove(b'.')
        .remove(b'_')
        .remove(b'~');
    let ascii: String = name
        .chars()
        .map(|c| {
            if (c.is_ascii_graphic() && c != '"' && c != '\\') || c == ' ' {
                c
            } else {
                '_'
            }
        })
        .collect();
    let value = format!(
        "attachment; filename=\"{ascii}\"; filename*=UTF-8''{}",
        utf8_percent_encode(name, ATTR)
    );
    HeaderValue::from_str(&value).unwrap_or_else(|_| HeaderValue::from_static("attachment"))
}

fn mime_for(name: &str) -> &'static str {
    match name
        .rsplit('.')
        .next()
        .map(str::to_ascii_lowercase)
        .as_deref()
    {
        Some("mp4") => "video/mp4",
        Some("webm") => "video/webm",
        Some("mkv") => "video/x-matroska",
        Some("mp3") => "audio/mpeg",
        Some("m4a") => "audio/mp4",
        Some("opus" | "ogg") => "audio/ogg",
        _ => "application/octet-stream",
    }
}

/// The finished file, with range support so a broken download can resume.
async fn job_file(
    State(state): Shared,
    Path(id): Path<String>,
    request: Request,
) -> Result<Response, ApiError> {
    let job = state.jobs.get(&id)?;
    let path = job
        .file()
        .filter(|p| p.is_file())
        .ok_or_else(|| ApiError::new("not_ready", StatusCode::CONFLICT))?;
    let name = path
        .file_name()
        .map_or_else(|| "download".into(), |n| n.to_string_lossy().into_owned());

    let response = ServeFile::new_with_mime(&path, &mime_for(&name).parse().expect("static mime"))
        .oneshot(request)
        .await
        .map_err(|err| {
            ApiError::new("failed", StatusCode::INTERNAL_SERVER_ERROR).with_detail(err.to_string())
        })?;
    let (mut parts, body) = response.into_parts();
    parts
        .headers
        .insert(header::CONTENT_DISPOSITION, content_disposition(&name));
    parts.headers.insert(
        header::CACHE_CONTROL,
        HeaderValue::from_static("private, no-store"),
    );
    Ok(Response::from_parts(parts, Body::new(body)))
}

#[cfg(test)]
mod tests {
    use clap::Parser;

    use super::*;

    #[test]
    fn disposition_keeps_unicode_names() {
        let value = content_disposition("Çok güzel \"klip\" [abc].mp4");
        let text = value.to_str().unwrap();
        assert!(text.starts_with("attachment; filename=\"_ok g_zel _klip_ [abc].mp4\""));
        assert!(
            text.contains("filename*=UTF-8''%C3%87ok%20g%C3%BCzel%20%22klip%22%20%5Babc%5D.mp4")
        );
    }

    #[test]
    fn rejects_playlists_and_live_streams() {
        let cfg = Config::try_parse_from(["tlk-save"]).unwrap();
        let playlist = json!({"_type": "playlist", "entries": []});
        assert_eq!(
            to_info(&playlist, "https://x.y/", &cfg).unwrap_err().code,
            "playlist"
        );
        let live =
            json!({"is_live": true, "formats": [{"vcodec": "h264", "height": 720, "width": 1280}]});
        assert_eq!(
            to_info(&live, "https://x.y/", &cfg).unwrap_err().code,
            "live"
        );
        let long = json!({"duration": 99999.0, "formats": [{"vcodec": "h264", "height": 720, "width": 1280}]});
        assert_eq!(
            to_info(&long, "https://x.y/", &cfg).unwrap_err().code,
            "too_long"
        );
    }
}
