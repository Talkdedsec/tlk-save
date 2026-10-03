import { ChevronRight } from "lucide-react";

import type { HistoryEntry } from "../lib/history";
import { useI18n } from "../lib/i18n";
import { platformById } from "../lib/platforms";
import { BrandIcon } from "./BrandIcon";
import { Thumb } from "./Thumb";

function ago(at: number, locale: string): string {
  const seconds = Math.round((at - Date.now()) / 1000);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto", style: "short" });
  const abs = Math.abs(seconds);
  if (abs < 60) return rtf.format(0, "second");
  if (abs < 3600) return rtf.format(Math.round(seconds / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(seconds / 3600), "hour");
  return rtf.format(Math.round(seconds / 86400), "day");
}

export function History({
  items,
  onOpen,
  onClear,
}: {
  items: HistoryEntry[];
  onOpen: (url: string) => void;
  onClear: () => void;
}) {
  const { t, locale } = useI18n();
  if (items.length === 0) return null;

  return (
    <div className="history">
      <div className="history-head">
        <h2 className="section-title">{t("history.title")}</h2>
        <button type="button" className="ghost-button" onClick={onClear} style={{ height: 32, fontSize: 13 }}>
          {t("history.clear")}
        </button>
      </div>
      <ul className="history-list">
        {items.map((item) => {
          const platform = platformById(item.platform);
          return (
            <li key={`${item.url}|${item.format}`}>
              <button type="button" className="history-item" onClick={() => onOpen(item.url)}>
                <span className="history-thumb">
                  <Thumb src={item.thumbnail} iconSize={16} />
                </span>
                <span style={{ minWidth: 0 }}>
                  <span className="history-title">{item.title}</span>
                  <span className="history-meta">
                    {platform ? <BrandIcon platform={platform} size={11} /> : null}
                    <span>{item.format}</span>
                    <span aria-hidden="true">·</span>
                    <span>{ago(item.at, locale)}</span>
                  </span>
                </span>
                <ChevronRight className="history-arrow" size={18} aria-hidden="true" />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
