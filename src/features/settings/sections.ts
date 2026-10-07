// Secciones de Ajustes, en el orden del índice. Viven aparte de la pantalla
// para que la ruta valide `?seccion=` sin cargarla.
export const SETTINGS_SECTIONS = [
  "perfil",
  "categorias",
  "reglas",
  "etiquetas",
  "cuentas",
  "seguridad",
  "sincronizacion",
  "copias",
  "apariencia",
  "acerca",
  "peligro",
] as const;
export type SettingsSectionKey = (typeof SETTINGS_SECTIONS)[number];
