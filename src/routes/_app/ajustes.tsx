import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { SETTINGS_SECTIONS, SettingsPage } from "@/features/settings/SettingsPage";
import { RouteError } from "@/features/shell/RouteError";

const settingsSearch = z.object({
  seccion: z.enum(SETTINGS_SECTIONS).optional().catch(undefined),
});

export const Route = createFileRoute("/_app/ajustes")({
  validateSearch: settingsSearch,
  component: AjustesRoute,
  errorComponent: RouteError,
});

function AjustesRoute() {
  const { seccion } = Route.useSearch();
  return <SettingsPage section={seccion} />;
}
