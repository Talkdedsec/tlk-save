//! Download jobs: who may start one, how many run at once, and cleanup.
//!
//! Each job's public state lives in a `watch` channel. A status request reads
//! the current value; an event stream follows it. A restart forgets every
//! job, which is fine: the site shows the error and the person tries again.

use std::{
    collections::HashMap,
    io::ErrorKind,
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};

use axum::http::StatusCode;
use rand::{Rng, distr::Alphanumeric};
use serde::Serialize;
use tokio::sync::{Semaphore, watch};
use tokio_util::sync::CancellationToken;

use crate::{
    config::Config,
    error::ApiError,
    formats::Section,
    ytdlp::{Engine, Event},
};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum State {
    Queued,
    Downloading,
    Processing,
    Ready,
    Error,
    Cancelled,
}

impl State {
    pub fn is_active(self) -> bool {
        matches!(self, Self::Queued | Self::Downloading | Self::Processing)
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct ErrorView {
    pub code: &'static str,
    pub detail: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct JobView {
    pub id: String,
    pub state: State,
    pub progress: f64,
    pub speed: Option<f64>,
    pub eta: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub filename: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub size: Option<u64>,
    /// Unix seconds after which the file is gone.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub expires: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<ErrorView>,
}

pub struct Job {
    pub client: String,
    /// Link, choice and section: two jobs with the same key make the same file.
    key: String,
    pub dir: PathBuf,
    pub cancel: CancellationToken,
    pub view: watch::Sender<JobView>,
    file: Mutex<Option<PathBuf>>,
    finished: Mutex<Option<Instant>>,
}

impl Job {
    pub fn snapshot(&self) -> JobView {
        self.view.borrow().clone()
    }

    pub fn file(&self) -> Option<PathBuf> {
        self.file.lock().expect("job file lock").clone()
    }
}

pub struct Manager {
    cfg: Arc<Config>,
    engine: Arc<Engine>,
    jobs: Mutex<HashMap<String, Arc<Job>>>,
    slots: Arc<Semaphore>,
}

impl Manager {
    pub fn new(cfg: Arc<Config>, engine: Arc<Engine>) -> Self {
        let slots = Arc::new(Semaphore::new(cfg.workers.max(1)));
        Self {
            cfg,
            engine,
            jobs: Mutex::new(HashMap::new()),
            slots,
        }
    }

    pub fn get(&self, id: &str) -> Result<Arc<Job>, ApiError> {
        self.jobs
            .lock()
            .expect("jobs lock")
            .get(id)
            .cloned()
            .ok_or_else(|| ApiError::new("not_found", StatusCode::NOT_FOUND))
    }

    pub fn active(&self) -> usize {
        self.jobs
            .lock()
            .expect("jobs lock")
            .values()
            .filter(|j| j.view.borrow().state.is_active())
            .count()
    }

    /// Start a download, or hand back the job already making (or holding) the
    /// same file. A reused finished file gets a fresh lifetime.
    pub fn create(
        self: &Arc<Self>,
        url: String,
        choice: String,
        section: Option<Section>,
        client: &str,
    ) -> Result<JobView, ApiError> {
        let key = format!(
            "{url}
{choice}
{section:?}"
        );
        if let Some(view) = self.reuse(&key) {
            return Ok(view);
        }
        let id: String = rand::rng()
            .sample_iter(&Alphanumeric)
            .take(16)
            .map(char::from)
            .collect();
        let view = JobView {
            id: id.clone(),
            state: State::Queued,
            progress: 0.0,
            speed: None,
            eta: None,
            filename: None,
            size: None,
            expires: None,
            error: None,
        };
        let job = Arc::new(Job {
            client: client.to_owned(),
            key,
            dir: self.cfg.jobs_dir().join(&id),
            cancel: CancellationToken::new(),
            view: watch::Sender::new(view.clone()),
            file: Mutex::new(None),
            finished: Mutex::new(None),
        });

        if dir_size(&self.cfg.jobs_dir()) >= self.cfg.max_total() {
            return Err(ApiError::new(
                "server_full",
                StatusCode::SERVICE_UNAVAILABLE,
            ));
        }

        {
            let mut jobs = self.jobs.lock().expect("jobs lock");
            let running = jobs
                .values()
                .filter(|j| j.client == client && j.view.borrow().state.is_active())
                .count();
            if running >= self.cfg.jobs_per_client {
                return Err(ApiError::new("busy", StatusCode::TOO_MANY_REQUESTS));
            }
            jobs.insert(id, job.clone());
        }

        let manager = Arc::clone(self);
        tokio::spawn(async move { manager.run(job, url, choice, section).await });
        Ok(view)
    }

    fn reuse(&self, key: &str) -> Option<JobView> {
        let jobs = self.jobs.lock().expect("jobs lock");
        let job = jobs.values().find(|j| {
            j.key == key
                && match j.view.borrow().state {
                    State::Ready => j.file().is_some_and(|f| f.is_file()),
                    state => state.is_active(),
                }
        })?;
        if job.view.borrow().state == State::Ready {
            *job.finished.lock().expect("job finished lock") = Some(Instant::now());
            let expires = unix_now() + self.cfg.file_ttl;
            job.view.send_modify(|v| v.expires = Some(expires));
        }
        Some(job.snapshot())
    }

    async fn run(&self, job: Arc<Job>, url: String, choice: String, section: Option<Section>) {
        let permit = tokio::select! {
            permit = self.slots.clone().acquire_owned() => permit.expect("semaphore is never closed"),
            () = job.cancel.cancelled() => return self.finish(&job, Err(ApiError::new("cancelled", StatusCode::CONFLICT))).await,
        };
        job.view.send_modify(|v| v.state = State::Downloading);

        let view = job.view.clone();
        let result = self
            .engine
            .download(
                &url,
                &choice,
                section,
                &job.dir,
                &job.cancel,
                move |event| {
                    view.send_modify(|v| match event {
                        Event::Progress {
                            fraction,
                            speed,
                            eta,
                        } => {
                            v.progress = v.progress.max(fraction);
                            v.speed = speed;
                            v.eta = eta;
                        }
                        Event::Processing => {
                            v.state = State::Processing;
                            v.speed = None;
                            v.eta = None;
                        }
                    });
                },
            )
            .await;
        drop(permit);
        self.finish(&job, result).await;
    }

    async fn finish(&self, job: &Job, result: Result<PathBuf, ApiError>) {
        *job.finished.lock().expect("job finished lock") = Some(Instant::now());
        let expires = unix_now() + self.cfg.file_ttl;

        match result {
            Ok(path) => {
                let size = tokio::fs::metadata(&path).await.ok().map(|m| m.len());
                let filename = path.file_name().map(|n| n.to_string_lossy().into_owned());
                *job.file.lock().expect("job file lock") = Some(path);
                job.view.send_modify(|v| {
                    v.state = State::Ready;
                    v.progress = 1.0;
                    v.speed = None;
                    v.eta = None;
                    v.filename = filename;
                    v.size = size;
                    v.expires = Some(expires);
                });
            }
            Err(err) => {
                let state = if err.code == "cancelled" {
                    State::Cancelled
                } else {
                    State::Error
                };
                if state == State::Error {
                    // Only the kind of failure: no link, title or visitor in the log.
                    tracing::info!(code = err.code, "download failed");
                }
                job.view.send_modify(|v| {
                    v.state = state;
                    v.speed = None;
                    v.eta = None;
                    v.error = Some(ErrorView {
                        code: err.code,
                        detail: err.detail,
                    });
                });
                remove_dir(&job.dir).await;
            }
        }
    }

    /// Forget finished jobs older than the file lifetime and delete their files.
    pub async fn sweep(&self) -> usize {
        let ttl = self.cfg.file_ttl();
        let expired: Vec<Arc<Job>> = {
            let mut jobs = self.jobs.lock().expect("jobs lock");
            let old: Vec<String> = jobs
                .iter()
                .filter(|(_, j)| {
                    j.finished
                        .lock()
                        .expect("job finished lock")
                        .is_some_and(|t| t.elapsed() > ttl)
                })
                .map(|(id, _)| id.clone())
                .collect();
            old.iter().filter_map(|id| jobs.remove(id)).collect()
        };
        for job in &expired {
            remove_dir(&job.dir).await;
        }

        // Folders no job points at: a delete that lost a race with a file lock.
        let known: Vec<PathBuf> = self
            .jobs
            .lock()
            .expect("jobs lock")
            .values()
            .map(|j| j.dir.clone())
            .collect();
        if let Ok(mut entries) = tokio::fs::read_dir(self.cfg.jobs_dir()).await {
            while let Ok(Some(entry)) = entries.next_entry().await {
                let path = entry.path();
                if !known.contains(&path) {
                    remove_dir(&path).await;
                }
            }
        }
        expired.len()
    }

    pub fn spawn_sweeper(self: &Arc<Self>) {
        let manager = Arc::clone(self);
        tokio::spawn(async move {
            let mut tick = tokio::time::interval(Duration::from_secs(30));
            loop {
                tick.tick().await;
                let removed = manager.sweep().await;
                if removed > 0 {
                    tracing::debug!(removed, "expired downloads removed");
                }
            }
        });
    }
}

/// Windows keeps a file locked for a moment after the process holding it is
/// killed, so a delete right after a cancel is retried before giving up.
async fn remove_dir(path: &Path) {
    for attempt in 1..=10 {
        match tokio::fs::remove_dir_all(path).await {
            Ok(()) => return,
            Err(err) if err.kind() == ErrorKind::NotFound => return,
            Err(err) if attempt == 10 => {
                tracing::warn!("could not remove {}: {err}", path.display());
            }
            Err(_) => tokio::time::sleep(Duration::from_millis(300)).await,
        }
    }
}

fn unix_now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

/// Bytes under a folder, counted without following links.
fn dir_size(path: &Path) -> u64 {
    let Ok(entries) = std::fs::read_dir(path) else {
        return 0;
    };
    entries
        .filter_map(Result::ok)
        .filter_map(|entry| {
            let meta = entry.metadata().ok()?;
            Some(if meta.is_dir() {
                dir_size(&entry.path())
            } else {
                meta.len()
            })
        })
        .sum()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn counts_nested_files() {
        let root = std::env::temp_dir().join(format!("tlk-save-size-{}", std::process::id()));
        std::fs::create_dir_all(root.join("a/b")).unwrap();
        std::fs::write(root.join("x"), [0u8; 10]).unwrap();
        std::fs::write(root.join("a/b/y"), [0u8; 32]).unwrap();
        assert_eq!(dir_size(&root), 42);
        std::fs::remove_dir_all(&root).unwrap();
        assert_eq!(dir_size(&root), 0);
    }
}
