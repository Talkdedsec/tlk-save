<p align="center">
  <img src="web/public/social.png" alt="tlk-save — any video, one link away" width="720">
</p>

<p align="center">
  <a href="https://talkdedsec.github.io/tlk-save/"><b>talkdedsec.github.io/tlk-save</b></a>
  ·
  <a href="README.tr.md">Türkçe</a>
</p>

# tlk-save

Download videos and audio from YouTube, TikTok, Instagram, X and more than 1800 other sites. Paste a link, pick a quality, done. No ads, no account, no tracking.

- **Real best quality**: 4K, 60 fps and HDR when the site has them, joined into an MP4 that plays everywhere.
- **MP3 / M4A** with cover art, title and artist embedded.
- **Clips, subtitles, covers**: download just a part of a video, its subtitles as SRT, or its cover image in full resolution.
- **From anywhere**: share straight from a phone (install the page to the home screen), or use the one-click bookmark on a computer.
- **Private**: files are deleted from the server 30 minutes after they are ready; nothing about what you download is logged. Recent downloads are kept in your browser only.
- English and Turkish (opens in your browser's language and remembers your pick), light and dark theme, works on any screen size.

## How it works

```
browser ──▶ talkdedsec.github.io/tlk-save   (static site, this repo's web/)
   │
   └──────▶ tlk-save server                  (this repo's server/, Rust)
                 └─ yt-dlp + ffmpeg          (find, download, merge, convert)
```

Browsers are not allowed to pull videos from these sites directly, so a small server does the work. It is a single Rust program that drives the standalone [yt-dlp](https://github.com/yt-dlp/yt-dlp) executable, streams progress to the page and hands back the finished file. The generic extractor is switched off, so the server only ever opens sites yt-dlp knows; it cannot be pointed at private addresses.

## Privacy and security

- The page loads nothing from third parties: no analytics, cookies, fonts or images from other sites. Thumbnails come through the server, so YouTube, TikTok and others never see a visitor.
- A link handed to the page sits after `#` in the address, which browsers never send to any server.
- The server keeps no record of who downloaded what; logs hold only error kinds. Files are deleted 30 minutes after they are ready.
- yt-dlp runs with its generic extractor off, so the server only opens sites it knows and cannot be pointed at private addresses. Only menu choices reach yt-dlp's arguments.
- On Windows the server, yt-dlp and ffmpeg run as the limited LOCAL SERVICE account. `harden.ps1` turns Windows Firewall on, keeps Remote Desktop reachable and closes file sharing and RPC to the internet.

## Run your own server

**Windows Server** (automatic HTTPS through Caddy, starts with Windows, restarts after a crash). In PowerShell opened as administrator:

```powershell
irm https://raw.githubusercontent.com/Talkdedsec/tlk-save/main/server/deploy/windows/install.ps1 | iex
```

To also lock the server down (recommended):

```powershell
irm https://raw.githubusercontent.com/Talkdedsec/tlk-save/main/server/deploy/windows/harden.ps1 | iex
```

**Linux / Docker**:

```bash
docker build -t tlk-save server
docker run -d --restart unless-stopped -p 127.0.0.1:8787:8787 -e TLK_SAVE_ORIGINS=https://your.site tlk-save
```

**On your own computer**: download `tlk-save` from [Releases](https://github.com/Talkdedsec/tlk-save/releases), put `yt-dlp` and `ffmpeg` next to it or on `PATH`, run it, then open the site, click **Server** at the bottom and enter `http://127.0.0.1:8787`.

### Settings

Every flag also works as an environment variable (`tlk-save --help` lists them all).

| Variable | Default | |
|---|---|---|
| `TLK_SAVE_LISTEN` | `127.0.0.1:8787` | Address to listen on |
| `TLK_SAVE_ORIGINS` | `*` | Sites allowed to call the API, comma separated |
| `TLK_SAVE_TRUST_PROXY` | `false` | Read the client address from `X-Forwarded-For` |
| `TLK_SAVE_YTDLP` | `yt-dlp` | yt-dlp executable |
| `TLK_SAVE_FFMPEG` | on `PATH` | ffmpeg folder |
| `TLK_SAVE_COOKIES` | none | `cookies.txt` for sites that refuse anonymous servers |
| `TLK_SAVE_UPDATE_HOURS` | `12` | Run `yt-dlp -U` this often |
| `TLK_SAVE_MAX_DURATION` | `14400` | Longest video, seconds |
| `TLK_SAVE_MAX_FILESIZE_MB` | `2048` | Largest file |
| `TLK_SAVE_FILE_TTL` | `1800` | Seconds a finished file is kept |
| `TLK_SAVE_MAX_TOTAL_GB` | `20` | Disk all downloads together may use |
| `TLK_SAVE_WORKERS` | `3` | Downloads at the same time |
| `TLK_SAVE_JOBS_PER_CLIENT` | `2` | Unfinished downloads per visitor |

### API

| | |
|---|---|
| `GET /api/health` | Status, versions, limits |
| `POST /api/info` `{url}` | Title, thumbnail and the quality menu |
| `POST /api/jobs` `{url, option, start?, end?}` | Start a download, optionally only a part. The same request again reuses the file |
| `GET /api/jobs/{id}` | Job state |
| `GET /api/jobs/{id}/events` | The same, as server-sent events |
| `GET /api/jobs/{id}/file` | The finished file (supports ranges) |
| `GET /api/thumb/{token}` | A thumbnail, fetched by the server so the video site never sees the visitor |
| `DELETE /api/jobs/{id}` | Cancel |

## Development

```bash
cd server && cargo run            # API on 127.0.0.1:8787
cd web && npm install && npm run dev   # site on localhost:5173, talks to the local API
```

Tests: `cargo test` in `server/`, `npm test` in `web/`.

## Use responsibly

Download your own videos, content you have permission for, or content without copyright. You are responsible for what you do with downloaded files.

## License

[MIT](LICENSE). yt-dlp is released under the Unlicense; ffmpeg builds used by the installers are GPL.
