//! Settings. Every flag can also come from a `TLK_SAVE_*` environment variable,
//! and every default is safe for a small public instance.

use std::{net::SocketAddr, path::PathBuf, time::Duration};

use clap::Parser;

#[derive(Debug, Clone, Parser)]
#[command(name = "tlk-save", version, about = "HTTP API behind tlk-save")]
pub struct Config {
    /// Address to listen on.
    #[arg(long, env = "TLK_SAVE_LISTEN", default_value = "127.0.0.1:8787")]
    pub listen: SocketAddr,

    /// Origins allowed to call the API from a browser, comma separated. `*` allows any.
    #[arg(
        long,
        env = "TLK_SAVE_ORIGINS",
        value_delimiter = ',',
        default_value = "*"
    )]
    pub origins: Vec<String>,

    /// Take the client address from X-Forwarded-For. Only behind your own reverse proxy.
    #[arg(long, env = "TLK_SAVE_TRUST_PROXY", default_value_t = false)]
    pub trust_proxy: bool,

    /// Where downloads are written while they wait to be fetched.
    #[arg(long, env = "TLK_SAVE_WORK_DIR", default_value_os_t = std::env::temp_dir().join("tlk-save"))]
    pub work_dir: PathBuf,

    /// The yt-dlp executable.
    #[arg(long, env = "TLK_SAVE_YTDLP", default_value = "yt-dlp")]
    pub ytdlp: PathBuf,

    /// Folder (or file) of ffmpeg, if it is not on PATH.
    #[arg(long, env = "TLK_SAVE_FFMPEG")]
    pub ffmpeg: Option<PathBuf>,

    /// A Netscape cookies.txt for sites that refuse anonymous servers.
    #[arg(long, env = "TLK_SAVE_COOKIES")]
    pub cookies: Option<PathBuf>,

    /// Run `yt-dlp -U` this often, in hours. 0 turns it off.
    #[arg(long, env = "TLK_SAVE_UPDATE_HOURS", default_value_t = 12)]
    pub update_hours: u64,

    /// Longest video accepted, in seconds.
    #[arg(long, env = "TLK_SAVE_MAX_DURATION", default_value_t = 4 * 3600)]
    pub max_duration: u64,

    /// Largest file accepted, in megabytes.
    #[arg(long, env = "TLK_SAVE_MAX_FILESIZE_MB", default_value_t = 2048)]
    pub max_filesize_mb: u64,

    /// How long a finished file stays available, in seconds.
    #[arg(long, env = "TLK_SAVE_FILE_TTL", default_value_t = 30 * 60)]
    pub file_ttl: u64,

    /// Downloads running at the same time.
    #[arg(long, env = "TLK_SAVE_WORKERS", default_value_t = 3)]
    pub workers: usize,

    /// Unfinished downloads one client may have.
    #[arg(long, env = "TLK_SAVE_JOBS_PER_CLIENT", default_value_t = 2)]
    pub jobs_per_client: usize,

    /// Link lookups per client per minute.
    #[arg(long, env = "TLK_SAVE_INFO_PER_MINUTE", default_value_t = 20)]
    pub info_per_minute: usize,

    /// Downloads started per client per minute.
    #[arg(long, env = "TLK_SAVE_JOBS_PER_MINUTE", default_value_t = 8)]
    pub jobs_per_minute: usize,
}

impl Config {
    pub fn max_filesize(&self) -> u64 {
        self.max_filesize_mb * 1024 * 1024
    }

    pub fn file_ttl(&self) -> Duration {
        Duration::from_secs(self.file_ttl)
    }

    pub fn jobs_dir(&self) -> PathBuf {
        self.work_dir.join("jobs")
    }
}
