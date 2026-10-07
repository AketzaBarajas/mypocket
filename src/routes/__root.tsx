import { createRootRoute, Outlet } from "@tanstack/react-router";
import { z } from "zod";

import { RouteError, RouteNotFound } from "@/features/shell/RouteError";
import { SessionGate } from "@/features/shell/SessionGate";
import { UpdatePrompt } from "@/features/shell/UpdatePrompt";
import { ToastViewport, TooltipProvider } from "@/ui";

/** Tipos de alta rápida que se pueden abrir con `?nuevo=` desde cualquier ruta. */
export const QUICK_ADD_KINDS = ["gasto", "ingreso", "transferencia"] as const;
export type QuickAddKind = (typeof QUICK_ADD_KINDS)[number];

const rootSearch = z.object({
  nuevo: z.enum(QUICK_ADD_KINDS).optional().catch(undefined),
});

export const Route = createRootRoute({
  validateSearch: rootSearch,
  component: RootLayout,
  errorComponent: RouteError,
  notFoundComponent: RouteNotFound,
});

function RootLayout() {
  return (
    <TooltipProvider>
      <SessionGate>
        <Outlet />
      </SessionGate>
      <ToastViewport />
      <UpdatePrompt />
    </TooltipProvider>
  );
}
