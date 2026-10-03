import {
  ArrowDownToLine,
  Captions,
  Check,
  ExternalLink,
  Image as ImageIcon,
  Music,
  RotateCcw,
  Scissors,
  Video,
  X,
} from "lucide-react";
import { type CSSProperties, useEffect, useMemo, useRef, useState } from "react";

import {
  ApiError,
  type Choice,
  type Info,
  type JobView,
  type Section,
  cancelJob,
  createJob,
  fileUrl,
  watchJob,
} from "../lib/api";
import { formatBytes, formatDuration, formatEta, formatSpeed, parseTime, qualityLabel } from "../lib/format";
import type { HistoryEntry } from "../lib/history";
import { type MessageKey, useI18n } from "../lib/i18n";
import { platformById } from "../lib/platforms";
import { BrandIcon } from "./BrandIcon";
import { Notice } from "./Notice";
import { Thumb } from "./Thumb";

type Kind = Choice["kind"];

const KINDS: { kind: Kind; icon: typeof Video; label: MessageKey }[] = [
  { kind: "video", icon: Video, label: "result.video" },
  { kind: "audio", icon: Music, label: "result.audio" },
  { kind: "subtitle", icon: Captions, label: "result.subtitle" },
  { kind: "image", icon: ImageIcon, label: "result.image" },
];

type Download =
  | { phase: "idle" }
  | { phase: "starting" }
  | { phase: "running"; job: JobView }
  | { phase: "done"; job: JobView }
  | { phase: "failed"; code: string; detail: string };

interface Props {
  info: Info;
  maxHours: number;
  onDownloaded: (entry: HistoryEntry) => void;
}

/** "İngilizce" for "en" in Turkish, "English" in English; the site's own name as a fallback. */
function languageName(choice: Choice, locale: string): string {
  if (choice.lang) {
    try {
      const name = new Intl.DisplayNames([locale], { type: "language" }).of(choice.lang);
      if (name && name !== choice.lang) return name.charAt(0).toLocaleUpperCase(locale) + name.slice(1);
    } catch {
      /* not a code Intl knows */
    }
  }
  return choice.name ?? choice.lang ?? "?";
}

/**
 * Video: 1080p when it exists — big enough for any screen, quick to arrive.
 * Subtitles: the visitor's language, then English, then whatever comes first.
 */
function defaultChoice(options: Choice[], kind: Kind, locale: string): string | undefined {
  const usable = options.filter((o) => o.kind === kind && !o.too_large);
  if (kind === "video") return (usable.find((o) => (o.height ?? 0) <= 1080) ?? usable[usable.length - 1])?.id;
  if (kind === "subtitle") {
    const pick = (lang: string) => usable.find((o) => o.lang === lang && !o.auto) ?? usable.find((o) => o.lang === lang);
    return (pick(locale) ?? pick("en") ?? usable[0])?.id;
  }
  return usable[0]?.id;
}

export function choiceName(choice: Choice, locale: string): string {
  switch (choice.kind) {
    case "video":
      return `${qualityLabel(choice.height)} MP4`;
    case "subtitle":
      return `${languageName(choice, locale)} SRT`;
    default:
      return choice.ext.toUpperCase();
  }
}

function saveFile(jobId: string) {
  // The server answers with Content-Disposition: attachment, so this
  // downloads in place instead of navigating away.
  const link = document.createElement("a");
  link.href = fileUrl(jobId);
  link.rel = "noopener";
  document.body.append(link);
  link.click();
  link.remove();
}

export function ResultCard({ info, maxHours, onDownloaded }: Props) {
  const { t, locale } = useI18n();
  const platform = platformById(info.platform);
  const kinds = KINDS.filter(({ kind }) => info.options.some((o) => o.kind === kind));
  const firstKind = kinds[0]?.kind ?? "video";
  const [kind, setKind] = useState<Kind>(firstKind);
  const [selected, setSelected] = useState<string | undefined>(() => defaultChoice(info.options, firstKind, locale));
  const [download, setDownload] = useState<Download>({ phase: "idle" });
  const [clip, setClip] = useState({ on: false, start: "0:00", end: formatDuration(info.duration) });
  const stopWatching = useRef<(() => void) | null>(null);

  const options = useMemo(() => info.options.filter((o) => o.kind === kind), [info.options, kind]);
  const choice = info.options.find((o) => o.id === selected);
  const busy = download.phase === "starting" || download.phase === "running";

  const canClip = (kind === "video" || kind === "audio") && (info.duration ?? 0) >= 2;
  const section: Section | null | undefined = useMemo(() => {
    if (!canClip || !clip.on) return undefined;
    const start = parseTime(clip.start);
    const end = parseTime(clip.end);
    const duration = info.duration ?? Infinity;
    if (start === null || end === null || end - start < 1 || end > duration + 1) return null;
    return { start, end };
  }, [canClip, clip, info.duration]);

  useEffect(() => () => stopWatching.current?.(), []);

  const reset = () => {
    if (download.phase !== "idle" && !busy) setDownload({ phase: "idle" });
  };

  const switchKind = (next: Kind) => {
    if (busy || next === kind) return;
    setKind(next);
    setSelected(defaultChoice(info.options, next, locale));
    reset();
  };

  const start = async () => {
    if (!choice || busy || section === null) return;
    const cut = section ?? undefined;
    setDownload({ phase: "starting" });
    try {
      const job = await createJob(info.url, choice.id, cut);
      setDownload({ phase: "running", job });
      stopWatching.current = watchJob(job.id, (update) => {
        if (update.state === "ready") {
          setDownload({ phase: "done", job: update });
          saveFile(update.id);
          const range = cut ? ` · ${formatDuration(cut.start)}–${formatDuration(cut.end)}` : "";
          onDownloaded({
            url: info.url,
            title: info.title,
            thumbnail: info.thumbnail,
            platform: info.platform,
            format: choiceName(choice, locale) + range,
            at: Date.now(),
          });
        } else if (update.state === "error" || update.state === "cancelled") {
          setDownload({
            phase: "failed",
            code: update.error?.code ?? (update.state === "cancelled" ? "cancelled" : "failed"),
            detail: update.error?.detail ?? "",
          });
        } else {
          setDownload({ phase: "running", job: update });
        }
      });
    } catch (error) {
      const err = error instanceof ApiError ? error : new ApiError("failed", String(error));
      setDownload({ phase: "failed", code: err.code, detail: err.detail });
    }
  };

  const cancel = async () => {
    if (download.phase !== "running") return;
    stopWatching.current?.();
    setDownload({ phase: "idle" });
    try {
      await cancelJob(download.job.id);
    } catch {
      /* the job may have just finished; nothing to undo */
    }
  };

  const meta = [info.uploader, formatDuration(info.duration)].filter(Boolean);
  // A clip is roughly its share of the whole file.
  const size =
    choice?.size && section && info.duration ? (choice.size * (section.end - section.start)) / info.duration : choice?.size;

  return (
    <article className="result" aria-labelledby="result-title">
      <div className={`result-head${info.vertical ? " vertical" : ""}`}>
        <div className="thumb">
          <Thumb src={info.thumbnail} />
          {platform ? (
            <span className="thumb-badge top">
              <BrandIcon platform={platform} size={12} />
              {platform.name}
            </span>
          ) : null}
          {info.duration ? <span className="thumb-badge bottom">{formatDuration(info.duration)}</span> : null}
        </div>
        <div className="result-meta">
          <h2 className="result-title" id="result-title" title={info.title}>
            {info.title}
          </h2>
          {meta.length ? (
            <div className="result-sub">
              {meta.map((part, i) => (
                <span key={i} className={i ? "dot" : undefined}>
                  {part}
                </span>
              ))}
            </div>
          ) : null}
          <div className="result-links">
            <a className="small-link" href={info.url} target="_blank" rel="noreferrer noopener">
              <ExternalLink size={14} />
              {t("result.open")}
            </a>
          </div>
        </div>
      </div>

      <div className="result-body">
        {kinds.length > 1 ? (
          <div
            className="tabs"
            role="tablist"
            style={{ "--count": kinds.length, "--index": kinds.findIndex((k) => k.kind === kind) } as CSSProperties}
          >
            <span className="tab-indicator" aria-hidden="true" />
            {kinds.map(({ kind: k, icon: Icon, label }) => (
              <button
                key={k}
                type="button"
                role="tab"
                className="tab"
                aria-selected={kind === k}
                disabled={busy}
                onClick={() => switchKind(k)}
              >
                <Icon size={16} aria-hidden="true" />
                {t(label)}
              </button>
            ))}
          </div>
        ) : null}

        <fieldset className="options" role="radiogroup" aria-label={t(KINDS.find((k) => k.kind === kind)?.label ?? "result.video")} disabled={busy}>
          {options.map((option) => (
            <OptionTile
              key={option.id}
              option={option}
              checked={option.id === selected}
              locale={locale}
              onSelect={() => {
                setSelected(option.id);
                reset();
              }}
            />
          ))}
        </fieldset>

        {canClip ? (
          <ClipPanel
            clip={clip}
            duration={info.duration ?? 0}
            section={section}
            disabled={busy}
            onChange={(next) => {
              setClip(next);
              reset();
            }}
          />
        ) : null}

        {download.phase === "idle" || download.phase === "starting" ? (
          <div className="download-row">
            <button
              type="button"
              className="primary-button"
              onClick={start}
              disabled={!choice || download.phase === "starting" || section === null}
            >
              {download.phase === "starting" ? (
                <>
                  <span className="spinner" aria-hidden="true" />
                  {t("job.starting")}
                </>
              ) : (
                <>
                  {section ? <Scissors size={18} strokeWidth={2.3} /> : <ArrowDownToLine size={19} strokeWidth={2.3} />}
                  {choice ? t("result.download", { label: choiceName(choice, locale) }) : t("form.submit")}
                  {size ? <span className="size">· {section ? "≈ " : ""}{formatBytes(size, locale)}</span> : null}
                </>
              )}
            </button>
          </div>
        ) : null}

        {download.phase === "running" ? <Progress job={download.job} kind={kind} onCancel={cancel} /> : null}

        {download.phase === "done" ? <Done job={download.job} onAgain={() => setDownload({ phase: "idle" })} /> : null}

        {download.phase === "failed" ? (
          <Notice code={download.code} detail={download.detail} vars={{ hours: maxHours }} onRetry={() => void start()} />
        ) : null}
      </div>
    </article>
  );
}

interface Clip {
  on: boolean;
  start: string;
  end: string;
}

function ClipPanel({
  clip,
  duration,
  section,
  disabled,
  onChange,
}: {
  clip: Clip;
  duration: number;
  section: Section | null | undefined;
  disabled: boolean;
  onChange: (clip: Clip) => void;
}) {
  const { t } = useI18n();
  const invalid = clip.on && section === null;

  return (
    <div className={`clip${clip.on ? " open" : ""}`}>
      <label className="clip-toggle">
        <input
          type="checkbox"
          checked={clip.on}
          disabled={disabled}
          onChange={(event) => onChange({ ...clip, on: event.target.checked })}
        />
        <span className="switch" aria-hidden="true" />
        <Scissors size={15} aria-hidden="true" />
        {t("clip.toggle")}
      </label>
      {clip.on ? (
        <div className="clip-body">
          <div className="clip-fields">
            {(["start", "end"] as const).map((field) => (
              <label key={field} className="clip-field">
                <span>{t(field === "start" ? "clip.start" : "clip.end")}</span>
                <input
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  spellCheck={false}
                  value={clip[field]}
                  disabled={disabled}
                  aria-invalid={invalid}
                  onChange={(event) => onChange({ ...clip, [field]: event.target.value })}
                />
              </label>
            ))}
            {section ? (
              <span className="clip-length tabular">
                {t("clip.length", { length: formatDuration(section.end - section.start) })}
              </span>
            ) : null}
          </div>
          <p className={`clip-hint${invalid ? " bad" : ""}`} aria-live="polite">
            {invalid ? t("clip.invalid") : t("clip.hint", { duration: formatDuration(duration) })}
          </p>
        </div>
      ) : null}
    </div>
  );
}

function OptionTile({
  option,
  checked,
  locale,
  onSelect,
}: {
  option: Choice;
  checked: boolean;
  locale: string;
  onSelect: () => void;
}) {
  const { t } = useI18n();
  const size = option.size ? `≈ ${formatBytes(option.size, locale)}` : t("result.size.unknown");

  let label: string;
  let sub: string;
  let extra: string | null = null;
  switch (option.kind) {
    case "video":
      label = qualityLabel(option.height);
      sub = option.too_large ? t("result.too_large") : size;
      break;
    case "audio":
      label = option.ext.toUpperCase();
      sub = option.too_large ? t("result.too_large") : t(option.ext === "mp3" ? "result.mp3.note" : "result.m4a.note");
      extra = option.too_large ? null : size;
      break;
    case "subtitle":
      label = languageName(option, locale);
      sub = t("result.sub.note");
      break;
    case "image":
      label = t("result.image.label");
      sub = t("result.image.note");
      break;
  }

  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      className={`option${option.kind === "subtitle" || option.kind === "image" ? " wide" : ""}`}
      disabled={option.too_large}
      onClick={onSelect}
    >
      <span className="option-top">
        <span className="option-label">{label}</span>
        {option.fps && option.fps > 30 ? <span className="option-tag">{option.fps}</span> : null}
        {option.hdr ? <span className="option-tag hdr">HDR</span> : null}
        {option.auto ? <span className="option-tag">{t("result.sub.auto")}</span> : null}
      </span>
      <span className="option-sub">{sub}</span>
      {extra ? <span className="option-sub">{extra}</span> : null}
      {checked ? (
        <span className="option-check" aria-hidden="true">
          <Check size={12} strokeWidth={3.2} />
        </span>
      ) : null}
    </button>
  );
}

function Progress({ job, kind, onCancel }: { job: JobView; kind: Kind; onCancel: () => void }) {
  const { t, locale } = useI18n();
  const processing = job.state === "processing";
  const percent = Math.min(99, Math.floor(job.progress * 100));
  const label =
    job.state === "queued"
      ? t("job.queued")
      : processing
        ? t(kind === "video" ? "job.processing.video" : kind === "audio" ? "job.processing.audio" : "job.processing")
        : t("job.downloading");
  const speed = formatSpeed(job.speed, locale);
  const eta = formatEta(job.eta, locale);

  return (
    <div className="progress">
      <div className="progress-top">
        <span className="progress-state" aria-live="polite">
          <span className="spinner" aria-hidden="true" />
          {label}
        </span>
        {!processing && job.state !== "queued" ? <span className="progress-percent">{percent}%</span> : null}
      </div>
      <div
        className={`bar${processing || job.state === "queued" ? " indeterminate" : ""}`}
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={processing ? undefined : percent}
      >
        <span className="bar-fill" style={{ width: `${Math.max(percent, 2)}%` }} />
      </div>
      <div className="progress-bottom">
        <span>{[speed, eta && t("job.left", { eta })].filter(Boolean).join(" · ") || " "}</span>
        <button type="button" className="ghost-button" onClick={onCancel}>
          <X size={15} />
          {t("job.cancel")}
        </button>
      </div>
    </div>
  );
}

function Done({ job, onAgain }: { job: JobView; onAgain: () => void }) {
  const { t, locale } = useI18n();
  const minutes = job.expires ? Math.max(1, Math.round((job.expires * 1000 - Date.now()) / 60000)) : null;
  const when = minutes ? new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(minutes, "minute") : null;
  const [before, after] = t("job.saved", { link: "\u0000" }).split("\u0000");

  return (
    <div className="done" role="status">
      <div className="done-top">
        <span className="done-icon" aria-hidden="true">
          <Check size={20} strokeWidth={3} />
        </span>
        <div style={{ minWidth: 0 }}>
          <div className="done-title">
            {t("job.ready")}
            {job.size ? (
              <span className="tabular" style={{ color: "var(--text-2)", fontWeight: 500 }}>
                {" "}
                · {formatBytes(job.size, locale)}
              </span>
            ) : null}
          </div>
          {job.filename ? (
            <span className="done-file" title={job.filename}>
              {job.filename}
            </span>
          ) : null}
        </div>
      </div>
      <p className="done-text">
        {before}
        <a href={fileUrl(job.id)}>{t("job.saved.link")}</a>
        {after}
        {when ? ` ${t("job.expires", { time: when })}` : null}
      </p>
      <div className="done-actions">
        <button type="button" className="secondary-button" onClick={onAgain}>
          <RotateCcw size={15} />
          {t("job.again")}
        </button>
      </div>
    </div>
  );
}
