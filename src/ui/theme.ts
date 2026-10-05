export const THEME_PREFERENCES = ["system", "light", "dark"] as const;
export type ThemePreference = (typeof THEME_PREFERENCES)[number];

// Preferencia de interfaz del dispositivo, no dato de negocio: se guarda en
// localStorage para poder pintar el tema correcto antes de desbloquear.
const STORAGE_KEY = "mypocket.theme";

const BG = { dark: "#09090B", light: "#F6F6F7" } as const;

export const isThemePreference = (value: unknown): value is ThemePreference =>
  typeof value === "string" && THEME_PREFERENCES.some((option) => option === value);

export const getStoredTheme = (): ThemePreference => {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return isThemePreference(stored) ? stored : "system";
  } catch {
    return "system";
  }
};

/** Aplica el tema a <html> y sincroniza el color de la barra del navegador. */
export const applyTheme = (preference: ThemePreference): void => {
  const root = document.documentElement;
  if (preference === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", preference);

  document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((meta) => {
    const scheme = meta.media.includes("light") ? "light" : "dark";
    meta.content = BG[preference === "system" ? scheme : preference];
  });
};

export const setTheme = (preference: ThemePreference): void => {
  try {
    window.localStorage.setItem(STORAGE_KEY, preference);
  } catch {
    // Sin almacenamiento (modo privado estricto) el tema sigue aplicándose en esta sesión.
  }
  applyTheme(preference);
};
