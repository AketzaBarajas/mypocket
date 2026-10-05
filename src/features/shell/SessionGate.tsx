import { useLocation, useRouter } from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import { bootSession, installAutoLock, setReturnTo, useSession } from "@/security/session";
import { Logo } from "@/ui";

/** Pantalla de arranque: el logo sobre el fondo, sin datos. */
const Splash = () => (
  <div
    role="status"
    aria-label="Abriendo MyPocket"
    className="flex min-h-dvh items-center justify-center"
  >
    <Logo size={56} className="animate-skeleton" />
  </div>
);

const PUBLIC_PREFIX = "/dev/";

/**
 * Puerta de sesión. La app arranca siempre bloqueada: sin passkey ni PIN no se
 * monta ninguna pantalla con datos. Decide entre bienvenida, bloqueo y app
 * según el estado de la sesión.
 */
export const SessionGate = ({ children }: { readonly children: ReactNode }) => {
  const router = useRouter();
  const location = useLocation();
  const status = useSession((state) => state.status);
  const onboarding = useSession((state) => state.onboarding);
  const path = location.pathname;
  const isPublic = path.startsWith(PUBLIC_PREFIX);

  useEffect(() => {
    void bootSession();
    return installAutoLock();
  }, []);

  // Destino que corresponde al estado actual, o `null` si la ruta ya es válida.
  let target: "/bienvenida" | "/lock" | "return" | null = null;
  if (!isPublic) {
    if (status === "new") target = path === "/bienvenida" ? null : "/bienvenida";
    else if (status === "locked") target = path === "/lock" ? null : "/lock";
    else if (status === "unlocked") {
      if (onboarding === "pending") target = path === "/bienvenida" ? null : "/bienvenida";
      else if (path === "/lock" || path === "/bienvenida") target = "return";
    }
  }

  useEffect(() => {
    if (target === null) return;
    if (target === "return") {
      const { returnTo } = useSession.getState();
      setReturnTo(null);
      router.history.replace(returnTo ?? "/");
      return;
    }
    if (target === "/lock" && useSession.getState().returnTo === null) {
      // Se recuerda la ruta (y un posible ?nuevo=) para volver tras desbloquear.
      const here = `${location.pathname}${location.searchStr}`;
      if (location.pathname !== "/bienvenida") setReturnTo(here);
    }
    void router.navigate({ to: target, replace: true });
  }, [target, router, location.pathname, location.searchStr]);

  if (isPublic) return children;
  if (status === "booting" || target !== null) return <Splash />;
  return children;
};
