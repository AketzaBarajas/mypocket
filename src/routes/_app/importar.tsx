import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { isPresetKey } from "@/domain/importing/session";
import { ImportPage } from "@/features/import/ImportPage";
import { RouteError } from "@/features/shell/RouteError";

const importSearch = z.object({
  /** Perfil preseleccionado, por ejemplo al llegar desde la bienvenida. */
  perfil: z.string().refine(isPresetKey).optional().catch(undefined),
});

export const Route = createFileRoute("/_app/importar")({
  validateSearch: importSearch,
  component: ImportarRoute,
  errorComponent: RouteError,
});

function ImportarRoute() {
  const { perfil } = Route.useSearch();
  // La clave reinicia el asistente si se llega con otro perfil.
  return <ImportPage key={perfil ?? "default"} initialPreset={perfil} />;
}
