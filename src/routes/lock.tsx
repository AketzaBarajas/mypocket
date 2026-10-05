import { createFileRoute } from "@tanstack/react-router";

import { LockScreen } from "@/features/security/LockScreen";
import { RouteError } from "@/features/shell/RouteError";

export const Route = createFileRoute("/lock")({
  component: LockScreen,
  errorComponent: RouteError,
});
