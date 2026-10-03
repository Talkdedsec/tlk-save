//! The first gate: is this a link worth handing to yt-dlp at all?
//!
//! The real protection against being used as a proxy into a private network
//! is that yt-dlp runs with the generic extractor switched off, so it only
//! opens sites it has an extractor for. This rejects the obvious cases early.

use std::net::IpAddr;

use url::{Host, Url};

use crate::error::ApiError;

const MAX_URL_LENGTH: usize = 2048;

/// Pull the link out of whatever was pasted: share texts such as
/// `look at this https://vm.tiktok.com/abc/ #fyp`, or a link without a scheme.
pub fn extract(text: &str) -> String {
    let text = text.trim();
    let found = text
        .split(|c: char| c.is_whitespace() || matches!(c, '<' | '>' | '"' | '\''))
        .map(|word| word.trim_start_matches(['(', '[', '{']))
        .find(|word| {
            let lower = word.to_ascii_lowercase();
            lower.starts_with("https://") || lower.starts_with("http://")
        });
    match found {
        Some(word) => word
            .trim_end_matches([')', ']', '}', '.', ',', ';', '!', '?'])
            .to_owned(),
        None if !text.contains(char::is_whitespace) && text.contains('.') => {
            format!("https://{text}")
        }
        None => text.to_owned(),
    }
}

pub fn validate(raw: &str) -> Result<String, ApiError> {
    let invalid = || ApiError::bad("invalid_url");
    let candidate = extract(raw);
    if candidate.is_empty() || candidate.len() > MAX_URL_LENGTH {
        return Err(invalid());
    }

    let url = Url::parse(&candidate).map_err(|_| invalid())?;
    if !matches!(url.scheme(), "http" | "https")
        || !url.username().is_empty()
        || url.password().is_some()
    {
        return Err(invalid());
    }

    match url.host() {
        Some(Host::Domain(domain)) => {
            let domain = domain.trim_end_matches('.').to_ascii_lowercase();
            let internal = [
                ".localhost",
                ".local",
                ".internal",
                ".lan",
                ".home",
                ".arpa",
            ];
            if domain == "localhost"
                || !domain.contains('.')
                || internal.iter().any(|s| domain.ends_with(s))
            {
                return Err(invalid());
            }
            // "0x7f.1" and friends parse as domains in some resolvers.
            if domain.parse::<IpAddr>().is_ok() {
                return Err(invalid());
            }
        }
        // A bare address is never a video page on a supported site.
        Some(Host::Ipv4(_) | Host::Ipv6(_)) | None => return Err(invalid()),
    }

    Ok(url.into())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn finds_the_link_in_a_share_text() {
        assert_eq!(
            extract("Bak bu https://vm.tiktok.com/ZMabc/ #fyp"),
            "https://vm.tiktok.com/ZMabc/"
        );
        assert_eq!(
            extract("youtu.be/jNQXAC9IVRw"),
            "https://youtu.be/jNQXAC9IVRw"
        );
        assert_eq!(
            extract("(https://x.com/a/status/1)."),
            "https://x.com/a/status/1"
        );
    }

    #[test]
    fn accepts_ordinary_links() {
        assert!(validate("https://www.youtube.com/watch?v=jNQXAC9IVRw").is_ok());
        assert!(validate("instagram.com/reel/abc").is_ok());
    }

    #[test]
    fn rejects_internal_and_odd_links() {
        for bad in [
            "",
            "hello world",
            "http://127.0.0.1:22/",
            "http://[::1]/",
            "http://localhost:8080/",
            "http://router.lan/",
            "http://intranet/",
            "ftp://example.com/a.mp4",
            "file:///etc/passwd",
            "https://user:pass@youtube.com/",
            "http://10.0.0.1/video",
        ] {
            assert!(validate(bad).is_err(), "{bad} should be rejected");
        }
    }
}
