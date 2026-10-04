import { Film } from "lucide-react";
import { useState } from "react";

import { apiBase } from "../lib/api";

/**
 * A thumbnail. The server proxies it, so the video site never sees the
 * visitor; an expired or broken one falls back to a quiet placeholder.
 */
export function Thumb({ src, alt = "", iconSize = 28 }: { src: string | null; alt?: string; iconSize?: number }) {
  const [failed, setFailed] = useState(false);
  // The server hands out its own address for the picture (/api/thumb/…).
  if (src?.startsWith("/")) src = apiBase() + src;
  if (!src || failed) {
    return (
      <span className="thumb-fallback" aria-hidden="true">
        <Film size={iconSize} strokeWidth={1.6} />
      </span>
    );
  }
  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  );
}
