import { createFileRoute } from "@tanstack/react-router";

import { isDriveConfigured } from "@/backup";
import { runDriveBackup } from "@/features/home/BackupReminder";
import { RouteError } from "@/features/shell/RouteError";
import { Welcome } from "@/features/welcome/Welcome";

export const Route = createFileRoute("/bienvenida")({
  component: WelcomePage,
  errorComponent: RouteError,
});

function WelcomePage() {
  // Conectar Drive en la bienvenida es hacer la primera copia.
  return <Welcome connectDrive={isDriveConfigured() ? runDriveBackup : undefined} />;
}
