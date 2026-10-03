// Talking to the tlk-save server. The site works with any copy of it: the
// default one this build was made for, one given as ?api=, or one the visitor
// set in the server dialog (for example their own machine).

import { load, save } from "./storage";

export interface Choice {
  id: string;
  kind: "video" | "audio" | "subtitle" | "image";
  ext: string;
  height?: number;
  fps?: number;
  hdr?: boolean;
  size: number | null;
  too_large?: boolean;
  // Subtitles: language code, the site's name for it, and whether it is machine-made.
  lang?: string;
  name?: string;
  auto?: boolean;
}

export interface Section {
  start: number;
  end: number;
}

export interface Info {
  id: string | null;
  title: string;
  uploader: string | null;
  duration: number | null;
  thumbnail: string | null;
  platform: string;
  url: string;
  vertical: boolean;
  options: Choice[];
}

export type JobState = "queued" | "downloading" | "processing" | "ready" | "error" | "cancelled";

export interface JobView {
  id: string;
  state: JobState;
  progress: number;
  speed: number | null;
  eta: number | null;
  filename?: string;
  size?: number;
  expires?: number;
  error?: { code: string; detail: string };
}

export interface Health {
  ok: boolean;
  version: string;
  ytdlp: string | null;
  active: number;
  workers: number;
  limits: { max_duration: number; max_filesize: number; file_ttl: number };
}

export class ApiError extends Error {
  constructor(
    public readonly code: string,
    public readonly detail = "",
    public readonly status = 0,
  ) {
    super(code);
  }
}

const DEFAULT_API = (import.meta.env.VITE_API_URL as string | undefined)?.trim() || "";
const OVERRIDE_KEY = "api";

function clean(base: string): string {
  return base.trim().replace(/\/+$/, "");
}

/** ?api= wins and is remembered, so a shared link to a private server keeps working. */
function initialBase(): string {
  try {
    const fromQuery = new URLSearchParams(location.search).get("api");
    if (fromQuery) {
      save(OVERRIDE_KEY, clean(fromQuery));
      return clean(fromQuery);
    }
  } catch {
    /* not in a browser (tests) */
  }
  return load<string>(OVERRIDE_KEY, "") || DEFAULT_API;
}

let base = clean(initialBase());

export const defaultApi = clean(DEFAULT_API);
export const apiBase = () => base;
export const usingCustomApi = () => base !== defaultApi;

export function setApiBase(next: string | null): void {
  const value = next ? clean(next) : "";
  save(OVERRIDE_KEY, value && value !== defaultApi ? value : null);
  base = value || defaultApi;
}

async function request<T>(path: string, init?: RequestInit, root = base): Promise<T> {
  if (!root) throw new ApiError("no_server");
  let response: Response;
  try {
    response = await fetch(`${root}${path}`, {
      ...init,
      headers: init?.body ? { "Content-Type": "application/json" } : undefined,
    });
  } catch (error) {
    if ((error as Error).name === "AbortError") throw error;
    throw new ApiError("network");
  }
  const body = (await response.json().catch(() => null)) as
    | (T & { error?: { code: string; detail?: string } })
    | null;
  if (!response.ok || body === null) {
    const code = body?.error?.code ?? (response.status === 429 ? "rate_limited" : "failed");
    throw new ApiError(code, body?.error?.detail ?? "", response.status);
  }
  return body;
}

export function getHealth(root = base, signal?: AbortSignal): Promise<Health> {
  return request<Health>("/api/health", { signal }, clean(root));
}

export function getInfo(url: string, signal?: AbortSignal): Promise<Info> {
  return request<Info>("/api/info", { method: "POST", body: JSON.stringify({ url }), signal });
}

export function createJob(url: string, option: string, section?: Section): Promise<JobView> {
  return request<JobView>("/api/jobs", { method: "POST", body: JSON.stringify({ url, option, ...section }) });
}

export function cancelJob(id: string): Promise<JobView> {
  return request<JobView>(`/api/jobs/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export function fileUrl(id: string): string {
  return `${base}/api/jobs/${encodeURIComponent(id)}/file`;
}

const isFinal = (state: JobState) => state === "ready" || state === "error" || state === "cancelled";

/**
 * Follow a job until it ends. Uses server-sent events and falls back to
 * polling if the stream cannot be opened or drops (some proxies buffer it).
 * Returns a function that stops following.
 */
export function watchJob(id: string, onUpdate: (job: JobView) => void): () => void {
  let stopped = false;
  let source: EventSource | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const deliver = (job: JobView) => {
    if (stopped) return;
    onUpdate(job);
    if (isFinal(job.state)) stop();
  };

  const poll = async () => {
    if (stopped) return;
    try {
      deliver(await request<JobView>(`/api/jobs/${encodeURIComponent(id)}`));
    } catch (error) {
      if (error instanceof ApiError && error.code === "not_found") {
        deliver({ id, state: "error", progress: 0, speed: null, eta: null, error: { code: "not_found", detail: "" } });
        return;
      }
    }
    if (!stopped) timer = setTimeout(poll, 700);
  };

  const stop = () => {
    stopped = true;
    source?.close();
    if (timer) clearTimeout(timer);
  };

  if (typeof EventSource === "undefined") {
    void poll();
  } else {
    source = new EventSource(`${base}/api/jobs/${encodeURIComponent(id)}/events`);
    source.addEventListener("job", (event) => {
      try {
        deliver(JSON.parse((event as MessageEvent<string>).data) as JobView);
      } catch {
        /* a malformed event is skipped; the next one carries the full state */
      }
    });
    source.onerror = () => {
      if (stopped) return;
      source?.close();
      source = null;
      void poll();
    };
  }
  return stop;
}
