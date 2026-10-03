//! Per-client rate limits and a short cache of link lookups.

use std::{
    collections::{HashMap, VecDeque},
    sync::Mutex,
    time::{Duration, Instant},
};

use axum::http::StatusCode;

use crate::error::ApiError;

const WINDOW: Duration = Duration::from_secs(60);

/// Sliding one-minute window per client and bucket.
#[derive(Default)]
pub struct RateLimiter {
    hits: Mutex<HashMap<(String, &'static str), VecDeque<Instant>>>,
}

impl RateLimiter {
    pub fn check(
        &self,
        client: &str,
        bucket: &'static str,
        per_minute: usize,
    ) -> Result<(), ApiError> {
        let now = Instant::now();
        let mut hits = self.hits.lock().expect("rate limiter lock");
        let queue = hits.entry((client.to_owned(), bucket)).or_default();
        while queue
            .front()
            .is_some_and(|t| now.duration_since(*t) > WINDOW)
        {
            queue.pop_front();
        }
        if queue.len() >= per_minute {
            return Err(ApiError::new("rate_limited", StatusCode::TOO_MANY_REQUESTS));
        }
        queue.push_back(now);
        Ok(())
    }

    /// Drop clients that have been quiet for a full window.
    pub fn prune(&self) {
        let now = Instant::now();
        self.hits
            .lock()
            .expect("rate limiter lock")
            .retain(|_, q| q.back().is_some_and(|t| now.duration_since(*t) <= WINDOW));
    }
}

/// The site asks for info, then starts a job a few seconds later; keeping the
/// answer means the second step can check the choice without asking yt-dlp again.
pub struct Cache<T> {
    items: Mutex<HashMap<String, (Instant, T)>>,
    ttl: Duration,
    capacity: usize,
}

impl<T: Clone> Cache<T> {
    pub fn new(ttl: Duration, capacity: usize) -> Self {
        Self {
            items: Mutex::new(HashMap::new()),
            ttl,
            capacity,
        }
    }

    pub fn get(&self, key: &str) -> Option<T> {
        let mut items = self.items.lock().expect("cache lock");
        match items.get(key) {
            Some((at, value)) if at.elapsed() <= self.ttl => Some(value.clone()),
            Some(_) => {
                items.remove(key);
                None
            }
            None => None,
        }
    }

    pub fn put(&self, key: String, value: T) {
        let mut items = self.items.lock().expect("cache lock");
        if items.len() >= self.capacity {
            let ttl = self.ttl;
            items.retain(|_, (at, _)| at.elapsed() <= ttl);
            if items.len() >= self.capacity
                && let Some(oldest) = items
                    .iter()
                    .min_by_key(|(_, (at, _))| *at)
                    .map(|(k, _)| k.clone())
            {
                items.remove(&oldest);
            }
        }
        items.insert(key, (Instant::now(), value));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn limits_per_client_and_bucket() {
        let limiter = RateLimiter::default();
        assert!(limiter.check("a", "info", 2).is_ok());
        assert!(limiter.check("a", "info", 2).is_ok());
        assert_eq!(
            limiter.check("a", "info", 2).unwrap_err().code,
            "rate_limited"
        );
        assert!(limiter.check("b", "info", 2).is_ok());
        assert!(limiter.check("a", "jobs", 2).is_ok());
    }

    #[test]
    fn cache_evicts_the_oldest_when_full() {
        let cache = Cache::new(Duration::from_secs(60), 2);
        cache.put("a".into(), 1);
        cache.put("b".into(), 2);
        cache.put("c".into(), 3);
        assert_eq!(cache.get("a"), None);
        assert_eq!(cache.get("c"), Some(3));
    }
}
