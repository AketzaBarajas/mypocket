import { createFileRoute } from "@tanstack/react-router";

import { RouteError } from "@/features/shell/RouteError";
import { EmptyState, PageHeader } from "@/ui";

export const Route = createFileRoute("/_app/movimientos/$id")({
  component: MovimientoPage,
  errorComponent: RouteError,
});

function MovimientoPage() {
  return (
    <>
      <PageHeader title="Movimiento" />
      <EmptyState icon="✏️" title="Edición del movimiento" />
    </>
  );
}
