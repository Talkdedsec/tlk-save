import { ArrowDownToLine, Check, ExternalLink, Music, RotateCcw, Video, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  ApiError,
  type Choice,
  type Info,
  type JobView,
  cancelJob,
  createJob,
  fileUrl,
  watchJob,
} from "../lib/api";
import { formatBytes, formatDuration, formatEta, formatSpeed, qualityLabel } from "../lib/format";
import type { HistoryEntry } from "../lib/history";
import { useI18n } from "../lib/i18n";
import { platformById } from "../lib/platforms";
import { BrandIcon } from "./BrandIcon";
import { Notice } from "./Notice";
import { Thumb } from "./Thumb";

type Kind = Choice["kind"];

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

/** 1080p when it exists: big enough for any screen, small enough to arrive quickly. */
function defaultChoice(options: Choice[], kind: Kind): string | undefined {
  const usable = options.filter((o) => o.kind === kind && !o.too_large);
  if (kind === "audio") return usable[0]?.id;
  return (usable.find((o) => (o.height ?? 0) <= 1080) ?? usable[usable.length - 1])?.id;
}

export function choiceName(choice: Choice): string {
  return choice.kind === "video" ? `${qualityLabel(choice.height)} MP4` : choice.ext.toUpperCase();
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
  const hasVideo = info.options.some((o) => o.kind === "video");
  const [kind, setKind] = useState<Kind>(hasVideo ? "video" : "audio");
  const [selected, setSelected] = useState<string | undefined>(() => defaultChoice(info.options, hasVideo ? "video" : "audio"));
  const [download, setDownload] = useState<Download>({ phase: "idle" });
  const stopWatching = useRef<(() => void) | null>(null);

  const options = useMemo(() => info.options.filter((o) => o.kind === kind), [info.options, kind]);
  const choice = info.options.find((o) => o.id === selected);
  const busy = download.phase === "starting" || download.phase === "running";

  useEffect(() => () => stopWatching.current?.(), []);

  const switchKind = (next: Kind) => {
    if (busy || next === kind) return;
    setKind(next);
    setSelected(defaultChoice(info.options, next));
    if (download.phase !== "idle") setDownload({ phase: "idle" });
  };

  const start = async () => {
    if (!choice || busy) return;
    setDownload({ phase: "starting" });
    try {
      const job = await createJob(info.url, choice.id);
      setDownload({ phase: "running", job });
      stopWatching.current = watchJob(job.id, (update) => {
        if (update.state === "ready") {
          setDownload({ phase: "done", job: update });
          saveFile(update.id);
          onDownloaded({
            url: info.url,
            title: info.title,
            thumbnail: info.thumbnail,
            platform: info.platform,
            format: choiceName(choice),
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
  const kinds: Kind[] = hasVideo ? ["video", "audio"] : ["audio"];

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
            style={{ "--count": kinds.length, "--index": kinds.indexOf(kind) } as React.CSSProperties}
          >
            <span className="tab-indicator" aria-hidden="true" />
            {kinds.map((k) => (
              <button
                key={k}
                type="button"
                role="tab"
                className="tab"
                aria-selected={kind === k}
                disabled={busy}
                onClick={() => switchKind(k)}
              >
                {k === "video" ? <Video size={16} /> : <Music size={16} />}
                {t(k === "video" ? "result.video" : "result.audio")}
              </button>
            ))}
          </div>
        ) : null}

        <fieldset className="options" role="radiogroup" aria-label={t(kind === "video" ? "result.video" : "result.audio")} disabled={busy}>
          {options.map((option) => (
            <OptionTile
              key={option.id}
              option={option}
              checked={option.id === selected}
              locale={locale}
              onSelect={() => {
                setSelected(option.id);
                if (download.phase === "done" || download.phase === "failed") setDownload({ phase: "idle" });
              }}
            />
          ))}
        </fieldset>

        {download.phase === "idle" || download.phase === "starting" ? (
          <div className="download-row">
            <button type="button" className="primary-button" onClick={start} disabled={!choice || download.phase === "starting"}>
              {download.phase === "starting" ? (
                <>
                  <span className="spinner" aria-hidden="true" />
                  {t("job.starting")}
                </>
              ) : (
                <>
                  <ArrowDownToLine size={19} strokeWidth={2.3} />
                  {choice ? t("result.download", { label: choiceName(choice) }) : t("form.submit")}
                  {choice?.size ? <span className="size">· {formatBytes(choice.size, locale)}</span> : null}
                </>
              )}
            </button>
          </div>
        ) : null}

        {download.phase === "running" ? <Progress job={download.job} kind={kind} onCancel={cancel} /> : null}

        {download.phase === "done" ? (
          <Done
            job={download.job}
            onAgain={() => setDownload({ phase: "idle" })}
          />
        ) : null}

        {download.phase === "failed" ? (
          <Notice
            code={download.code}
            detail={download.detail}
            vars={{ hours: maxHours }}
            onRetry={() => void start()}
          />
        ) : null}
      </div>
    </article>
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
  const label = option.kind === "video" ? qualityLabel(option.height) : option.ext.toUpperCase();
  const size = option.size ? `≈ ${formatBytes(option.size, locale)}` : t("result.size.unknown");
  const sub = option.too_large
    ? t("result.too_large")
    : option.kind === "audio"
      ? t(option.ext === "mp3" ? "result.mp3.note" : "result.m4a.note")
      : size;

  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      className="option"
      disabled={option.too_large}
      onClick={onSelect}
    >
      <span className="option-top">
        <span className="option-label">{label}</span>
        {option.fps && option.fps > 30 ? <span className="option-tag">{option.fps}</span> : null}
        {option.hdr ? <span className="option-tag hdr">HDR</span> : null}
      </span>
      <span className="option-sub">{sub}</span>
      {option.kind === "audio" && !option.too_large ? <span className="option-sub">{size}</span> : null}
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
        ? t(kind === "video" ? "job.processing.video" : "job.processing.audio")
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
            {job.size ? <span className="tabular" style={{ color: "var(--text-2)", fontWeight: 500 }}> · {formatBytes(job.size, locale)}</span> : null}
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
