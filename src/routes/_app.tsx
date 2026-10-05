import { createFileRoute } from "@tanstack/react-router";

import { AppFrame } from "@/features/shell/AppFrame";
import { AppShell } from "@/features/shell/AppShell";
import { DataBoundary, ScreenSkeleton } from "@/features/shell/DataBoundary";
import { RouteError } from "@/features/shell/RouteError";

export const Route = createFileRoute("/_app")({
  component: AppLayout,
  errorComponent: RouteError,
});

const noop = () => undefined;

function AppLayout() {
  return (
    <DataBoundary
      // El shell se pinta ya durante la carga: no hay saltos de layout al llegar los datos.
      fallback={
        <AppShell pendingCount={0} onAdd={noop}>
          <ScreenSkeleton />
        </AppShell>
      }
    >
      <AppFrame />
    </DataBoundary>
  );
}
