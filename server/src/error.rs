//! Error codes. The site translates codes, never messages, so yt-dlp's wording
//! can change between releases without the site showing something odd.

use axum::{
    Json,
    http::StatusCode,
    response::{IntoResponse, Response},
};
use serde_json::json;

#[derive(Debug, Clone, thiserror::Error)]
#[error("{code}")]
pub struct ApiError {
    pub code: &'static str,
    pub status: StatusCode,
    pub detail: String,
}

impl ApiError {
    pub fn new(code: &'static str, status: StatusCode) -> Self {
        Self {
            code,
            status,
            detail: String::new(),
        }
    }

    pub fn bad(code: &'static str) -> Self {
        Self::new(code, StatusCode::BAD_REQUEST)
    }

    pub fn with_detail(mut self, detail: impl Into<String>) -> Self {
        self.detail = detail.into();
        self
    }

    /// A failure reported by yt-dlp, classified from its message.
    pub fn from_ytdlp(message: &str) -> Self {
        let message = clean_message(message);
        let code = classify(&message);
        let status = match code {
            "upstream_limited" | "bot_check" | "engine_missing" => StatusCode::SERVICE_UNAVAILABLE,
            "failed" => StatusCode::BAD_GATEWAY,
            _ => StatusCode::UNPROCESSABLE_ENTITY,
        };
        Self::new(code, status).with_detail(message)
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let body = json!({ "error": { "code": self.code, "detail": self.detail } });
        (self.status, Json(body)).into_response()
    }
}

/// First match wins, so the specific patterns come first. Everything is a
/// lower-case substring; the honest fallback is "failed".
const PATTERNS: &[(&str, &[&str])] = &[
    ("unsupported", &["unsupported url", "no suitable extractor"]),
    // "Confirm you are on the latest version" is yt-dlp asking for a bug
    // report, not a bot check, so the phrase is matched in full.
    (
        "bot_check",
        &["confirm you're not a bot", "confirm you are not a bot"],
    ),
    (
        "live",
        &[
            "live event will begin",
            "this live event",
            "is currently live",
            "premieres in",
        ],
    ),
    (
        "private",
        &[
            "private video",
            "this video is private",
            "account is private",
            "this post is private",
        ],
    ),
    (
        "age_restricted",
        &[
            "age-restricted",
            "age restricted",
            "inappropriate for some users",
            "confirm your age",
        ],
    ),
    (
        "login_required",
        &[
            "login required",
            "log in",
            "sign in",
            "use --cookies",
            "requires authentication",
            "requiring login",
            "logged-in",
        ],
    ),
    (
        "geo_blocked",
        &[
            "available in your country",
            "ip address is blocked",
            "geo restrict",
            "geo-restrict",
            "from your location",
        ],
    ),
    ("too_large", &["max-filesize", "larger than max"]),
    (
        "upstream_limited",
        &[
            "http error 429",
            "too many requests",
            "rate-limit",
            "rate limit",
        ],
    ),
    (
        "unavailable",
        &[
            "video unavailable",
            "has been removed",
            "no longer available",
            "does not exist",
            "http error 404",
            "http error 410",
            "no video formats found",
            "no video could be found",
            "unable to find video",
        ],
    ),
];

pub fn classify(message: &str) -> &'static str {
    let text = message.to_lowercase();
    PATTERNS
        .iter()
        .find(|(_, needles)| needles.iter().any(|n| text.contains(n)))
        .map_or("failed", |(code, _)| code)
}

/// The last `ERROR:` line of yt-dlp's stderr, without colour codes.
pub fn clean_message(stderr: &str) -> String {
    let lines: Vec<&str> = stderr
        .lines()
        .map(str::trim)
        .filter(|l| !l.is_empty())
        .collect();
    let line = lines
        .iter()
        .rev()
        .find(|l| l.starts_with("ERROR:"))
        .or_else(|| lines.last())
        .copied()
        .unwrap_or_default();
    strip_ansi(line)
        .trim_start_matches("ERROR:")
        .trim()
        .to_owned()
}

fn strip_ansi(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let mut chars = text.chars();
    while let Some(c) = chars.next() {
        if c == '\x1b' {
            for c in chars.by_ref() {
                if c.is_ascii_alphabetic() {
                    break;
                }
            }
        } else {
            out.push(c);
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn classifies_common_failures() {
        assert_eq!(
            classify("[youtube] x: Sign in to confirm you're not a bot"),
            "bot_check"
        );
        assert_eq!(
            classify("[youtube] x: Private video. Sign in if you've been granted access"),
            "private"
        );
        assert_eq!(classify("[youtube] x: Video unavailable"), "unavailable");
        assert_eq!(
            classify("Unsupported URL: https://example.com"),
            "unsupported"
        );
        assert_eq!(
            classify("HTTP Error 429: Too Many Requests"),
            "upstream_limited"
        );
        assert_eq!(
            classify(
                "[instagram] x: Requested content is not available, rate-limit reached or login required"
            ),
            "login_required"
        );
        assert_eq!(
            classify("The uploader has not made this video available in your country"),
            "geo_blocked"
        );
    }

    #[test]
    fn a_bug_report_request_is_not_a_bot_check() {
        let msg = "[TikTok] 1: Unexpected response from webpage request; please report this issue. Confirm you are on the latest version using yt-dlp -U";
        assert_eq!(classify(msg), "failed");
    }

    #[test]
    fn keeps_the_last_error_line() {
        let stderr =
            "WARNING: something\n\x1b[0;31mERROR:\x1b[0m [youtube] abc: Video unavailable\n";
        assert_eq!(clean_message(stderr), "[youtube] abc: Video unavailable");
    }
}
