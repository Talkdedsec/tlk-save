import { useCallback, useEffect, useState } from "react";

import { loadRaw, saveRaw } from "./storage";

export type ThemeChoice = "system" | "light" | "dark";

const ORDER: ThemeChoice[] = ["system", "light", "dark"];

function apply(choice: ThemeChoice) {
  const root = document.documentElement;
  if (choice === "system") delete root.dataset.theme;
  else root.dataset.theme = choice;
}

export function useTheme() {
  const [choice, setChoice] = useState<ThemeChoice>(() => {
    const saved = loadRaw("theme");
    return saved === "light" || saved === "dark" ? saved : "system";
  });

  useEffect(() => {
    apply(choice);
    saveRaw("theme", choice === "system" ? null : choice);
  }, [choice]);

  const cycle = useCallback(() => {
    setChoice((current) => ORDER[(ORDER.indexOf(current) + 1) % ORDER.length] ?? "system");
  }, []);

  return { choice, cycle };
}
