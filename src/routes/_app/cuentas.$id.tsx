import { createFileRoute } from "@tanstack/react-router";

import { AccountDetailPage } from "@/features/accounts/AccountDetailPage";
import { RouteError } from "@/features/shell/RouteError";

export const Route = createFileRoute("/_app/cuentas/$id")({
  component: CuentaPage,
  errorComponent: RouteError,
});

function CuentaPage() {
  const { id } = Route.useParams();
  return <AccountDetailPage id={id} />;
}
