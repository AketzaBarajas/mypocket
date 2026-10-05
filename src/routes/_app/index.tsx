import { createFileRoute } from "@tanstack/react-router";

import { HomePage } from "@/features/home/HomePage";
import { RouteError } from "@/features/shell/RouteError";

export const Route = createFileRoute("/_app/")({
  component: HomePage,
  errorComponent: RouteError,
});
