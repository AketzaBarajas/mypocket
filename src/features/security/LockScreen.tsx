import { ScanFace } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { biometryLabel } from "@/security/passkey";
import { formatWait, remainingWait } from "@/security/pin";
import { unlockWithPasskey, unlockWithPin, useSession } from "@/security/session";
import { Button, Logo } from "@/ui";

import { PinPad } from "./PinPad";

/** Segundos que faltan de espera, actualizados cada segundo. */
const useWait = (): number => {
  const attempts = useSession((state) => state.attempts);
  const [now, setNow] = useState(() => Date.now());
  const waiting = remainingWait(attempts, now);

  useEffect(() => {
    if (waiting <= 0) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [waiting]);

  return waiting;
};

export const LockScreen = () => {
  const hasPasskey = useSession((state) => state.hasPasskey);
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [errorKey, setErrorKey] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const waiting = useWait();
  const prompting = useRef(false);

  const withPasskey = async (silent: boolean) => {
    if (prompting.current) return;
    prompting.current = true;
    const result = await unlockWithPasskey();
    prompting.current = false;
    if (result.ok || silent) return;
    if (result.reason === "cancelled") return;
    setMessage(
      result.reason === "prf-unavailable" || result.reason === "unsupported"
        ? "Este navegador no puede usar la passkey. Entra con tu PIN."
        : "No se pudo verificar la passkey. Entra con tu PIN.",
    );
  };

  // La passkey se lanza sola al mostrar la pantalla. Si el navegador la rechaza
  // por falta de gesto del usuario, queda el botón.
  useEffect(() => {
    if (hasPasskey) void withPasskey(true);
    // Solo al montar: un segundo intento automático molestaría tras cancelar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submitPin = async (value: string) => {
    setBusy(true);
    setMessage(null);
    const result = await unlockWithPin(value);
    setBusy(false);
    if (result.ok) return;
    setPin("");
    setErrorKey((key) => key + 1);
    if (result.reason === "wrong-pin") {
      setMessage(result.waitMs > 0 ? null : "PIN incorrecto. Inténtalo de nuevo.");
    } else if (result.reason !== "wait") {
      setMessage("No se pudo desbloquear. Recarga la app e inténtalo de nuevo.");
    }
  };

  const status =
    waiting > 0
      ? `Demasiados intentos. Vuelve a probar en ${formatWait(waiting)}.`
      : busy
        ? "Comprobando…"
        : message;

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-8 px-6 py-10 pt-safe pb-safe">
      <div className="flex flex-col items-center gap-3">
        <Logo size={56} />
        <h1 className="text-h1 text-fg">MyPocket</h1>
      </div>

      {hasPasskey && (
        <Button
          variant="primary"
          size="lg"
          className="w-full max-w-xs"
          leading={<ScanFace aria-hidden="true" size={20} strokeWidth={1.75} />}
          onClick={() => void withPasskey(false)}
        >
          Desbloquear con {biometryLabel()}
        </Button>
      )}

      <div className="flex w-full flex-col items-center gap-4">
        <p className="text-body text-fg-2">
          {hasPasskey ? "O introduce tu PIN" : "Introduce tu PIN"}
        </p>
        <PinPad
          label="PIN"
          value={pin}
          onChange={setPin}
          onComplete={(value) => void submitPin(value)}
          disabled={waiting > 0}
          busy={busy}
          errorKey={errorKey}
        />
        {/* Altura fija: el mensaje no mueve el teclado al aparecer. */}
        <p role="status" aria-live="polite" className="min-h-8 text-center text-caption text-fg-2">
          {status}
        </p>
      </div>
    </main>
  );
};
