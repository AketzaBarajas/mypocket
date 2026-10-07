// Parámetros de búsqueda de /analisis. Viven aparte de la pantalla para que la
// ruta pueda validarlos sin cargar las gráficas.
export const ANALYSIS_TABS = ["patrimonio", "categorias", "comparar", "etiquetas"] as const;
export type AnalysisTab = (typeof ANALYSIS_TABS)[number];
export const PERIODS = ["mes", "ano"] as const;
export type Period = (typeof PERIODS)[number];
