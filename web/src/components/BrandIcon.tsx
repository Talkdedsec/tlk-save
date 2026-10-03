import { siGithub } from "simple-icons";

import type { Platform } from "../lib/platforms";

export function BrandIcon({ platform, size = 18 }: { platform: Pick<Platform, "path" | "name">; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" role="img" aria-label={platform.name}>
      <path d={platform.path} />
    </svg>
  );
}

export function GithubIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d={siGithub.path} />
    </svg>
  );
}
