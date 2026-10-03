import { ArrowRight, ClipboardPaste, Link2, X } from "lucide-react";
import { type RefObject, useMemo } from "react";

import { useI18n } from "../lib/i18n";
import { detectPlatform } from "../lib/platforms";
import { BrandIcon } from "./BrandIcon";

interface Props {
  value: string;
  loading: boolean;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
  inputRef: RefObject<HTMLInputElement | null>;
}

const canReadClipboard = typeof navigator !== "undefined" && !!navigator.clipboard?.readText;
const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

export function LinkForm({ value, loading, onChange, onSubmit, inputRef }: Props) {
  const { t } = useI18n();
  const platform = useMemo(() => detectPlatform(value), [value]);

  const paste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text.trim()) {
        onChange(text.trim());
        onSubmit(text.trim());
      }
    } catch {
      // Permission refused: put the caret in the field so Ctrl+V works.
      inputRef.current?.focus();
    }
  };

  return (
    <form
      className="linkform"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(value);
      }}
    >
      <label htmlFor="link" className="sr-only">
        {t("form.label")}
      </label>
      <div className="linkbar">
        <span className="linkbar-icon" aria-hidden="true" style={platform ? { color: "var(--text)" } : undefined}>
          {platform ? <BrandIcon key={platform.id} platform={platform} size={20} /> : <Link2 key="link" size={20} />}
        </span>
        <input
          ref={inputRef}
          id="link"
          name="url"
          type="text"
          inputMode="url"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="none"
          spellCheck={false}
          enterKeyHint="go"
          placeholder={t("form.placeholder")}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onPaste={(event) => {
            const text = event.clipboardData.getData("text").trim();
            if (text && !value) {
              event.preventDefault();
              onChange(text);
              onSubmit(text);
            }
          }}
        />
        {value ? (
          <button type="button" className="ghost-button" onClick={() => onChange("")} aria-label={t("form.clear")} title={t("form.clear")}>
            <X size={17} />
          </button>
        ) : canReadClipboard ? (
          <button type="button" className="ghost-button" onClick={paste}>
            <ClipboardPaste size={17} />
            <span>{t("form.paste")}</span>
          </button>
        ) : (
          <span />
        )}
        <button type="submit" className="primary-button" disabled={loading || !value.trim()}>
          {loading ? (
            <>
              <span className="spinner" aria-hidden="true" />
              {t("form.loading")}
            </>
          ) : (
            <>
              {t("form.submit")}
              <ArrowRight className="arrow" size={18} strokeWidth={2.4} />
            </>
          )}
        </button>
      </div>
      <p className="hint" aria-live="polite">
        {platform ? (
          <span className="detected">{t("form.detected", { name: platform.name })}</span>
        ) : (
          <span className="hint-keyboard">
            {t("form.hint", { key: "\u0000" })
              .split("\u0000")
              .flatMap((part, i) => (i === 0 ? [part] : [<kbd key="k">{isMac ? "⌘ V" : "Ctrl V"}</kbd>, part]))}
          </span>
        )}
      </p>
    </form>
  );
}
