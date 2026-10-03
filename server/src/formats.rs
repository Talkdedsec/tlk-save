//! What the person can choose, and what each choice means to yt-dlp.
//!
//! The site never sees yt-dlp format codes. It gets a short menu — one entry
//! per resolution that exists, plus two audio files — and sends back an id.
//! An unknown id is rejected, so nothing from outside reaches yt-dlp's argv.

use serde::Serialize;
use serde_json::Value;

/// Labelled by the short side, the way people call a vertical video "1080p".
pub const STANDARD_HEIGHTS: [u32; 9] = [4320, 2160, 1440, 1080, 720, 480, 360, 240, 144];

/// Rough average of an mp3 from LAME -V0, for the size estimate only.
const MP3_KBPS: f64 = 220.0;

const PLATFORMS: &[(&str, &str)] = &[
    ("youtube", "youtube"),
    ("tiktok", "tiktok"),
    ("instagram", "instagram"),
    ("x", "twitter"),
    ("facebook", "facebook"),
    ("reddit", "reddit"),
    ("vimeo", "vimeo"),
    ("twitch", "twitch"),
    ("soundcloud", "soundcloud"),
    ("dailymotion", "dailymotion"),
    ("pinterest", "pinterest"),
    ("bilibili", "bilibili"),
    ("threads", "threads"),
    ("bluesky", "bluesky"),
    ("snapchat", "snapchat"),
    ("kick", "kick"),
    ("tumblr", "tumblr"),
    ("linkedin", "linkedin"),
];

pub fn platform_of(extractor_key: &str) -> &'static str {
    let key = extractor_key.to_ascii_lowercase();
    PLATFORMS
        .iter()
        .find(|(_, prefix)| key.starts_with(prefix))
        .map_or("other", |(platform, _)| platform)
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum Kind {
    Video,
    Audio,
}

#[derive(Debug, Clone, Serialize)]
pub struct Choice {
    pub id: String,
    pub kind: Kind,
    pub ext: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub height: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub fps: Option<u32>,
    #[serde(skip_serializing_if = "std::ops::Not::not")]
    pub hdr: bool,
    /// Bytes, estimated. Absent when the site gives nothing to estimate from.
    pub size: Option<u64>,
    /// Bigger than this server accepts; shown, but cannot be chosen.
    #[serde(skip_serializing_if = "std::ops::Not::not")]
    pub too_large: bool,
}

struct Format<'a>(&'a Value);

impl Format<'_> {
    fn str(&self, key: &str) -> Option<&str> {
        self.0.get(key).and_then(Value::as_str)
    }

    fn num(&self, key: &str) -> Option<f64> {
        self.0.get(key).and_then(Value::as_f64).filter(|n| *n > 0.0)
    }

    fn has_video(&self) -> bool {
        match self.str("vcodec") {
            Some("none") => false,
            Some(_) => true,
            None => self.num("height").is_some() || self.num("width").is_some(),
        }
    }

    fn has_audio(&self) -> bool {
        !matches!(self.str("acodec"), None | Some("none"))
    }

    fn short_side(&self) -> Option<u32> {
        match (self.num("width"), self.num("height")) {
            (Some(w), Some(h)) => Some(w.min(h) as u32),
            (Some(s), None) | (None, Some(s)) => Some(s as u32),
            (None, None) => None,
        }
    }

    fn is_avc(&self) -> bool {
        self.str("vcodec")
            .is_some_and(|c| c.starts_with("avc") || c.starts_with("h264"))
    }

    fn size(&self, duration: Option<f64>) -> Option<u64> {
        self.num("filesize")
            .or_else(|| self.num("filesize_approx"))
            .or_else(|| Some(self.num("tbr")? * 1000.0 / 8.0 * duration?))
            .map(|n| n as u64)
    }
}

/// 1080x1350 is 1080p, 1088 is still 1080p, and 576 is 480p: a label may round
/// down a little but never promises more than the file has.
pub fn snap_height(short_side: u32) -> u32 {
    let tolerant = f64::from(short_side) * 1.05;
    STANDARD_HEIGHTS
        .iter()
        .copied()
        .find(|h| f64::from(*h) <= tolerant)
        .unwrap_or(STANDARD_HEIGHTS[STANDARD_HEIGHTS.len() - 1])
}

pub fn build(info: &Value) -> Vec<Choice> {
    let fallback = [info.clone()];
    let formats: &[Value] = info
        .get("formats")
        .and_then(Value::as_array)
        .map_or(&fallback, Vec::as_slice);
    let formats: Vec<Format> = formats.iter().map(Format).collect();
    let duration = info.get("duration").and_then(Value::as_f64);

    let videos: Vec<&Format> = formats
        .iter()
        .filter(|f| f.has_video() && f.short_side().is_some())
        .collect();
    let audio_only: Vec<&Format> = formats
        .iter()
        .filter(|f| f.has_audio() && !f.has_video())
        .collect();
    let best_audio = {
        let m4a: Vec<&&Format> = audio_only
            .iter()
            .filter(|f| f.str("ext") == Some("m4a"))
            .collect();
        let pool: Vec<&&Format> = if m4a.is_empty() {
            audio_only.iter().collect()
        } else {
            m4a
        };
        pool.into_iter()
            .max_by(|a, b| rate(a).total_cmp(&rate(b)))
            .copied()
    };
    let audio_size = best_audio.and_then(|f| f.size(duration));

    let mut heights: Vec<u32> = videos
        .iter()
        .filter_map(|f| f.short_side())
        .map(snap_height)
        .collect();
    heights.sort_unstable_by(|a, b| b.cmp(a));
    heights.dedup();

    let mut choices: Vec<Choice> = heights
        .into_iter()
        .map(|height| {
            let chosen = pick_video(&videos, height);
            let size = chosen.and_then(|f| {
                let video = f.size(duration)?;
                Some(if f.has_audio() {
                    video
                } else {
                    video + audio_size.unwrap_or(0)
                })
            });
            Choice {
                id: format!("v{height}"),
                kind: Kind::Video,
                ext: "mp4",
                height: Some(height),
                fps: chosen.and_then(|f| f.num("fps")).map(|n| n.round() as u32),
                hdr: chosen
                    .and_then(|f| f.str("dynamic_range"))
                    .is_some_and(|r| r != "SDR"),
                size,
                too_large: false,
            }
        })
        .collect();

    // Some embeds carry no dimensions at all; they still get a plain entry.
    if choices.is_empty() && formats.iter().any(Format::has_video) {
        choices.push(Choice {
            id: "vbest".into(),
            kind: Kind::Video,
            ext: "mp4",
            height: None,
            fps: None,
            hdr: false,
            size: None,
            too_large: false,
        });
    }

    if formats.iter().any(Format::has_audio) {
        choices.push(Choice {
            id: "a-mp3".into(),
            kind: Kind::Audio,
            ext: "mp3",
            height: None,
            fps: None,
            hdr: false,
            size: duration.map(|d| (MP3_KBPS * 1000.0 / 8.0 * d) as u64),
            too_large: false,
        });
        choices.push(Choice {
            id: "a-m4a".into(),
            kind: Kind::Audio,
            ext: "m4a",
            height: None,
            fps: None,
            hdr: false,
            size: audio_size,
            too_large: false,
        });
    }
    choices
}

fn rate(f: &Format) -> f64 {
    f.num("abr").or_else(|| f.num("tbr")).unwrap_or(0.0)
}

/// Roughly what the `-S res:H,vcodec:h264` sort in `args` will pick.
fn pick_video<'a>(videos: &[&'a Format<'a>], height: u32) -> Option<&'a Format<'a>> {
    let fitting: Vec<&Format> = videos
        .iter()
        .copied()
        .filter(|f| f.short_side().is_some_and(|s| snap_height(s) <= height))
        .collect();
    let tallest = fitting.iter().filter_map(|f| f.short_side()).max()?;
    let tier: Vec<&Format> = fitting
        .into_iter()
        .filter(|f| f.short_side() == Some(tallest))
        .collect();
    let avc: Vec<&Format> = tier.iter().copied().filter(|f| f.is_avc()).collect();
    let pool = if avc.is_empty() { tier } else { avc };
    pool.into_iter().max_by(|a, b| {
        let key = |f: &Format| (f.num("fps").unwrap_or(0.0), f.num("tbr").unwrap_or(0.0));
        let (ka, kb) = (key(a), key(b));
        ka.0.total_cmp(&kb.0).then(ka.1.total_cmp(&kb.1))
    })
}

/// yt-dlp arguments for one menu entry. `None` for anything not on the menu.
pub fn args(choice_id: &str) -> Option<Vec<String>> {
    let video = |sort: String| {
        vec![
            "-f".into(),
            "bv*+ba/b".into(),
            "-S".into(),
            sort,
            "--merge-output-format".into(),
            "mp4".into(),
            "--embed-metadata".into(),
        ]
    };
    let audio = |format: &str, codec: &str| {
        [
            "-f",
            format,
            "-x",
            "--audio-format",
            codec,
            "--audio-quality",
            "0",
            "--embed-thumbnail",
            "--convert-thumbnails",
            "jpg",
            "--embed-metadata",
        ]
        .map(String::from)
        .to_vec()
    };

    match choice_id {
        "vbest" => Some(video("vcodec:h264,acodec:aac,ext:mp4:m4a".into())),
        "a-mp3" => Some(audio("ba/b", "mp3")),
        "a-m4a" => Some(audio("ba[ext=m4a]/ba/b", "m4a")),
        id => {
            let height: u32 = id.strip_prefix('v')?.parse().ok()?;
            STANDARD_HEIGHTS
                .contains(&height)
                .then(|| video(format!("res:{height},vcodec:h264,acodec:aac,ext:mp4:m4a")))
        }
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    #[test]
    fn snaps_to_standard_labels() {
        assert_eq!(snap_height(1080), 1080);
        assert_eq!(snap_height(1088), 1080);
        assert_eq!(snap_height(576), 480);
        assert_eq!(snap_height(718), 720);
        assert_eq!(snap_height(480), 480);
        assert_eq!(snap_height(8000), 4320);
    }

    #[test]
    fn names_platforms() {
        assert_eq!(platform_of("Youtube"), "youtube");
        assert_eq!(platform_of("TikTok"), "tiktok");
        assert_eq!(platform_of("Twitter"), "x");
        assert_eq!(platform_of("SomethingElse"), "other");
    }

    #[test]
    fn builds_a_menu_from_youtube_like_formats() {
        let info = json!({
            "duration": 100.0,
            "formats": [
                {"format_id": "140", "ext": "m4a", "vcodec": "none", "acodec": "mp4a.40.2", "abr": 129.0, "filesize": 1_600_000},
                {"format_id": "251", "ext": "webm", "vcodec": "none", "acodec": "opus", "abr": 140.0, "filesize": 1_700_000},
                {"format_id": "137", "ext": "mp4", "vcodec": "avc1.640028", "acodec": "none", "width": 1920, "height": 1080, "fps": 30.0, "filesize": 40_000_000},
                {"format_id": "248", "ext": "webm", "vcodec": "vp9", "acodec": "none", "width": 1920, "height": 1080, "fps": 30.0, "filesize": 30_000_000},
                {"format_id": "136", "ext": "mp4", "vcodec": "avc1.4d401f", "acodec": "none", "width": 1280, "height": 720, "fps": 30.0, "filesize": 20_000_000},
                {"format_id": "18", "ext": "mp4", "vcodec": "avc1.42001E", "acodec": "mp4a.40.2", "width": 640, "height": 360, "fps": 30.0, "filesize": 8_000_000}
            ]
        });
        let menu = build(&info);
        let ids: Vec<&str> = menu.iter().map(|c| c.id.as_str()).collect();
        assert_eq!(ids, ["v1080", "v720", "v360", "a-mp3", "a-m4a"]);
        // The avc 1080p plus the m4a track.
        assert_eq!(menu[0].size, Some(41_600_000));
        // 360p already has sound.
        assert_eq!(menu[2].size, Some(8_000_000));
        assert_eq!(menu[4].size, Some(1_600_000));
    }

    #[test]
    fn vertical_video_is_labelled_by_its_short_side() {
        let info = json!({"formats": [{"vcodec": "h264", "acodec": "aac", "width": 1080, "height": 1920}]});
        assert_eq!(build(&info)[0].id, "v1080");
    }

    #[test]
    fn audio_only_sources_get_no_video_entries() {
        let info = json!({"duration": 60.0, "formats": [{"vcodec": "none", "acodec": "mp3", "ext": "mp3", "abr": 128.0}]});
        let menu = build(&info);
        assert!(menu.iter().all(|c| c.kind == Kind::Audio));
        assert_eq!(menu.len(), 2);
    }

    #[test]
    fn only_menu_ids_become_arguments() {
        assert!(args("v1080").is_some());
        assert!(args("a-mp3").is_some());
        assert!(args("v1081").is_none());
        assert!(args("bestvideo").is_none());
        assert!(args("v1080 --exec rm").is_none());
    }
}
