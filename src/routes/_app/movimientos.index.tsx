import { createFileRoute } from "@tanstack/react-router";

import { RouteError } from "@/features/shell/RouteError";
import { EmptyState, PageHeader } from "@/ui";

export const Route = createFileRoute("/_app/movimientos/")({
  component: MovimientosPage,
  errorComponent: RouteError,
});

function MovimientosPage() {
  return (
    <>
      <PageHeader title="Movimientos" />
      <EmptyState icon="🧾" title="Apunta tu primer gasto" />
    </>
  );
}
