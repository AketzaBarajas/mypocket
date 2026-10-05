import { createFileRoute } from "@tanstack/react-router";

import { RouteError } from "@/features/shell/RouteError";
import { EmptyState, PageHeader } from "@/ui";

export const Route = createFileRoute("/_app/ajustes")({
  component: AjustesPage,
  errorComponent: RouteError,
});

function AjustesPage() {
  return (
    <>
      <PageHeader title="Ajustes" />
      <EmptyState icon="⚙️" title="Preferencias y seguridad" />
    </>
  );
}
