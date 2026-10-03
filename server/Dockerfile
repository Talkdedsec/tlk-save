# tlk-save server for Linux hosts.
#   docker build -t tlk-save server
#   docker run -d -p 127.0.0.1:8787:8787 -e TLK_SAVE_ORIGINS=https://your.site tlk-save
# Put a TLS reverse proxy (Caddy, nginx) in front of it for a public site.

FROM rust:1-bookworm AS build
WORKDIR /src
COPY Cargo.toml Cargo.lock ./
COPY src ./src
RUN cargo build --release --locked

FROM debian:bookworm-slim
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl unzip xz-utils \
 && rm -rf /var/lib/apt/lists/* \
 && useradd --system --create-home --home-dir /home/tlk tlk

# The standalone yt-dlp, yt-dlp's own ffmpeg build, and Deno for YouTube.
# yt-dlp lives in the user's home so `yt-dlp -U` can replace itself.
RUN mkdir -p /home/tlk/bin \
 && curl -fsSL -o /home/tlk/bin/yt-dlp https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux \
 && chmod +x /home/tlk/bin/yt-dlp \
 && curl -fsSL https://github.com/yt-dlp/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-linux64-gpl.tar.xz \
    | tar -xJ --strip-components=2 -C /usr/local/bin --wildcards '*/bin/ffmpeg' '*/bin/ffprobe' \
 && curl -fsSL -o /tmp/deno.zip https://github.com/denoland/deno/releases/latest/download/deno-x86_64-unknown-linux-gnu.zip \
 && unzip -o /tmp/deno.zip -d /usr/local/bin && rm /tmp/deno.zip \
 && chown -R tlk:tlk /home/tlk

COPY --from=build /src/target/release/tlk-save /usr/local/bin/tlk-save

USER tlk
ENV TLK_SAVE_LISTEN=0.0.0.0:8787 \
    TLK_SAVE_YTDLP=/home/tlk/bin/yt-dlp \
    TLK_SAVE_WORK_DIR=/tmp/tlk-save
EXPOSE 8787
CMD ["tlk-save"]
