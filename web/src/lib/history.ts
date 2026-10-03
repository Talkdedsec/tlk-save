import { useCallback, useState } from "react";

import { load, save } from "./storage";

export interface HistoryEntry {
  url: string;
  title: string;
  thumbnail: string | null;
  platform: string;
  /** "1080p MP4", "MP3" … */
  format: string;
  at: number;
}

const KEY = "history";
const LIMIT = 8;

export function useHistory() {
  const [items, setItems] = useState<HistoryEntry[]>(() => {
    const stored = load<HistoryEntry[]>(KEY, []);
    return Array.isArray(stored) ? stored.slice(0, LIMIT) : [];
  });

  const add = useCallback((entry: HistoryEntry) => {
    setItems((current) => {
      const next = [entry, ...current.filter((e) => !(e.url === entry.url && e.format === entry.format))].slice(0, LIMIT);
      save(KEY, next);
      return next;
    });
  }, []);

  const clear = useCallback(() => {
    save(KEY, null);
    setItems([]);
  }, []);

  return { items, add, clear };
}
