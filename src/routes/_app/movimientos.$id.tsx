import { createFileRoute } from "@tanstack/react-router";

import { RouteError } from "@/features/shell/RouteError";
import { TransactionEditPage } from "@/features/transactions/TransactionEditPage";

export const Route = createFileRoute("/_app/movimientos/$id")({
  component: MovimientoPage,
  errorComponent: RouteError,
});

function MovimientoPage() {
  const { id } = Route.useParams();
  return <TransactionEditPage id={id} />;
}
