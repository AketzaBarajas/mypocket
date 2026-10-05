import { createFileRoute } from "@tanstack/react-router";

import { RouteError } from "@/features/shell/RouteError";

export const Route = createFileRoute("/lock")({
  component: MyPocketPage,
  errorComponent: RouteError,
});

function MyPocketPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center">
      <h1 className="text-h1">MyPocket</h1>
    </main>
  );
}
