// Pestañas de /plan. Viven aparte de la pantalla para que la ruta valide
// `?pestana=` sin cargarla.
export const PLAN_TABS = ["presupuestos", "metas", "recurrentes"] as const;
export type PlanTab = (typeof PLAN_TABS)[number];
