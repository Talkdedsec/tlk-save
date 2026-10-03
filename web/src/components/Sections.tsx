import { AudioLines, GripVertical, Plus, ShieldCheck, Smartphone, Sparkles } from "lucide-react";
import { useEffect, useRef } from "react";

import { type MessageKey, useI18n } from "../lib/i18n";

const FEATURES: { icon: typeof ShieldCheck; key: string }[] = [
  { icon: ShieldCheck, key: "private" },
  { icon: Sparkles, key: "quality" },
  { icon: AudioLines, key: "audio" },
  { icon: Smartphone, key: "anywhere" },
];

export function Features() {
  const { t } = useI18n();
  return (
    <section aria-labelledby="features-title">
      <h2 className="section-title" id="features-title">
        {t("features.title")}
      </h2>
      <div className="features">
        {FEATURES.map(({ icon: Icon, key }) => (
          <div className="feature" key={key}>
            <span className="feature-icon" aria-hidden="true">
              <Icon size={20} />
            </span>
            <h3>{t(`features.${key}.title` as MessageKey)}</h3>
            <p>{t(`features.${key}.body` as MessageKey)}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

/** Opens this site with the current page's link, from any tab. */
function bookmarkletCode(): string {
  const site = new URL(".", location.href).href;
  return `javascript:(()=>{location.href=${JSON.stringify(site)}+'?url='+encodeURIComponent(location.href)})()`;
}

export function Bookmarklet() {
  const { t } = useI18n();
  const link = useRef<HTMLAnchorElement>(null);

  // React refuses javascript: URLs in JSX on purpose; this one is ours and
  // static, so it is set on the element directly.
  useEffect(() => {
    link.current?.setAttribute("href", bookmarkletCode());
  }, []);

  return (
    <section className="bookmarklet" aria-labelledby="bookmarklet-title">
      <div>
        <h2 id="bookmarklet-title">{t("bookmarklet.title")}</h2>
        <p>{t("bookmarklet.body")}</p>
        <p className="note">{t("bookmarklet.share")}</p>
      </div>
      <a
        ref={link}
        className="bookmark-chip"
        title={t("bookmarklet.drag")}
        onClick={(event) => event.preventDefault()}
      >
        <GripVertical className="grip" size={16} aria-hidden="true" />
        {t("bookmarklet.button")}
      </a>
    </section>
  );
}

const QUESTIONS = ["how", "stored", "sites", "login", "legal", "self"] as const;

export function Faq() {
  const { t } = useI18n();
  return (
    <section aria-labelledby="faq-title">
      <h2 className="section-title" id="faq-title">
        {t("faq.title")}
      </h2>
      <div className="faq">
        {QUESTIONS.map((q) => (
          <details key={q}>
            <summary>
              {t(`faq.${q}.q`)}
              <Plus className="plus" size={18} aria-hidden="true" />
            </summary>
            <p>{t(`faq.${q}.a`)}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
