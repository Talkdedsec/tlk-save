//! The only module that runs yt-dlp.
//!
//! yt-dlp is used as a separate executable, never linked: its extractors are
//! fixed almost daily and `yt-dlp -U` picks the fixes up without a rebuild of
//! this server. Everything it prints is read line by line; the lines this
//! module asks for carry a `TLK` marker so they cannot be confused with noise.

use std::{
    path::{Path, PathBuf},
    process::Stdio,
    sync::Arc,
    time::Duration,
};

use axum::http::StatusCode;
use serde_json::Value;
use tokio::{
    io::{AsyncBufReadExt, AsyncRead, BufReader},
    process::Command,
    sync::{RwLock, mpsc},
};
use tokio_util::sync::CancellationToken;

use crate::{config::Config, error::ApiError, formats, proctree};

const INFO_TIMEOUT: Duration = Duration::from_secs(90);
const STDERR_KEEP: usize = 40;

pub struct Engine {
    cfg: Arc<Config>,
    version: RwLock<Option<String>>,
}

/// What a download reports while it runs.
#[derive(Debug, Clone, PartialEq)]
pub enum Event {
    Progress {
        fraction: f64,
        speed: Option<f64>,
        eta: Option<u64>,
    },
    Processing,
}

impl Engine {
    pub fn new(cfg: Arc<Config>) -> Self {
        Self {
            cfg,
            version: RwLock::new(None),
        }
    }

    fn command(&self) -> Command {
        let mut cmd = Command::new(&self.cfg.ytdlp);
        cmd.args([
            "--ignore-config",
            "--no-warnings",
            "--encoding",
            "utf-8",
            "--no-playlist",
            // Without the generic extractor yt-dlp only opens sites it knows,
            // so a link to an internal address has nothing to be handed to.
            "--use-extractors",
            "default,-generic",
            "--socket-timeout",
            "20",
            "--retries",
            "3",
            "--fragment-retries",
            "3",
            "--concurrent-fragments",
            "4",
            "--windows-filenames",
            "--no-mtime",
            "--no-cache-dir",
        ]);
        if let Some(ffmpeg) = &self.cfg.ffmpeg {
            cmd.arg("--ffmpeg-location").arg(ffmpeg);
        }
        if let Some(cookies) = &self.cfg.cookies {
            cmd.arg("--cookies").arg(cookies);
        }
        proctree::prepare(&mut cmd);
        cmd.stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .kill_on_drop(true);
        #[cfg(windows)]
        cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
        cmd
    }

    pub async fn version(&self) -> Option<String> {
        self.version.read().await.clone()
    }

    /// Ask the executable for its version and remember it. `None` if it is missing.
    pub async fn refresh_version(&self) -> Option<String> {
        let mut cmd = Command::new(&self.cfg.ytdlp);
        cmd.arg("--version").stdin(Stdio::null()).kill_on_drop(true);
        #[cfg(windows)]
        cmd.creation_flags(0x0800_0000);
        let found = match cmd.output().await {
            Ok(out) if out.status.success() => {
                Some(String::from_utf8_lossy(&out.stdout).trim().to_owned())
            }
            _ => None,
        };
        *self.version.write().await = found.clone();
        found
    }

    /// `yt-dlp -U`. Works for the standalone executable, which is what we ship.
    pub async fn self_update(&self) {
        let mut cmd = Command::new(&self.cfg.ytdlp);
        cmd.args(["-U", "--no-warnings"])
            .stdin(Stdio::null())
            .kill_on_drop(true);
        #[cfg(windows)]
        cmd.creation_flags(0x0800_0000);
        match tokio::time::timeout(Duration::from_secs(180), cmd.output()).await {
            Ok(Ok(out)) => {
                let text = String::from_utf8_lossy(&out.stdout);
                let last = text.lines().last().unwrap_or_default().trim();
                tracing::info!(target: "tlk_save::update", "yt-dlp -U: {last}");
            }
            Ok(Err(err)) => {
                tracing::warn!(target: "tlk_save::update", "yt-dlp -U could not start: {err}");
            }
            Err(_) => tracing::warn!(target: "tlk_save::update", "yt-dlp -U timed out"),
        }
        if let Some(version) = self.refresh_version().await {
            tracing::info!(target: "tlk_save::update", "yt-dlp {version}");
        }
    }

    /// Look a link up without downloading. Returns yt-dlp's info JSON.
    pub async fn describe(&self, url: &str) -> Result<Value, ApiError> {
        let mut cmd = self.command();
        cmd.args(["--dump-single-json", "--", url]);
        let child = cmd.spawn().map_err(|err| spawn_error(&err))?;
        let tree = proctree::Tree::attach(&child);
        let Ok(out) = tokio::time::timeout(INFO_TIMEOUT, child.wait_with_output()).await else {
            tree.kill();
            return Err(ApiError::new("timeout", StatusCode::GATEWAY_TIMEOUT));
        };
        let out = out.map_err(|err| {
            ApiError::new("failed", StatusCode::BAD_GATEWAY).with_detail(err.to_string())
        })?;

        if !out.status.success() {
            return Err(ApiError::from_ytdlp(&String::from_utf8_lossy(&out.stderr)));
        }
        serde_json::from_slice(&out.stdout).map_err(|err| {
            ApiError::new("failed", StatusCode::BAD_GATEWAY)
                .with_detail(format!("unreadable yt-dlp output: {err}"))
        })
    }

    /// Download one menu entry into `dir` and return the finished file.
    pub async fn download(
        &self,
        url: &str,
        choice: &str,
        dir: &Path,
        cancel: &CancellationToken,
        mut on_event: impl FnMut(Event),
    ) -> Result<PathBuf, ApiError> {
        let choice_args = formats::args(choice).ok_or_else(|| ApiError::bad("invalid_option"))?;
        tokio::fs::create_dir_all(dir).await.map_err(|err| {
            ApiError::new("failed", StatusCode::INTERNAL_SERVER_ERROR).with_detail(err.to_string())
        })?;

        let mut cmd = self.command();
        cmd.args(&choice_args)
            .arg("--max-filesize")
            .arg(self.cfg.max_filesize().to_string())
            .arg("--paths")
            .arg(format!("home:{}", dir.display()))
            .arg("--paths")
            .arg(format!("temp:{}", dir.join(".part").display()))
            .args([
                "--output",
                "%(title).120B [%(id)s].%(ext)s",
                "--newline",
                "--progress",
                "--progress-template",
                "download:TLKP %(progress.downloaded_bytes)s|%(progress.total_bytes)s|%(progress.total_bytes_estimate)s|%(progress.speed)s|%(progress.eta)s|%(info.format_id)s",
                "--progress-template",
                "postprocess:TLKPP %(progress.status)s|%(progress.postprocessor)s",
                "--print",
                "before_dl:TLKFMT %(requested_formats.:.{format_id,filesize,filesize_approx})j",
                "--print",
                "after_move:TLKFILE %(filepath)s",
                "--",
                url,
            ]);

        let mut child = cmd.spawn().map_err(|err| spawn_error(&err))?;
        let tree = proctree::Tree::attach(&child);
        let (tx, mut rx) = mpsc::unbounded_channel::<(bool, String)>();
        tokio::spawn(read_lines(
            child.stdout.take().expect("piped stdout"),
            false,
            tx.clone(),
        ));
        tokio::spawn(read_lines(
            child.stderr.take().expect("piped stderr"),
            true,
            tx,
        ));

        let mut tracker = Tracker::default();
        let mut file: Option<PathBuf> = None;
        let mut stderr_tail: Vec<String> = Vec::new();

        loop {
            tokio::select! {
                line = rx.recv() => {
                    let Some((is_stderr, line)) = line else { break };
                    if let Some(event) = tracker.feed(&line) {
                        on_event(event);
                    } else if let Some(path) = line.strip_prefix("TLKFILE ") {
                        file = Some(PathBuf::from(path.trim()));
                    } else if is_stderr {
                        stderr_tail.push(line);
                        if stderr_tail.len() > STDERR_KEEP {
                            stderr_tail.remove(0);
                        }
                    }
                }
                () = cancel.cancelled() => {
                    tree.kill();
                    let _ = child.kill().await;
                    return Err(ApiError::new("cancelled", StatusCode::CONFLICT));
                }
            }
        }

        let status = child.wait().await.map_err(|err| {
            ApiError::new("failed", StatusCode::BAD_GATEWAY).with_detail(err.to_string())
        })?;
        if !status.success() {
            return Err(ApiError::from_ytdlp(&stderr_tail.join("\n")));
        }
        // --max-filesize makes yt-dlp skip the file and exit cleanly.
        match file {
            Some(path) if path.is_file() => Ok(path),
            _ => Err(ApiError::new("too_large", StatusCode::UNPROCESSABLE_ENTITY)),
        }
    }
}

fn spawn_error(err: &std::io::Error) -> ApiError {
    tracing::error!("yt-dlp could not be started: {err}");
    ApiError::new("engine_missing", StatusCode::SERVICE_UNAVAILABLE).with_detail(err.to_string())
}

async fn read_lines(
    stream: impl AsyncRead + Unpin,
    is_stderr: bool,
    tx: mpsc::UnboundedSender<(bool, String)>,
) {
    let mut reader = BufReader::new(stream);
    let mut buf = Vec::with_capacity(512);
    loop {
        buf.clear();
        match reader.read_until(b'\n', &mut buf).await {
            Ok(0) | Err(_) => break,
            Ok(_) => {
                let line = String::from_utf8_lossy(&buf)
                    .trim_end_matches(['\r', '\n'])
                    .to_owned();
                if tx.send((is_stderr, line)).is_err() {
                    break;
                }
            }
        }
    }
}

/// Turns per-file progress into one number for the whole download.
///
/// A 1080p download is two files, video then audio, and yt-dlp reports each
/// from zero. The parts are weighted by their expected size, so the bar does
/// not run to the end twice.
#[derive(Debug, Default)]
pub struct Tracker {
    parts: Vec<(String, f64)>,
    best: f64,
}

impl Tracker {
    pub fn feed(&mut self, line: &str) -> Option<Event> {
        if let Some(json) = line.strip_prefix("TLKFMT ") {
            self.set_parts(json.trim());
            return None;
        }
        if let Some(rest) = line.strip_prefix("TLKPP ") {
            let mut fields = rest.split('|');
            let status = fields.next().unwrap_or_default();
            let name = fields.next().unwrap_or_default();
            return (status == "started" && name != "MoveFiles").then_some(Event::Processing);
        }
        let rest = line.strip_prefix("TLKP ")?;
        let f: Vec<&str> = rest.split('|').collect();
        let num = |i: usize| {
            f.get(i)
                .and_then(|s| s.trim().parse::<f64>().ok())
                .filter(|n| n.is_finite() && *n >= 0.0)
        };
        let downloaded = num(0).unwrap_or(0.0);
        let total = num(1).or_else(|| num(2));
        let format_id = f.get(5).map_or("", |s| s.trim());

        let within = total
            .filter(|t| *t > 0.0)
            .map_or(0.0, |t| (downloaded / t).min(1.0));
        let (before, share) = self.position(format_id);
        let fraction = (before + share * within).min(0.999);
        self.best = self.best.max(fraction);
        Some(Event::Progress {
            fraction: self.best,
            speed: num(3),
            eta: num(4).map(|n| n as u64),
        })
    }

    fn set_parts(&mut self, json: &str) {
        let Ok(Value::Array(parts)) = serde_json::from_str::<Value>(json) else {
            return;
        };
        let entries: Vec<(String, Option<f64>)> = parts
            .iter()
            .map(|p| {
                let id = p
                    .get("format_id")
                    .and_then(Value::as_str)
                    .unwrap_or_default()
                    .to_owned();
                let size = ["filesize", "filesize_approx"]
                    .iter()
                    .find_map(|k| p.get(*k).and_then(Value::as_f64));
                (id, size)
            })
            .collect();
        let total: f64 = entries.iter().filter_map(|(_, s)| *s).sum();
        let all_known = entries.iter().all(|(_, s)| s.is_some()) && total > 0.0;
        let even = 1.0 / entries.len().max(1) as f64;
        self.parts = entries
            .into_iter()
            .map(|(id, size)| {
                (
                    id,
                    if all_known {
                        size.unwrap_or(0.0) / total
                    } else {
                        even
                    },
                )
            })
            .collect();
    }

    fn position(&self, format_id: &str) -> (f64, f64) {
        let mut before = 0.0;
        for (id, share) in &self.parts {
            if id == format_id {
                return (before, *share);
            }
            before += share;
        }
        (0.0, 1.0)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fraction(event: Option<Event>) -> f64 {
        match event {
            Some(Event::Progress { fraction, .. }) => fraction,
            other => panic!("expected progress, got {other:?}"),
        }
    }

    #[test]
    fn single_file_progress() {
        let mut t = Tracker::default();
        assert_eq!(t.feed("TLKFMT NA"), None);
        let f = fraction(t.feed("TLKP 50|100|NA|1000.5|3|18"));
        assert!((f - 0.5).abs() < 1e-9);
    }

    #[test]
    fn two_parts_are_weighted_by_size() {
        let mut t = Tracker::default();
        t.feed(r#"TLKFMT [{"format_id":"137","filesize":900},{"format_id":"140","filesize":100}]"#);
        assert!((fraction(t.feed("TLKP 450|900|NA|NA|NA|137")) - 0.45).abs() < 1e-9);
        assert!((fraction(t.feed("TLKP 900|900|NA|NA|NA|137")) - 0.9).abs() < 1e-9);
        assert!((fraction(t.feed("TLKP 50|100|NA|NA|NA|140")) - 0.95).abs() < 1e-9);
    }

    #[test]
    fn never_goes_backwards_or_reaches_one_before_the_end() {
        let mut t = Tracker::default();
        assert!((fraction(t.feed("TLKP 100|100|NA|NA|NA|x")) - 0.999).abs() < 1e-9);
        assert!((fraction(t.feed("TLKP 10|100|NA|NA|NA|x")) - 0.999).abs() < 1e-9);
    }

    #[test]
    fn unknown_sizes_split_evenly_and_estimates_are_used() {
        let mut t = Tracker::default();
        t.feed(r#"TLKFMT [{"format_id":"a","filesize":null},{"format_id":"b"}]"#);
        assert!((fraction(t.feed("TLKP 25|NA|50|NA|NA|b")) - 0.75).abs() < 1e-9);
    }

    #[test]
    fn postprocessing_is_reported_once_it_starts() {
        let mut t = Tracker::default();
        assert_eq!(t.feed("TLKPP started|Merger"), Some(Event::Processing));
        assert_eq!(t.feed("TLKPP finished|Merger"), None);
        assert_eq!(t.feed("TLKPP started|MoveFiles"), None);
        assert_eq!(t.feed("[youtube] something"), None);
    }
}
