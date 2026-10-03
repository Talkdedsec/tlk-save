import type { CSSProperties } from "react";

import { useI18n } from "../lib/i18n";
import { PLATFORMS } from "../lib/platforms";
import { BrandIcon } from "./BrandIcon";

// Brands whose colour is black would vanish on the dark theme when hovered.
const isDarkBrand = (hex: string) => {
  const n = Number.parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 40;
};

export function PlatformStrip() {
  const { t } = useI18n();
  return (
    <ul className="strip" aria-label={t("strip.label")}>
      {PLATFORMS.filter((p) => p.featured).map((platform) => (
        <li key={platform.id}>
          <span
            className="strip-icon"
            title={platform.name}
            style={{ "--brand": platform.color } as CSSProperties}
            data-dark-brand={isDarkBrand(platform.color) ? "" : undefined}
          >
            <BrandIcon platform={platform} size={18} />
          </span>
        </li>
      ))}
      <li>
        <span className="strip-more">{t("strip.more")}</span>
      </li>
    </ul>
  );
}
