import { createFileRoute, redirect } from "@tanstack/react-router";

import { AppFrame } from "@/features/shell/AppFrame";
import { AppShell } from "@/features/shell/AppShell";
import { DataBoundary, ScreenSkeleton } from "@/features/shell/DataBoundary";
import { RouteError } from "@/features/shell/RouteError";
import { bootSession, setReturnTo, useSession } from "@/security/session";

export const Route = createFileRoute("/_app")({
  // Con la app bloqueada o sin configurar se redirige antes de descargar el código
  // de las pantallas con datos: así la bienvenida y el bloqueo salen mucho antes.
  beforeLoad: async ({ location }) => {
    await bootSession();
    const { status, onboarding } = useSession.getState();
    if (status === "new" || (status === "unlocked" && onboarding === "pending")) {
      throw redirect({ to: "/bienvenida", replace: true });
    }
    if (status === "locked") {
      if (useSession.getState().returnTo === null) {
        setReturnTo(`${location.pathname}${location.searchStr}`);
      }
      throw redirect({ to: "/lock", replace: true });
    }
  },
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
