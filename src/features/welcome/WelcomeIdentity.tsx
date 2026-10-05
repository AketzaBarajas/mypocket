import { Check, Copy, KeyRound, ScanFace, ShieldCheck, Smartphone, WifiOff } from "lucide-react";
import { useMemo, useState } from "react";

import { MNEMONIC_WORDS, normalizeMnemonic } from "@/data";
import { PinPad } from "@/features/security/PinPad";
import { biometryLabel, type PasskeySupport } from "@/security/passkey";
import { isWeakPin } from "@/security/pin";
import { mnemonicToSecret } from "@/security/session";
import { Button, Card, cn, Input, Notice, Textarea, toast } from "@/ui";

/* ───────────────────────── Paso 1: privacidad ───────────────────────── */

const PROMISES = [
  {
    icon: ShieldCheck,
    title: "Cifrado de extremo a extremo",
    text: "Tus datos solo viven cifrados en tus dispositivos. Ni el hosting ni el servidor de sincronización pueden leerlos.",
  },
  {
    icon: Smartphone,
    title: "Sin cuenta ni registro",
    text: "No hay usuario, contraseña ni correo. Tu llave es una frase de 12 palabras que solo tienes tú.",
  },
  {
    icon: WifiOff,
    title: "Funciona sin conexión",
    text: "Apuntas un gasto en el metro y se sincroniza con tus otros dispositivos cuando vuelve la red.",
  },
] as const;

export const IntroStep = ({ onNext }: { readonly onNext: () => void }) => (
  <div className="flex flex-col gap-6">
    <div>
      <h1 className="text-h1 text-fg">Tus finanzas, solo tuyas</h1>
      <p className="mt-2 text-body text-fg-2">
        MyPocket no tiene analítica, ni telemetría, ni conexión con tu banco.
      </p>
    </div>
    <ul className="flex flex-col gap-3">
      {PROMISES.map(({ icon: Icon, title, text }) => (
        <li key={title}>
          <Card className="flex gap-3">
            <Icon
              aria-hidden="true"
              size={20}
              strokeWidth={1.75}
              className="mt-0.5 shrink-0 text-accent"
            />
            <div className="min-w-0">
              <h2 className="text-title text-fg">{title}</h2>
              <p className="mt-0.5 text-body text-fg-2">{text}</p>
            </div>
          </Card>
        </li>
      ))}
    </ul>
    <Button variant="primary" size="lg" fullWidth onClick={onNext}>
      Empezar
    </Button>
  </div>
);

/* ───────────────────────── Paso 2: crear o restaurar ───────────────────────── */

export const ModeStep = ({
  onCreate,
  onRestore,
}: {
  readonly onCreate: () => void;
  readonly onRestore: () => void;
}) => (
  <div className="flex flex-col gap-6">
    <div>
      <h1 className="text-h1 text-fg">¿Cómo quieres empezar?</h1>
      <p className="mt-2 text-body text-fg-2">
        Si ya usas MyPocket en otro dispositivo, restaura con tu frase para traer tus datos.
      </p>
    </div>
    <div className="flex flex-col gap-3">
      <Card asChild interactive>
        <button type="button" onClick={onCreate} className="w-full">
          <span className="block text-title text-fg">Empezar de cero</span>
          <span className="mt-0.5 block text-body text-fg-2">
            Crea tu frase de recuperación y configura tus cuentas.
          </span>
        </button>
      </Card>
      <Card asChild interactive>
        <button type="button" onClick={onRestore} className="w-full">
          <span className="block text-title text-fg">Restaurar con mi frase</span>
          <span className="mt-0.5 block text-body text-fg-2">
            Escribe tus 12 palabras y sincroniza tus datos en este dispositivo.
          </span>
        </button>
      </Card>
    </div>
  </div>
);

/* ───────────────────────── Paso 3: frase (crear) ───────────────────────── */

/** Elige tres posiciones distintas de la frase, en orden. */
const pickPositions = (): ReadonlyArray<number> => {
  const positions = new Set<number>();
  const random = new Uint8Array(1);
  while (positions.size < 3) {
    crypto.getRandomValues(random);
    positions.add((random[0] ?? 0) % MNEMONIC_WORDS);
  }
  return [...positions].sort((a, b) => a - b);
};

export const PhraseStep = ({
  mnemonic,
  onConfirmed,
}: {
  readonly mnemonic: string;
  readonly onConfirmed: () => void;
}) => {
  const words = useMemo(() => mnemonic.split(" "), [mnemonic]);
  const [confirming, setConfirming] = useState(false);
  const [positions] = useState(pickPositions);
  const [answers, setAnswers] = useState<ReadonlyArray<string>>(["", "", ""]);
  const [failed, setFailed] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(mnemonic);
      toast("Frase copiada. Pégala en tu gestor de contraseñas y vacía el portapapeles.");
    } catch {
      toast({ message: "No se pudo copiar. Apunta las palabras a mano.", tone: "danger" });
    }
  };

  const check = () => {
    const ok = positions.every(
      (position, index) => (answers[index] ?? "").trim().toLowerCase() === words[position],
    );
    if (ok) onConfirmed();
    else setFailed(true);
  };

  if (confirming) {
    return (
      <form
        className="flex flex-col gap-6"
        onSubmit={(event) => {
          event.preventDefault();
          check();
        }}
      >
        <div>
          <h1 className="text-h1 text-fg">Confirma tu frase</h1>
          <p className="mt-2 text-body text-fg-2">
            Escribe estas tres palabras para comprobar que la has guardado bien.
          </p>
        </div>
        <div className="flex flex-col gap-3">
          {positions.map((position, index) => (
            <label key={position} className="flex flex-col gap-1.5">
              <span className="text-caption text-fg-2">Palabra {position + 1}</span>
              <Input
                value={answers[index] ?? ""}
                onChange={(event) => {
                  const value = event.currentTarget.value;
                  setFailed(false);
                  setAnswers((current) => current.map((item, i) => (i === index ? value : item)));
                }}
                className="num"
                autoComplete="off"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                aria-invalid={failed || undefined}
              />
            </label>
          ))}
          {failed && (
            <p role="alert" className="text-caption text-danger">
              Alguna palabra no coincide. Revisa tu frase y vuelve a intentarlo.
            </p>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <Button type="submit" variant="primary" size="lg" fullWidth>
            Confirmar
          </Button>
          <Button variant="ghost" fullWidth onClick={() => setConfirming(false)}>
            Volver a ver la frase
          </Button>
        </div>
      </form>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-h1 text-fg">Tu frase de recuperación</h1>
        <p className="mt-2 text-body text-fg-2">
          Estas 12 palabras son la única llave de tus datos. Guárdalas en papel o en un gestor de
          contraseñas.
        </p>
      </div>
      <ol className="grid grid-cols-2 gap-2 sm:grid-cols-3" aria-label="Frase de recuperación">
        {words.map((word, index) => (
          <li
            key={`${index}-${word}`}
            className="flex h-11 items-center gap-2 rounded-control border border-border bg-surface px-3"
          >
            <span className="w-5 text-right num text-caption text-fg-3">{index + 1}</span>
            <span className="num text-body text-fg">{word}</span>
          </li>
        ))}
      </ol>
      <Notice tone="warning" icon={<KeyRound size={18} strokeWidth={1.75} />}>
        Sin esta frase no hay recuperación posible. No existe ningún servidor que pueda
        restablecerla.
      </Notice>
      <div className="flex flex-col gap-2">
        <Button variant="primary" size="lg" fullWidth onClick={() => setConfirming(true)}>
          Ya la he guardado
        </Button>
        <Button
          variant="ghost"
          fullWidth
          leading={<Copy aria-hidden="true" size={16} strokeWidth={1.75} />}
          onClick={() => void copy()}
        >
          Copiar
        </Button>
      </div>
    </div>
  );
};

/* ───────────────────────── Paso 3: frase (restaurar) ───────────────────────── */

export const RestoreStep = ({
  onRestored,
}: {
  readonly onRestored: (secret: Uint8Array<ArrayBuffer>) => void;
}) => {
  const [phrase, setPhrase] = useState("");
  const [error, setError] = useState<string | null>(null);
  const count = normalizeMnemonic(phrase).split(" ").filter(Boolean).length;

  const submit = () => {
    const secret = mnemonicToSecret(phrase);
    if (secret === null) {
      setError(
        count === MNEMONIC_WORDS
          ? "La frase no es válida. Revisa que no haya ninguna palabra mal escrita."
          : `La frase tiene ${MNEMONIC_WORDS} palabras y has escrito ${count}.`,
      );
      return;
    }
    onRestored(secret);
  };

  return (
    <form
      className="flex flex-col gap-6"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <div>
        <h1 className="text-h1 text-fg">Escribe tu frase</h1>
        <p className="mt-2 text-body text-fg-2">
          Las 12 palabras, en orden y separadas por espacios. No salen de este dispositivo.
        </p>
      </div>
      <label className="flex flex-col gap-1.5">
        <span className="text-caption text-fg-2">Frase de recuperación</span>
        <Textarea
          rows={4}
          value={phrase}
          onChange={(event) => {
            setPhrase(event.currentTarget.value);
            setError(null);
          }}
          className="num"
          autoComplete="off"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          aria-invalid={error !== null || undefined}
        />
        <span
          className={cn("text-caption", error === null ? "text-fg-2" : "text-danger")}
          role="status"
        >
          {error ?? `${count} de ${MNEMONIC_WORDS} palabras`}
        </span>
      </label>
      <Button type="submit" variant="primary" size="lg" fullWidth disabled={count === 0}>
        Continuar
      </Button>
    </form>
  );
};

/* ───────────────────────── Paso 4: PIN y passkey ───────────────────────── */

export const SecurityStep = ({
  passkeySupport,
  busy,
  onDone,
}: {
  readonly passkeySupport: PasskeySupport;
  readonly busy: boolean;
  readonly onDone: (pin: string, withPasskey: boolean) => void;
}) => {
  const [first, setFirst] = useState<string | null>(null);
  const [pin, setPin] = useState("");
  const [ready, setReady] = useState<string | null>(null);
  const [errorKey, setErrorKey] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const biometry = biometryLabel();

  const fail = (text: string) => {
    setPin("");
    setFirst(null);
    setErrorKey((key) => key + 1);
    setMessage(text);
  };

  const complete = (value: string) => {
    if (first === null) {
      if (isWeakPin(value)) {
        fail("Ese PIN es demasiado fácil de adivinar. Elige otro.");
        return;
      }
      setFirst(value);
      setPin("");
      setMessage(null);
      return;
    }
    if (value !== first) {
      fail("Los PIN no coinciden. Empieza de nuevo.");
      return;
    }
    setReady(value);
  };

  if (ready !== null) {
    const canUsePasskey = passkeySupport !== "unsupported";
    return (
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-h1 text-fg">{canUsePasskey ? `Activa ${biometry}` : "PIN creado"}</h1>
          <p className="mt-2 text-body text-fg-2">
            {canUsePasskey
              ? `Desbloquea con ${biometry} y deja el PIN como alternativa. La app se bloquea sola al dejar de usarla.`
              : "Este navegador no permite desbloquear con biometría. Entrarás con tu PIN."}
          </p>
        </div>
        <Notice icon={<Check size={18} strokeWidth={1.75} />} tone="accent">
          PIN de 6 dígitos guardado
        </Notice>
        <div className="flex flex-col gap-2">
          {canUsePasskey && (
            <Button
              variant="primary"
              size="lg"
              fullWidth
              pending={busy}
              leading={<ScanFace aria-hidden="true" size={20} strokeWidth={1.75} />}
              onClick={() => onDone(ready, true)}
            >
              Activar {biometry}
            </Button>
          )}
          <Button
            variant={canUsePasskey ? "ghost" : "primary"}
            size={canUsePasskey ? "md" : "lg"}
            fullWidth
            pending={busy}
            onClick={() => onDone(ready, false)}
          >
            {canUsePasskey ? "Continuar solo con PIN" : "Continuar"}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-6">
      <div className="self-stretch">
        <h1 className="text-h1 text-fg">{first === null ? "Crea tu PIN" : "Repite el PIN"}</h1>
        <p className="mt-2 text-body text-fg-2">
          {first === null
            ? "Seis dígitos para desbloquear MyPocket en este dispositivo."
            : "Escríbelo otra vez para confirmar."}
        </p>
      </div>
      <PinPad
        label={first === null ? "PIN nuevo" : "Repetir PIN"}
        value={pin}
        onChange={(value) => {
          setPin(value);
          setMessage(null);
        }}
        onComplete={complete}
        errorKey={errorKey}
      />
      <p role="status" aria-live="polite" className="min-h-5 text-center text-caption text-danger">
        {message}
      </p>
    </div>
  );
};
