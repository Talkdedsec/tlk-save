import { Monitor, Moon, Sun } from "lucide-react";

import { useI18n } from "../lib/i18n";
import type { ThemeChoice } from "../lib/theme";
import { GithubIcon } from "./BrandIcon";
import { Logo } from "./Logo";

export const REPO_URL = "https://github.com/Talkdedsec/tlk-save";

export function Header({ theme, onCycleTheme }: { theme: ThemeChoice; onCycleTheme: () => void }) {
  const { t, locale, setLocale } = useI18n();
  const ThemeIcon = theme === "light" ? Sun : theme === "dark" ? Moon : Monitor;
  const themeName = t(`nav.theme.${theme}`);
  const other = locale === "tr" ? "en" : "tr";

  return (
    <header className="header">
      <a className="brand" href="./" aria-label="tlk-save">
        <Logo />
        <span className="brand-name">
          <span>tlk-</span>save
        </span>
      </a>
      <nav className="header-actions">
        <button
          type="button"
          className="icon-button lang-button"
          onClick={() => setLocale(other)}
          aria-label={`${t("nav.language")}: ${other === "en" ? "English" : "Türkçe"}`}
          lang={other}
        >
          {other.toUpperCase()}
        </button>
        <button
          type="button"
          className="icon-button"
          onClick={onCycleTheme}
          aria-label={`${t("nav.theme")}: ${themeName}`}
          title={`${t("nav.theme")}: ${themeName}`}
        >
          <ThemeIcon size={18} />
        </button>
        <a className="icon-button" href={REPO_URL} target="_blank" rel="noreferrer" aria-label={t("nav.github")} title={t("nav.github")}>
          <GithubIcon />
        </a>
      </nav>
    </header>
  );
}
