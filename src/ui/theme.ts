import { useEffect, useState } from "react";

export type Theme = "auto" | "light" | "dark";

export const THEMES: readonly Theme[] = ["auto", "light", "dark"];

export const THEME_LABELS: Readonly<Record<Theme, string>> = {
  auto: "Auto",
  light: "Hell",
  dark: "Dunkel",
};

const STORAGE_KEY = "coach:theme";

const isTheme = (value: string | null): value is Theme =>
  value !== null && (THEMES as readonly string[]).includes(value);

/** Private browsing modes throw on storage access, and no choice means auto. */
export const readTheme = (): Theme => {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return isTheme(stored) ? stored : "auto";
  } catch {
    return "auto";
  }
};

/**
 * Auto leaves the attribute off so the palette follows the operating system;
 * an explicit choice stamps it and wins over the system in both directions.
 */
export const applyTheme = (theme: Theme): void => {
  const root = document.documentElement;
  if (theme === "auto") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", theme);

  try {
    if (theme === "auto") window.localStorage.removeItem(STORAGE_KEY);
    else window.localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // The choice holds for this visit but will not survive a reload.
  }
};

export const useTheme = (): readonly [Theme, (next: Theme) => void] => {
  const [theme, setTheme] = useState<Theme>(readTheme);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  return [theme, setTheme];
};
