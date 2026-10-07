import { CloudUpload, Download, FileUp, TriangleAlert } from "lucide-react";
import { useRef, useState } from "react";

import {
  BackupError,
  backupToDrive,
  BACKUPS_TO_KEEP,
  createBackupFile,
  downloadDriveBackup,
  DriveError,
  type DriveFile,
  isDriveConfigured,
  listDriveBackups,
  openBackup,
  readBackupHeader,
  restoreBackup,
} from "@/backup";
import { mnemonicToSecret, type Snapshot, snapshotRowCount, useLedger } from "@/data";
import { formatShortDate, fromDate } from "@/domain/dates";
import { transactionsToCsv } from "@/domain/exporting";
import { backupLabel, useNow } from "@/features/shell/StatusFooter";
import { wipe } from "@/security/crypto";
import { useSession } from "@/security/session";
import {
  BottomSheet,
  Button,
  ConfirmDialog,
  EmptyState,
  Field,
  Notice,
  Skeleton,
  Textarea,
  toast,
} from "@/ui";

import { downloadText, SettingRow, SettingsCard, SettingsSection } from "./shared";

const ICON = { size: 16, strokeWidth: 1.75 } as const;
/** U+FEFF, marca de orden de bytes. */
const BOM = String.fromCharCode(0xfeff);

const errorMessage = (error: unknown, fallback: string): string =>
  error instanceof DriveError || error instanceof BackupError ? error.message : fallback;

const formatMoment = (iso: string): string =>
  new Date(iso).toLocaleString("es-ES", { dateStyle: "medium", timeStyle: "short" });

const formatSize = (bytes: number): string =>
  bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} kB`
    : `${(bytes / (1024 * 1024)).toLocaleString("es-ES", { maximumFractionDigits: 1 })} MB`;

/** Copia cifrada pendiente de restaurar: su contenido y de dónde viene. */
interface PendingRestore {
  readonly content: string;
  readonly label: string;
}

/* ───────────────────────── Restaurar ───────────────────────── */

const RestoreSheet = ({
  pending,
  onClose,
}: {
  readonly pending: PendingRestore | null;
  readonly onClose: () => void;
}) => {
  const db = useSession((state) => state.db);
  const [phrase, setPhrase] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [confirming, setConfirming] = useState(false);

  const close = () => {
    setPhrase("");
    setError(null);
    setSnapshot(null);
    onClose();
  };

  const open = async () => {
    if (pending === null) return;
    const secret = mnemonicToSecret(phrase);
    if (secret === null) {
      setError("La frase no es válida. Son 12 palabras separadas por espacios.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      setSnapshot(await openBackup(pending.content, secret));
      setPhrase("");
    } catch (failure) {
      setError(errorMessage(failure, "No se pudo abrir la copia."));
    } finally {
      wipe(secret);
      setBusy(false);
    }
  };

  const restore = () => {
    if (db === null || snapshot === null) return;
    const result = restoreBackup(db, snapshot);
    toast(
      result.skipped === 0
        ? `Copia restaurada · ${result.restored} registros`
        : `Copia restaurada · ${result.restored} registros (${result.skipped} no válidos, omitidos)`,
    );
    close();
  };

  const movements = snapshot === null ? 0 : snapshotRowCount(snapshot, "transaction");
  const accounts = snapshot === null ? 0 : snapshotRowCount(snapshot, "account");

  return (
    <>
      <BottomSheet
        open={pending !== null}
        onOpenChange={(next) => {
          if (!next) close();
        }}
        title="Restaurar una copia"
        size="md"
      >
        {snapshot === null ? (
          <form
            className="flex flex-col gap-4 pt-2"
            onSubmit={(event) => {
              event.preventDefault();
              void open();
            }}
          >
            <p className="text-body text-fg-2">
              {pending?.label}. Está cifrada: escribe la frase de 12 palabras con la que se hizo
              para abrirla.
            </p>
            <Field label="Frase de recuperación" error={error ?? undefined}>
              {(aria) => (
                <Textarea
                  rows={3}
                  autoComplete="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  className="num"
                  value={phrase}
                  onChange={(event) => setPhrase(event.currentTarget.value)}
                  {...aria}
                />
              )}
            </Field>
            <Button
              type="submit"
              variant="primary"
              fullWidth
              pending={busy}
              disabled={phrase.trim() === ""}
            >
              Abrir la copia
            </Button>
          </form>
        ) : (
          <div className="flex flex-col gap-4 pt-2">
            <SettingsCard>
              <SettingRow label="Fecha de la copia" hint={formatMoment(snapshot.exportedAt)} />
              <SettingRow
                label="Contenido"
                hint={`${movements} ${movements === 1 ? "movimiento" : "movimientos"} · ${accounts} ${
                  accounts === 1 ? "cuenta" : "cuentas"
                } · ${snapshotRowCount(snapshot)} registros en total`}
              />
            </SettingsCard>
            <Notice tone="warning" icon={<TriangleAlert {...ICON} />} className="items-start">
              Lo que hay en la copia sustituye a lo que tengas ahora con el mismo identificador,
              también en tus otros dispositivos. Lo que creaste después de la copia se conserva.
            </Notice>
            <Button variant="primary" fullWidth onClick={() => setConfirming(true)}>
              Restaurar esta copia
            </Button>
          </div>
        )}
      </BottomSheet>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        tone="danger"
        title="¿Restaurar la copia?"
        description={
          snapshot === null
            ? ""
            : `Tus datos volverán al estado del ${formatShortDate(fromDate(new Date(snapshot.exportedAt)))} en todo lo que contiene la copia. No se puede deshacer.`
        }
        confirmLabel="Restaurar"
        onConfirm={restore}
      />
    </>
  );
};

/* ───────────────────────── Copias en Drive ───────────────────────── */

const DriveBackups = ({ onRestore }: { readonly onRestore: (pending: PendingRestore) => void }) => {
  const db = useSession((state) => state.db);
  const lastBackupAt = useSession((state) => state.backup.lastBackupAt);
  const now = useNow();
  const [busy, setBusy] = useState<string | null>(null);
  const [files, setFiles] = useState<ReadonlyArray<DriveFile> | null>(null);

  if (!isDriveConfigured()) {
    return (
      <Notice>
        Esta compilación no tiene configurado el acceso a Google. Crea un ID de cliente OAuth, ponlo
        en <span className="num">VITE_GOOGLE_CLIENT_ID</span> y vuelve a desplegar (paso 4 de
        docs/SETUP.md). Mientras tanto puedes exportar la copia cifrada a un archivo.
      </Notice>
    );
  }

  const run = async (key: string, action: () => Promise<void>, fallback: string) => {
    setBusy(key);
    try {
      await action();
    } catch (error) {
      toast({ message: errorMessage(error, fallback), tone: "danger" });
    } finally {
      setBusy(null);
    }
  };

  const backup = () =>
    run(
      "backup",
      async () => {
        if (db === null) return;
        await backupToDrive(db);
        toast("Copia cifrada guardada en Drive");
        setFiles(null);
      },
      "No se pudo hacer la copia.",
    );

  const list = () =>
    run("list", async () => setFiles(await listDriveBackups()), "No se pudieron leer las copias.");

  const restore = (file: DriveFile) =>
    run(
      file.id,
      async () => {
        const content = await downloadDriveBackup(file.id);
        readBackupHeader(content);
        onRestore({ content, label: `Copia de Drive del ${formatMoment(file.createdTime)}` });
      },
      "No se pudo descargar la copia.",
    );

  return (
    <>
      <SettingsCard>
        <SettingRow
          label="Google Drive"
          hint={`${backupLabel(lastBackupAt, now)}. Se guardan las ${BACKUPS_TO_KEEP} más recientes en una carpeta oculta que solo ve MyPocket.`}
        >
          <Button
            variant="primary"
            pending={busy === "backup"}
            disabled={busy !== null}
            leading={<CloudUpload aria-hidden="true" {...ICON} />}
            onClick={() => void backup()}
          >
            Hacer copia
          </Button>
        </SettingRow>
        <SettingRow
          label="Copias guardadas"
          hint="Para restaurar hace falta tu frase de 12 palabras."
        >
          <Button
            variant="secondary"
            pending={busy === "list"}
            disabled={busy !== null}
            onClick={() => void list()}
          >
            {files === null ? "Ver copias" : "Actualizar"}
          </Button>
        </SettingRow>
        {busy === "list" && files === null && (
          <div className="flex flex-col gap-2 p-4">
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
          </div>
        )}
        {files !== null &&
          (files.length === 0 ? (
            <EmptyState compact icon="☁️" title="Aún no hay copias en Drive" />
          ) : (
            files.map((file) => (
              <SettingRow
                key={file.id}
                label={formatMoment(file.createdTime)}
                hint={formatSize(file.size)}
              >
                <Button
                  size="sm"
                  variant="ghost"
                  pending={busy === file.id}
                  disabled={busy !== null}
                  onClick={() => void restore(file)}
                >
                  Restaurar
                </Button>
              </SettingRow>
            ))
          ))}
      </SettingsCard>
      <p className="px-1 text-caption text-fg-2">
        En el navegador, Google no permite renovar el permiso en segundo plano: cada copia necesita
        un toque y puede abrir una ventana de Google para confirmarlo.
      </p>
    </>
  );
};

/* ───────────────────────── Sección ───────────────────────── */

export const BackupSection = () => {
  const ledger = useLedger();
  const db = useSession((state) => state.db);
  const fileInput = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<PendingRestore | null>(null);
  const [exporting, setExporting] = useState(false);
  const [confirmCsv, setConfirmCsv] = useState(false);

  const exportEncrypted = async () => {
    if (db === null) return;
    setExporting(true);
    try {
      const file = await createBackupFile(db);
      downloadText(file.name, file.content, "application/json");
      toast("Copia cifrada exportada");
    } catch {
      toast({ message: "No se pudo exportar la copia.", tone: "danger" });
    } finally {
      setExporting(false);
    }
  };

  const exportCsv = () => {
    const csv = transactionsToCsv(ledger.transactions, ledger);
    const today = new Date().toISOString().slice(0, 10);
    // La marca BOM hace que Excel lea las tildes como UTF-8.
    downloadText(`mypocket-movimientos-${today}.csv`, `${BOM}${csv}`, "text/csv;charset=utf-8");
    toast("Movimientos exportados");
  };

  const loadFile = async (file: File) => {
    try {
      const content = await file.text();
      readBackupHeader(content);
      setPending({ content, label: `Archivo «${file.name}»` });
    } catch (error) {
      toast({ message: errorMessage(error, "No se pudo leer el archivo."), tone: "danger" });
    }
  };

  return (
    <SettingsSection
      title="Copias"
      description="Toda copia se cifra en este dispositivo con tu frase antes de salir de él."
    >
      <DriveBackups onRestore={setPending} />

      <SettingsCard>
        <SettingRow
          label="Exportar copia cifrada"
          hint="Un archivo con todos tus datos, en el mismo formato que la copia de Drive."
        >
          <Button
            variant="secondary"
            pending={exporting}
            leading={<Download aria-hidden="true" {...ICON} />}
            onClick={() => void exportEncrypted()}
          >
            Exportar
          </Button>
        </SettingRow>
        <SettingRow
          label="Restaurar desde un archivo"
          hint="Abre una copia cifrada exportada antes. Pide tu frase de 12 palabras."
        >
          <Button
            variant="secondary"
            leading={<FileUp aria-hidden="true" {...ICON} />}
            onClick={() => fileInput.current?.click()}
          >
            Elegir archivo
          </Button>
          <input
            ref={fileInput}
            type="file"
            accept=".json,application/json"
            aria-label="Archivo de copia cifrada"
            tabIndex={-1}
            className="sr-only"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              event.currentTarget.value = "";
              if (file) void loadFile(file);
            }}
          />
        </SettingRow>
        <SettingRow
          label="Exportar movimientos (CSV)"
          hint="Legible en una hoja de cálculo. No va cifrado."
        >
          <Button
            variant="secondary"
            leading={<Download aria-hidden="true" {...ICON} />}
            onClick={() => setConfirmCsv(true)}
          >
            Exportar CSV
          </Button>
        </SettingRow>
      </SettingsCard>

      <RestoreSheet pending={pending} onClose={() => setPending(null)} />
      <ConfirmDialog
        open={confirmCsv}
        onOpenChange={setConfirmCsv}
        title="El CSV no va cifrado"
        description="Cualquiera que abra el archivo verá todos tus movimientos. Guárdalo en un sitio seguro y bórralo cuando no lo necesites."
        confirmLabel="Exportar de todos modos"
        onConfirm={exportCsv}
      />
    </SettingsSection>
  );
};
