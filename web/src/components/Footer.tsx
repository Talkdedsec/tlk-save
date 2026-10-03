import { useEffect, useRef, useState } from "react";

import { apiBase, defaultApi, getHealth, type Health, setApiBase, usingCustomApi } from "../lib/api";
import { useI18n } from "../lib/i18n";
import { REPO_URL } from "./Header";
import { Logo } from "./Logo";

type Status = "checking" | "online" | "offline";

export function Footer({ health, status, onServerChange }: { health: Health | null; status: Status; onServerChange: () => void }) {
  const { t } = useI18n();
  const dialog = useRef<HTMLDialogElement>(null);

  return (
    <footer className="footer">
      <div className="footer-left">
        <Logo size={20} />
        <span>{t("footer.made")}</span>
        <a href={REPO_URL} target="_blank" rel="noreferrer">
          GitHub
        </a>
        <a href="https://github.com/yt-dlp/yt-dlp" target="_blank" rel="noreferrer">
          {t("footer.engine")}
          {health?.ytdlp ? ` ${health.ytdlp}` : ""}
        </a>
      </div>
      <button type="button" className="status-button" onClick={() => dialog.current?.showModal()}>
        <span className={`status-dot ${status}`} aria-hidden="true" />
        {t("footer.server")}
        {usingCustomApi() ? "*" : ""} · {t(`footer.status.${status}`)}
      </button>
      <ServerDialog ref={dialog} onSaved={onServerChange} />
    </footer>
  );
}

function ServerDialog({ ref, onSaved }: { ref: React.RefObject<HTMLDialogElement | null>; onSaved: () => void }) {
  const { t } = useI18n();
  const [value, setValue] = useState(apiBase());
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    const el = ref.current;
    const reset = () => {
      setValue(apiBase());
      setResult(null);
    };
    el?.addEventListener("close", reset);
    return () => el?.removeEventListener("close", reset);
  }, [ref]);

  const test = async (): Promise<boolean> => {
    setTesting(true);
    setResult(null);
    try {
      const health = await getHealth(value, AbortSignal.timeout(6000));
      setResult({ ok: true, text: t("server.ok", { version: health.ytdlp ?? "?" }) });
      return true;
    } catch {
      setResult({ ok: false, text: t("server.fail") });
      return false;
    } finally {
      setTesting(false);
    }
  };

  return (
    <dialog
      ref={ref}
      className="dialog"
      aria-labelledby="server-title"
      onClick={(event) => {
        if (event.target === event.currentTarget) event.currentTarget.close();
      }}
    >
      <form
        className="dialog-inner"
        method="dialog"
        onSubmit={async (event) => {
          event.preventDefault();
          if (await test()) {
            setApiBase(value);
            onSaved();
            ref.current?.close();
          }
        }}
      >
        <h2 id="server-title">{t("server.title")}</h2>
        <p>{t("server.body")}</p>
        <div className="field">
          <label htmlFor="server-url">{t("server.label")}</label>
          <input
            id="server-url"
            type="url"
            value={value}
            placeholder={defaultApi || "https://"}
            onChange={(event) => {
              setValue(event.target.value);
              setResult(null);
            }}
            spellCheck={false}
            autoComplete="off"
          />
        </div>
        <div className={`dialog-status ${result ? (result.ok ? "ok" : "fail") : ""}`} aria-live="polite">
          {result?.text}
        </div>
        <div className="dialog-actions">
          <button
            type="button"
            className="secondary-button"
            disabled={!defaultApi}
            onClick={() => {
              setApiBase(null);
              setValue(defaultApi);
              onSaved();
              ref.current?.close();
            }}
          >
            {t("server.reset")}
          </button>
          <div className="right">
            <button type="button" className="secondary-button" onClick={() => void test()} disabled={testing || !value}>
              {testing ? <span className="spinner" aria-hidden="true" /> : null}
              {t("server.test")}
            </button>
            <button type="submit" className="primary-button" disabled={testing || !value}>
              {t("server.save")}
            </button>
          </div>
        </div>
      </form>
    </dialog>
  );
}
