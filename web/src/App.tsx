import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Footer } from "./components/Footer";
import { Header } from "./components/Header";
import { History } from "./components/History";
import { LinkForm } from "./components/LinkForm";
import { Notice } from "./components/Notice";
import { PlatformStrip } from "./components/PlatformStrip";
import { ResultCard } from "./components/ResultCard";
import { Bookmarklet, Faq, Features } from "./components/Sections";
import { ApiError, apiBase, getHealth, getInfo, type Health, type Info } from "./lib/api";
import { useHistory } from "./lib/history";
import { type I18n, I18nContext, type Locale, initialLocale, translate } from "./lib/i18n";
import { extractUrl, looksLikeUrl } from "./lib/platforms";
import { saveRaw } from "./lib/storage";
import { useTheme } from "./lib/theme";

type Lookup =
  | { phase: "idle" }
  | { phase: "loading"; url: string }
  | { phase: "ready"; info: Info }
  | { phase: "failed"; code: string; detail: string; url: string };

type Status = "checking" | "online" | "offline";

/**
 * A link handed over in the address: `#url=` from the bookmarklet (the part
 * after # never reaches any server), or `?text=` / `?url=` from a phone's
 * Share menu, which can only use a query.
 */
function linkFromAddress(): string {
  const fromHash = new URLSearchParams(location.hash.slice(1)).get("url");
  if (fromHash && looksLikeUrl(fromHash)) return extractUrl(fromHash);
  const params = new URLSearchParams(location.search);
  for (const key of ["url", "text", "title"]) {
    const value = params.get(key);
    if (value && looksLikeUrl(value)) return extractUrl(value);
  }
  return "";
}

/**
 * Keep the address bar in step, so the page can be refreshed or shared as is.
 * The link lives after #, and any query from the Share menu is dropped.
 */
function reflectInAddress(url: string) {
  const next = new URL(location.href);
  next.search = "";
  next.hash = url ? new URLSearchParams({ url }).toString() : "";
  history.replaceState(null, "", next);
}

const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));

export function App() {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);
  const i18n = useMemo<I18n>(
    () => ({
      locale,
      t: (key, vars) => translate(locale, key, vars),
      setLocale: (next) => {
        saveRaw("locale", next);
        setLocaleState(next);
      },
    }),
    [locale],
  );
  const { t } = i18n;

  useEffect(() => {
    document.documentElement.lang = locale;
    document.title = translate(locale, "meta.title");
  }, [locale]);

  const { choice: theme, cycle: cycleTheme } = useTheme();
  const recent = useHistory();
  const [value, setValue] = useState("");
  const [lookup, setLookup] = useState<Lookup>({ phase: "idle" });
  const [health, setHealth] = useState<Health | null>(null);
  const [status, setStatus] = useState<Status>("checking");
  const [serverVersion, setServerVersion] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const pending = useRef<AbortController | null>(null);

  // Server status for the footer, refreshed every minute.
  useEffect(() => {
    let alive = true;
    const check = () => {
      if (!apiBase()) {
        setStatus("offline");
        return;
      }
      getHealth(apiBase(), AbortSignal.timeout(8000))
        .then((h) => {
          if (!alive) return;
          setHealth(h);
          setStatus(h.ok ? "online" : "offline");
        })
        .catch(() => {
          if (!alive) return;
          setHealth(null);
          setStatus("offline");
        });
    };
    setStatus("checking");
    check();
    const timer = setInterval(check, 60_000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [serverVersion]);

  const submit = useCallback(async (raw: string) => {
    const text = raw.trim();
    if (!text) return;
    if (!looksLikeUrl(text)) {
      setLookup({ phase: "failed", code: "invalid_url", detail: "", url: text });
      return;
    }
    const url = extractUrl(text);
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    setValue(url);
    reflectInAddress(url);
    setLookup({ phase: "loading", url });

    try {
      const info = await getInfo(url, controller.signal);
      if (controller.signal.aborted) return;
      setLookup({ phase: "ready", info });
    } catch (error) {
      if (controller.signal.aborted) return;
      const err = error instanceof ApiError ? error : new ApiError("failed", String(error));
      setLookup({ phase: "failed", code: err.code, detail: err.detail, url });
    }
  }, []);

  const reset = useCallback((next: string) => {
    setValue(next);
    if (!next) {
      pending.current?.abort();
      setLookup({ phase: "idle" });
      reflectInAddress("");
    }
  }, []);

  // A link in the address bar starts right away.
  useEffect(() => {
    const link = linkFromAddress();
    if (link) void submit(link);
    else inputRef.current?.focus({ preventScroll: true });
  }, [submit]);

  // Paste anywhere on the page, or press "/" to jump to the field.
  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      if (isTyping(event.target)) return;
      const text = event.clipboardData?.getData("text").trim();
      if (!text) return;
      event.preventDefault();
      inputRef.current?.focus({ preventScroll: true });
      void submit(text);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "/" && !isTyping(event.target) && !event.ctrlKey && !event.metaKey) {
        event.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };
    document.addEventListener("paste", onPaste);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("paste", onPaste);
      document.removeEventListener("keydown", onKey);
    };
  }, [submit]);

  // On a phone the card appears below the fold; bring it into view.
  useEffect(() => {
    if (lookup.phase !== "ready" && lookup.phase !== "failed") return;
    const el = resultRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.top > window.innerHeight * 0.7) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [lookup.phase]);

  const maxHours = health ? Math.round(health.limits.max_duration / 3600) : 4;

  return (
    <I18nContext.Provider value={i18n}>
      <div className="page">
        <Header theme={theme} onCycleTheme={cycleTheme} />
        <main>
          <section className="hero" aria-labelledby="hero-title">
            <span className="eyebrow">{t("hero.eyebrow")}</span>
            <h1 id="hero-title">
              {t("hero.title.a")} <span className="accent">{t("hero.title.b")}</span>
            </h1>
            <p className="lead">{t("hero.lead")}</p>

            <LinkForm
              value={value}
              loading={lookup.phase === "loading"}
              onChange={reset}
              onSubmit={(text) => void submit(text)}
              inputRef={inputRef}
            />

            {lookup.phase === "idle" || lookup.phase === "failed" ? <PlatformStrip /> : null}

            <div ref={resultRef} style={{ scrollMarginTop: 16 }}>
              {lookup.phase === "loading" ? <Skeleton /> : null}
              {lookup.phase === "ready" ? (
                <ResultCard key={lookup.info.url} info={lookup.info} maxHours={maxHours} onDownloaded={recent.add} />
              ) : null}
              {lookup.phase === "failed" ? (
                <Notice
                  code={lookup.code}
                  detail={lookup.detail}
                  vars={{ hours: maxHours }}
                  onRetry={lookup.code === "invalid_url" ? undefined : () => void submit(lookup.url)}
                />
              ) : null}
            </div>

            <History
              items={recent.items}
              onClear={recent.clear}
              onOpen={(url) => {
                window.scrollTo({ top: 0, behavior: "smooth" });
                void submit(url);
              }}
            />
          </section>

          <Features />
          <Bookmarklet />
          <Faq />
        </main>
        <Footer health={health} status={status} onServerChange={() => setServerVersion((v) => v + 1)} />
      </div>
    </I18nContext.Provider>
  );
}

function Skeleton() {
  return (
    <div className="result" aria-busy="true" aria-live="polite">
      <div className="skeleton">
        <div className="sk sk-thumb" />
        <div>
          <div className="sk sk-line" style={{ width: "92%" }} />
          <div className="sk sk-line" style={{ width: "64%" }} />
          <div className="sk sk-line" style={{ width: "34%", marginTop: 26 }} />
        </div>
      </div>
      <div className="result-body">
        <div className="sk" style={{ height: 40, width: 200, borderRadius: 12 }} />
        <div className="options" style={{ marginTop: 16 }}>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="sk" style={{ height: 66, borderRadius: 14 }} />
          ))}
        </div>
      </div>
    </div>
  );
}
