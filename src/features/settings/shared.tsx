import { ScanFace } from "lucide-react";
import { useState, type ReactNode } from "react";

import { PinPad } from "@/features/security/PinPad";
import { biometryLabel } from "@/security/passkey";
import { type Reauth, useSession } from "@/security/session";
import { BottomSheet, Button, Card, cn } from "@/ui";

/** Bloque de una sección de Ajustes: título, explicación y contenido. */
export const SettingsSection = ({
  title,
  description,
  actions,
  children,
}: {
  readonly title: string;
  readonly description?: ReactNode;
  readonly actions?: ReactNode;
  readonly children: ReactNode;
}) => (
  <section className="flex flex-col gap-3">
    <div className="flex items-start gap-3 px-1">
      <div className="min-w-0 flex-1">
        <h2 className="text-h2 text-fg">{title}</h2>
        {description != null && <p className="mt-1 text-body text-fg-2">{description}</p>}
      </div>
      {actions != null && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
    {children}
  </section>
);

/** Tarjeta que agrupa filas de ajustes separadas por una línea. */
export const SettingsCard = ({
  tone = "default",
  className,
  children,
}: {
  readonly tone?: "default" | "danger";
  readonly className?: string;
  readonly children: ReactNode;
}) => (
  <Card
    padding="none"
    tone={tone}
    className={cn("divide-y divide-border overflow-hidden", className)}
  >
    {children}
  </Card>
);

/** Fila de ajuste: qué es a la izquierda, su control a la derecha. */
export const SettingRow = ({
  label,
  hint,
  children,
}: {
  readonly label: ReactNode;
  readonly hint?: ReactNode;
  readonly children?: ReactNode;
}) => (
  <div className="flex min-h-15 flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
    <div className="min-w-0 flex-1 basis-48">
      <div className="text-body text-fg">{label}</div>
      {hint != null && <div className="mt-0.5 text-caption text-fg-2">{hint}</div>}
    </div>
    {children != null && (
      <div className="flex max-w-full shrink-0 items-center gap-2">{children}</div>
    )}
  </div>
);

export interface ReauthSheetProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly title: string;
  readonly description: string;
  /** Ejecuta la acción protegida. Devuelve `false` si la identidad no se verificó. */
  readonly onSubmit: (auth: Reauth) => Promise<boolean>;
}

/** Vuelve a pedir la passkey o el PIN antes de una acción sensible. */
export const ReauthSheet = ({
  open,
  onOpenChange,
  title,
  description,
  onSubmit,
}: ReauthSheetProps) => {
  const hasPasskey = useSession((state) => state.hasPasskey);
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [errorKey, setErrorKey] = useState(0);
  const [message, setMessage] = useState<string | null>(null);

  const submit = async (auth: Reauth) => {
    setBusy(true);
    setMessage(null);
    const ok = await onSubmit(auth).catch(() => false);
    setBusy(false);
    setPin("");
    if (ok) return;
    setErrorKey((key) => key + 1);
    setMessage(
      auth.method === "pin"
        ? "PIN incorrecto, o hay una espera activa por intentos fallidos."
        : "No se pudo verificar la passkey. Usa tu PIN.",
    );
  };

  return (
    <BottomSheet
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setPin("");
          setMessage(null);
        }
        onOpenChange(next);
      }}
      title={title}
      description={description}
      size="sm"
    >
      <div className="flex flex-col items-center gap-5 pt-2 pb-2">
        <p className="text-center text-body text-fg-2">{description}</p>
        {hasPasskey && (
          <Button
            variant="secondary"
            fullWidth
            disabled={busy}
            leading={<ScanFace aria-hidden="true" size={18} strokeWidth={1.75} />}
            onClick={() => void submit({ method: "passkey" })}
          >
            Usar {biometryLabel()}
          </Button>
        )}
        <PinPad
          label="PIN actual"
          value={pin}
          onChange={setPin}
          onComplete={(value) => void submit({ method: "pin", pin: value })}
          busy={busy}
          errorKey={errorKey}
        />
        <p role="status" aria-live="polite" className="min-h-8 text-center text-caption text-fg-2">
          {busy ? "Comprobando…" : message}
        </p>
      </div>
    </BottomSheet>
  );
};

/** Descarga un texto como archivo, sin que salga del dispositivo. */
export const downloadText = (fileName: string, content: string, mimeType: string): void => {
  const url = URL.createObjectURL(new Blob([content], { type: mimeType }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  // El navegador necesita un instante para empezar la descarga antes de liberar la URL.
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
};
