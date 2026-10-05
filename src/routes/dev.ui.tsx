import { createFileRoute, redirect } from "@tanstack/react-router";
import { lazy, Suspense } from "react";

import { RouteError } from "@/features/shell/RouteError";
import { Skeleton } from "@/ui";

// La galería solo se importa en desarrollo: en producción la condición es
// constante y el bundler elimina el módulo.
const UiGallery = import.meta.env.DEV
  ? lazy(() => import("@/features/dev/UiGallery").then((module) => ({ default: module.UiGallery })))
  : null;

export const Route = createFileRoute("/dev/ui")({
  beforeLoad: () => {
    if (!import.meta.env.DEV) throw redirect({ to: "/" });
  },
  component: DevUiPage,
  errorComponent: RouteError,
});

function DevUiPage() {
  if (!UiGallery) return null;
  return (
    <Suspense fallback={<Skeleton className="m-4 h-40" />}>
      <UiGallery />
    </Suspense>
  );
}
