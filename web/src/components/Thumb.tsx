import { Film } from "lucide-react";
import { useState } from "react";

/**
 * A remote thumbnail. Sites sign or referrer-check these URLs, so the request
 * goes out without a referrer and a failure falls back to a quiet placeholder.
 */
export function Thumb({ src, alt = "", iconSize = 28 }: { src: string | null; alt?: string; iconSize?: number }) {
  const [failed, setFailed] = useState(false);
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
