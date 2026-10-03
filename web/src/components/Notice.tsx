import { RotateCcw, TriangleAlert } from "lucide-react";

import { errorKey, useI18n } from "../lib/i18n";

interface Props {
  code: string;
  detail?: string;
  vars?: Record<string, string | number>;
  onRetry?: () => void;
  retryLabel?: string;
}

/** A failure, said in plain words, with yt-dlp's own message tucked away. */
export function Notice({ code, detail, vars, onRetry, retryLabel }: Props) {
  const { t } = useI18n();
  const quiet = code === "cancelled";
  return (
    <div className="notice" role={quiet ? "status" : "alert"}>
      <TriangleAlert className="notice-icon" size={20} aria-hidden="true" />
      <div>
        <p className="notice-title">{t("error.title")}</p>
        <p className="notice-text">{t(errorKey(code), vars)}</p>
        {detail ? (
          <details>
            <summary>{t("error.details")}</summary>
            <code>
              {code}: {detail}
            </code>
          </details>
        ) : null}
        {onRetry ? (
          <button type="button" className="secondary-button" onClick={onRetry}>
            <RotateCcw size={15} />
            {retryLabel ?? t("job.retry")}
          </button>
        ) : null}
      </div>
    </div>
  );
}
