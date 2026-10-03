// Numbers for people: sizes, durations, speeds, all in the visitor's locale.

const UNITS = ["B", "KB", "MB", "GB", "TB"] as const;

export function formatBytes(bytes: number | null | undefined, locale: string): string {
  if (bytes == null || !Number.isFinite(bytes) || bytes < 0) return "";
  let value = bytes;
  let unit = 0;
  while (value >= 1000 && unit < UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const digits = unit === 0 || value >= 100 ? 0 : value >= 10 ? 1 : 2;
  const number = new Intl.NumberFormat(locale, { maximumFractionDigits: digits }).format(value);
  return `${number} ${UNITS[unit]}`;
}

export function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return "";
  const total = Math.round(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

export function formatSpeed(bytesPerSecond: number | null | undefined, locale: string): string {
  const size = formatBytes(bytesPerSecond, locale);
  return size ? `${size}/s` : "";
}

/** "12 sn" / "3 dk" style remaining time; empty when unknown or zero. */
export function formatEta(seconds: number | null | undefined, locale: string): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) return "";
  const unit = seconds >= 3600 ? "hour" : seconds >= 60 ? "minute" : "second";
  const value = unit === "hour" ? seconds / 3600 : unit === "minute" ? seconds / 60 : seconds;
  return new Intl.NumberFormat(locale, {
    style: "unit",
    unit,
    unitDisplay: "short",
    maximumFractionDigits: 0,
  }).format(Math.ceil(value));
}

/** "4K", "1440p" … the way quality is usually spoken about. */
export function qualityLabel(height: number | undefined): string {
  if (!height) return "Best";
  if (height >= 4320) return "8K";
  if (height >= 2160) return "4K";
  return `${height}p`;
}
