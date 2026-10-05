import { createFileRoute } from "@tanstack/react-router";

import { AccountsPage } from "@/features/accounts/AccountsPage";
import { RouteError } from "@/features/shell/RouteError";

export const Route = createFileRoute("/_app/cuentas/")({
  component: AccountsPage,
  errorComponent: RouteError,
});
