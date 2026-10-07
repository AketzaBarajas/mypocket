import { useEffect, useState } from "react";

import {
  AUTO_LOCK_OPTIONS,
  type AutoLockMinutes,
  MNEMONIC_WORDS,
  useRepo,
  useSettings,
} from "@/data";
import { PinPad } from "@/features/security/PinPad";
import { biometryLabel, type PasskeyFailure } from "@/security/passkey";
import { isWeakPin } from "@/security/pin";
import {
  changePin,
  enrollPasskey,
  isStoragePersisted,
  lockSession,
  type Reauth,
  removePasskey,
  revealMnemonic,
  useSession,
} from "@/security/session";
import { Badge, BottomSheet, Button, ConfirmDialog, Notice, SegmentedControl, toast } from "@/ui";

import { ReauthSheet, SettingRow, SettingsCard, SettingsSection } from "./shared";

const PASSKEY_FAILURES: Record<PasskeyFailure, string> = {
  cancelled: "Has cancelado el registro. No ha cambiado nada.",
  unsupported: "Este navegador no permite passkeys. Seguirás entrando con tu PIN.",
  "prf-unavailable":
    "Este dispositivo no puede derivar claves con la passkey. Seguirás entrando con tu PIN.",
  failed: "No se pudo registrar la passkey. Inténtalo de nuevo.",
};

const AUTO_LOCK_SEGMENTS = AUTO_LOCK_OPTIONS.map((minutes) => ({
  value: String(minutes) as `${AutoLockMinutes}`,
  label: `${minutes} min`,
}));

/* ───────────────────────── Frase de recuperación ───────────────────────── */

const PhraseSheet = ({
  phrase,
  onClose,
}: {
  readonly phrase: string | null;
  readonly onClose: () => void;
}) => (
  <BottomSheet
    open={phrase !== null}
    onOpenChange={(open) => {
      if (!open) onClose();
    }}
    title="Tu frase de recuperación"
    size="sm"
    footer={
      <Button variant="primary" fullWidth onClick={onClose}>
        Ya la he guardado
      </Button>
    }
  >
    <div className="flex flex-col gap-4 pt-2">
      <p className="text-body text-fg-2">
        Con estas {MNEMONIC_WORDS} palabras, en este orden, se recupera todo. Guárdalas en papel o
        en un gestor de contraseñas y no las compartas.
      </p>
      <ol className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {(phrase ?? "").split(" ").map((word, index) => (
          <li
            key={`${index}-${word}`}
            className="flex h-10 items-center gap-2 rounded-control border border-border bg-chip px-3"
          >
            <span className="w-5 num text-caption text-fg-3">{index + 1}</span>
            <span className="num text-body text-fg">{word}</span>
          </li>
        ))}
      </ol>
    </div>
  </BottomSheet>
);

/* ───────────────────────── Cambio de PIN ───────────────────────── */

const ChangePinSheet = ({
  open,
  onOpenChange,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}) => {
  const [phase, setPhase] = useState<"new" | "repeat" | "confirm">("new");
  const [first, setFirst] = useState("");
  const [value, setValue] = useState("");
  const [errorKey, setErrorKey] = useState(0);
  const [message, setMessage] = useState<string | null>(null);

  const reset = () => {
    setPhase("new");
    setFirst("");
    setValue("");
    setMessage(null);
  };
  const fail = (text: string) => {
    setValue("");
    setErrorKey((key) => key + 1);
    setMessage(text);
  };

  const onComplete = (pin: string) => {
    if (phase === "new") {
      if (isWeakPin(pin)) {
        fail("Ese PIN es demasiado fácil de adivinar. Elige otro.");
        return;
      }
      setFirst(pin);
      setValue("");
      setMessage(null);
      setPhase("repeat");
      return;
    }
    if (pin !== first) {
      reset();
      setErrorKey((key) => key + 1);
      setMessage("Los dos PIN no coinciden. Empieza de nuevo.");
      return;
    }
    setPhase("confirm");
  };

  const confirm = async (auth: Reauth): Promise<boolean> => {
    const ok = await changePin(auth, first);
    if (ok) {
      toast("PIN cambiado");
      reset();
      onOpenChange(false);
    }
    return ok;
  };

  if (phase === "confirm") {
    return (
      <ReauthSheet
        open={open}
        onOpenChange={(next) => {
          if (!next) reset();
          onOpenChange(next);
        }}
        title="Confirma el cambio"
        description="Introduce tu PIN actual para guardar el nuevo."
        onSubmit={confirm}
      />
    );
  }

  return (
    <BottomSheet
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
      title="Cambiar PIN"
      size="sm"
    >
      <div className="flex flex-col items-center gap-5 pt-2 pb-2">
        <p className="text-center text-body text-fg-2">
          {phase === "new" ? "Elige un PIN nuevo de 6 dígitos." : "Repite el PIN nuevo."}
        </p>
        <PinPad
          label={phase === "new" ? "PIN nuevo" : "Repite el PIN nuevo"}
          value={value}
          onChange={setValue}
          onComplete={onComplete}
          errorKey={errorKey}
        />
        <p role="status" aria-live="polite" className="min-h-8 text-center text-caption text-fg-2">
          {message}
        </p>
      </div>
    </BottomSheet>
  );
};

/* ───────────────────────── Sección ───────────────────────── */

export const SecuritySection = () => {
  const settings = useSettings();
  const repo = useRepo();
  const hasPasskey = useSession((state) => state.hasPasskey);
  const passkeySupport = useSession((state) => state.passkeySupport);
  const [busy, setBusy] = useState(false);
  const [asking, setAsking] = useState(false);
  const [phrase, setPhrase] = useState<string | null>(null);
  const [changingPin, setChangingPin] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const biometry = biometryLabel();

  useEffect(() => {
    let alive = true;
    void isStoragePersisted().then((value) => {
      if (alive) setPersisted(value);
    });
    return () => {
      alive = false;
    };
  }, []);

  const enroll = async () => {
    setBusy(true);
    const failure = await enrollPasskey();
    setBusy(false);
    toast(
      failure === null
        ? `${biometry} activado en este dispositivo`
        : {
            message: PASSKEY_FAILURES[failure],
            tone: failure === "cancelled" ? "neutral" : "danger",
          },
    );
  };

  return (
    <SettingsSection
      title="Seguridad"
      description="La app arranca siempre bloqueada. Estas opciones son de este dispositivo."
    >
      <SettingsCard>
        <SettingRow
          label={
            <span className="flex items-center gap-2">
              {biometry}
              {hasPasskey ? <Badge tone="accent">Activo</Badge> : <Badge>Sin activar</Badge>}
            </span>
          }
          hint={
            passkeySupport === "unsupported"
              ? "Este navegador no soporta passkeys con PRF: solo se puede entrar con el PIN."
              : "Una passkey de este dispositivo desbloquea tus datos sin teclear el PIN."
          }
        >
          {hasPasskey && (
            <Button variant="ghost" disabled={busy} onClick={() => setRemoving(true)}>
              Quitar
            </Button>
          )}
          <Button
            variant="secondary"
            pending={busy}
            disabled={passkeySupport === "unsupported"}
            onClick={() => void enroll()}
          >
            {hasPasskey ? "Volver a registrar" : "Activar"}
          </Button>
        </SettingRow>

        <SettingRow label="PIN" hint="Seis dígitos. Funciona siempre, también sin biometría.">
          <Button variant="secondary" onClick={() => setChangingPin(true)}>
            Cambiar PIN
          </Button>
        </SettingRow>

        <SettingRow
          label="Bloqueo automático"
          hint="Tiempo en segundo plano antes de volver a pedir la passkey o el PIN."
        >
          <SegmentedControl
            ariaLabel="Bloqueo automático"
            size="sm"
            fullWidth={false}
            value={String(settings.autoLockMinutes) as `${AutoLockMinutes}`}
            onValueChange={(value) =>
              repo.setSetting("autoLockMinutes", Number(value) as AutoLockMinutes)
            }
            options={AUTO_LOCK_SEGMENTS}
          />
        </SettingRow>

        <SettingRow
          label="Frase de recuperación"
          hint="Las 12 palabras que restauran tus datos en otro dispositivo y abren las copias."
        >
          <Button variant="secondary" onClick={() => setAsking(true)}>
            Ver frase
          </Button>
        </SettingRow>

        <SettingRow
          label="Almacenamiento persistente"
          hint="Con él, el navegador no borra tus datos aunque falte espacio en disco."
        >
          {persisted === null ? (
            <span className="text-caption text-fg-3">Comprobando…</span>
          ) : persisted ? (
            <Badge tone="accent">Concedido</Badge>
          ) : (
            <Badge tone="warning">No concedido</Badge>
          )}
        </SettingRow>

        <SettingRow label="Bloquear ahora" hint="Cierra la sesión y descarta la clave de memoria.">
          <Button variant="secondary" onClick={() => void lockSession("/ajustes")}>
            Bloquear
          </Button>
        </SettingRow>
      </SettingsCard>

      {persisted === false && (
        <Notice tone="warning">
          El navegador aún no garantiza que conserve tus datos. Instala MyPocket en la pantalla de
          inicio y haz una copia en Drive: suele concederlo a las apps instaladas.
        </Notice>
      )}

      <ReauthSheet
        open={asking}
        onOpenChange={setAsking}
        title="Ver la frase de recuperación"
        description="Confirma que eres tú antes de mostrarla."
        onSubmit={async (auth) => {
          const revealed = await revealMnemonic(auth);
          if (revealed === null) return false;
          setAsking(false);
          setPhrase(revealed);
          return true;
        }}
      />
      <PhraseSheet phrase={phrase} onClose={() => setPhrase(null)} />
      <ChangePinSheet open={changingPin} onOpenChange={setChangingPin} />
      <ConfirmDialog
        open={removing}
        onOpenChange={setRemoving}
        tone="danger"
        title={`¿Quitar ${biometry}?`}
        description="Seguirás entrando con tu PIN. Puedes volver a activarlo cuando quieras."
        confirmLabel="Quitar"
        onConfirm={() => {
          void removePasskey().then(() => toast(`${biometry} desactivado`));
        }}
      />
    </SettingsSection>
  );
};
