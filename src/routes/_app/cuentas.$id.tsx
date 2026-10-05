import { createFileRoute } from "@tanstack/react-router";

import { RouteError } from "@/features/shell/RouteError";
import { EmptyState, PageHeader } from "@/ui";

export const Route = createFileRoute("/_app/cuentas/$id")({
  component: CuentaPage,
  errorComponent: RouteError,
});

function CuentaPage() {
  return (
    <>
      <PageHeader title="Cuenta" />
      <EmptyState icon="💳" title="Detalle de la cuenta" />
    </>
  );
}
