import { createFileRoute } from "@tanstack/react-router";

import { RouteError } from "@/features/shell/RouteError";
import { transactionsSearchSchema } from "@/features/transactions/search";
import { TransactionsPage } from "@/features/transactions/TransactionsPage";

export const Route = createFileRoute("/_app/movimientos/")({
  validateSearch: transactionsSearchSchema,
  component: MovimientosPage,
  errorComponent: RouteError,
});

function MovimientosPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <TransactionsPage
      search={search}
      onSearchChange={(patch, replace = false) =>
        void navigate({ search: (prev) => ({ ...prev, ...patch }), replace })
      }
      onNew={() => void navigate({ search: (prev) => ({ ...prev, nuevo: "gasto" as const }) })}
    />
  );
}
