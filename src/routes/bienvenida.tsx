import { createFileRoute } from "@tanstack/react-router";

import { RouteError } from "@/features/shell/RouteError";

export const Route = createFileRoute("/bienvenida")({
  component: BienvenidaPage,
  errorComponent: RouteError,
});

function BienvenidaPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center">
      <h1 className="text-h1">Bienvenida</h1>
    </main>
  );
}
