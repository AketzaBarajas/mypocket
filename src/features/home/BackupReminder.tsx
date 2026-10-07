import { CloudUpload } from "lucide-react";
import { useEffect, useState } from "react";

import { BackupError, backupToDrive, DriveError, isBackupDue, isDriveConfigured } from "@/backup";
import { useSession } from "@/security/session";
import { Button, Notice, toast } from "@/ui";

/**
 * Sube una copia cifrada a Drive y avisa del resultado. Hay que llamarla
 * directamente desde un gesto del usuario: puede abrir la ventana de Google.
 */
export const runDriveBackup = async (): Promise<boolean> => {
  const { db } = useSession.getState();
  if (db === null) return false;
  try {
    await backupToDrive(db);
    toast("Copia cifrada guardada en Drive");
    return true;
  } catch (error) {
    toast({
      message:
        error instanceof DriveError || error instanceof BackupError
          ? error.message
          : "No se pudo hacer la copia. Inténtalo de nuevo.",
      tone: "danger",
    });
    return false;
  }
};

const useOnline = (): boolean => {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  return online;
};

/**
 * Aviso discreto de Inicio cuando la última copia tiene más de una semana. En
 * el navegador no hay copias en segundo plano: cada una necesita un toque.
 */
export const BackupReminder = ({ className }: { readonly className?: string }) => {
  const lastBackupAt = useSession((state) => state.backup.lastBackupAt);
  const online = useOnline();
  // Se evalúa al montar Inicio, que es lo primero que se ve tras desbloquear.
  const [openedAt] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);

  if (!isDriveConfigured() || !online || !isBackupDue(lastBackupAt, openedAt)) return null;

  return (
    <Notice
      {...(className === undefined ? {} : { className })}
      icon={<CloudUpload size={16} strokeWidth={1.75} />}
      action={
        <Button
          size="sm"
          variant="secondary"
          pending={busy}
          onClick={() => {
            setBusy(true);
            void runDriveBackup().finally(() => setBusy(false));
          }}
        >
          Hacer copia
        </Button>
      }
    >
      Copia de seguridad pendiente
    </Notice>
  );
};
