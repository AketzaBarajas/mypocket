import { createFileRoute } from "@tanstack/react-router";

import { RouteError } from "@/features/shell/RouteError";
import { EmptyState, PageHeader } from "@/ui";

export const Route = createFileRoute("/_app/cuentas/")({
  component: CuentasPage,
  errorComponent: RouteError,
});

function CuentasPage() {
  return (
    <>
      <PageHeader title="Cuentas" />
      <EmptyState icon="💳" title="Tus cuentas aparecerán aquí" />
    </>
  );
}
