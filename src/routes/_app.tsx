import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";

import { AppShell } from "@/features/shell/AppShell";
import { DataBoundary } from "@/features/shell/DataBoundary";
import { RouteError } from "@/features/shell/RouteError";

export const Route = createFileRoute("/_app")({
  component: AppLayout,
  errorComponent: RouteError,
});

function AppLayout() {
  const navigate = useNavigate();
  return (
    <AppShell
      pendingCount={0}
      onAdd={() => void navigate({ to: ".", search: (prev) => ({ ...prev, nuevo: "gasto" }) })}
    >
      <DataBoundary>
        <Outlet />
      </DataBoundary>
    </AppShell>
  );
}
