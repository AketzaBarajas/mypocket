import { createFileRoute } from "@tanstack/react-router";

import { RouteError } from "@/features/shell/RouteError";
import { EmptyState, PageHeader } from "@/ui";

export const Route = createFileRoute("/_app/")({
  component: InicioPage,
  errorComponent: RouteError,
});

function InicioPage() {
  return (
    <>
      <PageHeader title="Inicio" />
      <EmptyState icon="🏠" title="Tu panel aparecerá aquí" />
    </>
  );
}
