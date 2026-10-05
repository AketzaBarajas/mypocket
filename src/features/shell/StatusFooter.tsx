import { CloudOff, RefreshCw, ShieldCheck, TriangleAlert } from "lucide-react";
import { useEffect, useState } from "react";

import { type SyncStatus, useSyncStatus } from "@/data";
import { useSession } from "@/security/session";
import { cn } from "@/ui";

import { useUi } from "./uiStore";

/** "ahora", "hace 5 min", "hace 3 h", "hace 2 días" */
export const formatAgo = (from: number, now: number): string => {
  const minutes = Math.floor(Math.max(0, now - from) / 60_000);
  if (minutes < 1) return "ahora";
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "hace 1 día" : `hace ${days} días`;
};

/** Reloj que se refresca cada minuto para los textos «hace X». */
export const useNow = (): number => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  return now;
};

/** Registra el momento en que la sincronización queda al día. */
export const useSyncTracker = (): SyncStatus => {
  const status = useSyncStatus();
  const markSynced = useUi((state) => state.markSynced);
  useEffect(() => {
    if (status === "synced") markSynced(Date.now());
  }, [status, markSynced]);
  return status;
};

export const syncLabel = (status: SyncStatus, lastSyncedAt: number | null, now: number): string => {
  switch (status) {
    case "synced":
      return `Sincronizado ${formatAgo(lastSyncedAt ?? now, now)}`;
    case "syncing":
      return "Sincronizando…";
    case "offline":
      return lastSyncedAt === null
        ? "Sin conexión"
        : `Sin conexión · último sync ${formatAgo(lastSyncedAt, now)}`;
    case "error":
      return "Error de sincronización";
    case "off":
      return "Sincronización desactivada";
  }
};

export const backupLabel = (lastBackupAt: string | null, now: number): string =>
  lastBackupAt === null
    ? "Sin copia en Drive"
    : `Copia en Drive ${formatAgo(new Date(lastBackupAt).getTime(), now)}`;

/** Indicador compacto de sincronización para la cabecera. */
export const SyncIndicator = ({ className }: { readonly className?: string }) => {
  const status = useSyncTracker();
  const lastSyncedAt = useUi((state) => state.lastSyncedAt);
  const now = useNow();
  const label = syncLabel(status, lastSyncedAt, now);
  const Icon =
    status === "error"
      ? TriangleAlert
      : status === "offline" || status === "off"
        ? CloudOff
        : RefreshCw;

  return (
    <span
      role="status"
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex size-9 shrink-0 items-center justify-center rounded-full",
        status === "error" ? "text-danger" : status === "synced" ? "text-accent" : "text-fg-2",
        className,
      )}
    >
      <Icon
        aria-hidden="true"
        size={16}
        strokeWidth={1.75}
        className={cn(status === "syncing" && "animate-skeleton")}
      />
    </span>
  );
};

/** Pie de la barra lateral: cifrado, sincronización y copia. */
export const StatusFooter = () => {
  const status = useSyncTracker();
  const lastSyncedAt = useUi((state) => state.lastSyncedAt);
  const lastBackupAt = useSession((state) => state.backup.lastBackupAt);
  const now = useNow();

  return (
    <div className="flex flex-col gap-1.5 text-micro text-fg-2">
      <span className="inline-flex items-center gap-1.5">
        <ShieldCheck
          aria-hidden="true"
          size={13}
          strokeWidth={1.75}
          className="shrink-0 text-accent"
        />
        Cifrado de extremo a extremo
      </span>
      <span role="status" className={cn(status === "error" && "text-danger")}>
        {syncLabel(status, lastSyncedAt, now)}
      </span>
      <span>{backupLabel(lastBackupAt, now)}</span>
    </div>
  );
};
