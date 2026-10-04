//! Thumbnails served through this server, so a visitor's browser never talks
//! to the video site and the site never sees the visitor's address.
//!
//! Only images yt-dlp reported for a looked-up link can be fetched, each
//! behind a random token; nothing a visitor sends becomes a URL here.

use std::time::Duration;

use axum::{
    body::Body,
    http::{HeaderValue, StatusCode, header},
    response::Response,
};
use futures_util::StreamExt;
use rand::{Rng, distr::Alphanumeric};
use reqwest::redirect::Policy;

use crate::{error::ApiError, limit::Cache, urls};

const MAX_BYTES: usize = 5 * 1024 * 1024;

pub struct Thumbs {
    client: reqwest::Client,
    tokens: Cache<String>,
}

impl Thumbs {
    pub fn new() -> Self {
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(15))
            .redirect(Policy::custom(|attempt| {
                // A redirect must stay on an ordinary public host.
                if attempt.previous().len() >= 3 || urls::validate(attempt.url().as_str()).is_err() {
                    attempt.stop()
                } else {
                    attempt.follow()
                }
            }))
            .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36")
            .build()
            .expect("static client configuration");
        Self {
            client,
            tokens: Cache::new(Duration::from_secs(3600), 4096),
        }
    }

    /// Remember an image address and return the path the site loads it from.
    pub fn register(&self, url: &str) -> Option<String> {
        let url = urls::validate(url).ok()?;
        let token: String = rand::rng()
            .sample_iter(&Alphanumeric)
            .take(22)
            .map(char::from)
            .collect();
        self.tokens.put(token.clone(), url);
        Some(format!("/api/thumb/{token}"))
    }

    pub async fn fetch(&self, token: &str) -> Result<Response, ApiError> {
        let url = self
            .tokens
            .get(token)
            .ok_or_else(|| ApiError::new("not_found", StatusCode::NOT_FOUND))?;
        let upstream = |detail: String| {
            ApiError::new("unavailable", StatusCode::BAD_GATEWAY).with_detail(detail)
        };

        let response = self
            .client
            .get(&url)
            .send()
            .await
            .map_err(|err| upstream(err.to_string()))?;
        if !response.status().is_success() {
            return Err(upstream(response.status().to_string()));
        }
        let content_type = response
            .headers()
            .get(header::CONTENT_TYPE)
            .and_then(|v| v.to_str().ok())
            .filter(|v| v.starts_with("image/"))
            .map(str::to_owned)
            .ok_or_else(|| upstream("not an image".into()))?;
        if response
            .content_length()
            .is_some_and(|n| n > MAX_BYTES as u64)
        {
            return Err(upstream("image too large".into()));
        }

        let mut body = Vec::new();
        let mut stream = response.bytes_stream();
        while let Some(chunk) = stream.next().await {
            let chunk = chunk.map_err(|err| upstream(err.to_string()))?;
            if body.len() + chunk.len() > MAX_BYTES {
                return Err(upstream("image too large".into()));
            }
            body.extend_from_slice(&chunk);
        }

        let mut out = Response::new(Body::from(body));
        let headers = out.headers_mut();
        headers.insert(
            header::CONTENT_TYPE,
            HeaderValue::from_str(&content_type).unwrap_or(HeaderValue::from_static("image/jpeg")),
        );
        headers.insert(
            header::CACHE_CONTROL,
            HeaderValue::from_static("private, max-age=3600"),
        );
        headers.insert(
            "cross-origin-resource-policy",
            HeaderValue::from_static("cross-origin"),
        );
        Ok(out)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_public_addresses_get_a_token() {
        let thumbs = Thumbs::new();
        let path = thumbs
            .register("https://i.ytimg.com/vi/x/hqdefault.jpg")
            .unwrap();
        assert!(path.starts_with("/api/thumb/"));
        assert_eq!(path.len(), "/api/thumb/".len() + 22);
        assert!(thumbs.register("http://127.0.0.1/x.jpg").is_none());
        assert!(thumbs.register("file:///etc/passwd").is_none());
    }

    #[tokio::test]
    async fn unknown_tokens_are_not_found() {
        let thumbs = Thumbs::new();
        let err = thumbs.fetch("nope").await.unwrap_err();
        assert_eq!(err.code, "not_found");
    }
}
