import { createFileRoute } from "@tanstack/react-router";

import { RouteError } from "@/features/shell/RouteError";
import { Welcome } from "@/features/welcome/Welcome";

export const Route = createFileRoute("/bienvenida")({
  component: WelcomePage,
  errorComponent: RouteError,
});

function WelcomePage() {
  return <Welcome />;
}
