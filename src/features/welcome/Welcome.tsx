import { useNavigate } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { useState } from "react";

import { DataBoundary } from "@/features/shell/DataBoundary";
import { wipe } from "@/security/crypto";
import { biometryLabel } from "@/security/passkey";
import {
  createSecret,
  finishOnboarding,
  secretToMnemonic,
  setupDevice,
  useSession,
} from "@/security/session";
import { IconButton, Logo, toast } from "@/ui";

import { AccountsStep, CategoriesStep, DriveStep, ImportStep } from "./WelcomeData";
import { IntroStep, ModeStep, PhraseStep, RestoreStep, SecurityStep } from "./WelcomeIdentity";

type Step =
  | "intro"
  | "mode"
  | "phrase"
  | "restore"
  | "security"
  | "accounts"
  | "categories"
  | "drive"
  | "import";

const CREATE_STEPS: ReadonlyArray<Step> = [
  "intro",
  "mode",
  "phrase",
  "security",
  "accounts",
  "categories",
  "drive",
  "import",
];
const RESTORE_STEPS: ReadonlyArray<Step> = ["intro", "mode", "restore", "security"];

const StepIndicator = ({
  current,
  total,
}: {
  readonly current: number;
  readonly total: number;
}) => (
  <div
    role="progressbar"
    aria-label="Progreso de la configuración"
    aria-valuemin={1}
    aria-valuemax={total}
    aria-valuenow={current}
    aria-valuetext={`Paso ${current} de ${total}`}
    className="flex flex-1 items-center gap-1.5"
  >
    {Array.from({ length: total }, (_, index) => (
      <span
        key={index}
        className={
          index < current
            ? "h-1 flex-1 rounded-full bg-accent transition-colors"
            : "h-1 flex-1 rounded-full bg-track transition-colors"
        }
      />
    ))}
  </div>
);

export interface WelcomeProps {
  /** Conecta Google Drive y hace la primera copia. Lo aporta la capa de copias. */
  readonly connectDrive?: (() => Promise<boolean>) | undefined;
}

/** Asistente de primer uso. */
export const Welcome = ({ connectDrive }: WelcomeProps) => {
  const navigate = useNavigate();
  const status = useSession((state) => state.status);
  const passkeySupport = useSession((state) => state.passkeySupport);

  // Si se recarga a mitad (dispositivo ya configurado), se retoma en las cuentas.
  const [step, setStep] = useState<Step>(() => (status === "unlocked" ? "accounts" : "intro"));
  const [mode, setMode] = useState<"create" | "restore">("create");
  const [secret, setSecret] = useState<Uint8Array<ArrayBuffer> | null>(null);
  const [busy, setBusy] = useState(false);

  const steps = mode === "create" ? CREATE_STEPS : RESTORE_STEPS;
  const position = Math.max(0, steps.indexOf(step));

  const goBack = () => {
    const previous = steps[position - 1];
    if (previous) setStep(previous);
  };
  // Tras configurar el dispositivo ya no se puede volver a los pasos de identidad.
  const canGoBack = position > 0 && (status !== "unlocked" || position > steps.indexOf("accounts"));

  const startCreate = () => {
    setMode("create");
    setSecret((current) => current ?? createSecret());
    setStep("phrase");
  };

  const startRestore = () => {
    setMode("restore");
    setSecret(null);
    setStep("restore");
  };

  const finishSecurity = async (pin: string, withPasskey: boolean) => {
    if (secret === null || busy) return;
    setBusy(true);
    try {
      const result = await setupDevice({ secret: new Uint8Array(secret), pin, withPasskey, mode });
      if (result.passkeyFailure !== null) {
        toast(
          result.passkeyFailure === "cancelled"
            ? `No se activó ${biometryLabel()}. Puedes hacerlo luego en Ajustes.`
            : `Este dispositivo no permite desbloquear con ${biometryLabel()}. Entrarás con tu PIN.`,
        );
      }
      wipe(secret);
      setSecret(null);
      if (mode === "create") setStep("accounts");
      // Al restaurar, la sesión ya está completa y el shell redirige a Inicio.
    } catch {
      toast({
        message:
          "No se pudo configurar el dispositivo. Comprueba que el navegador no está en modo privado.",
        tone: "danger",
      });
    } finally {
      setBusy(false);
    }
  };

  const finish = async (destination: "/" | "/importar") => {
    await finishOnboarding();
    await navigate({ to: destination, replace: true });
  };

  const handleDrive = async () => {
    if (!connectDrive) return;
    setBusy(true);
    const ok = await connectDrive();
    setBusy(false);
    if (ok) setStep("import");
  };

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-5 pt-safe pb-safe">
      <header className="flex h-16 shrink-0 items-center gap-3">
        {canGoBack ? (
          <IconButton label="Paso anterior" className="-ml-2" onClick={goBack}>
            <ArrowLeft aria-hidden="true" size={20} strokeWidth={1.75} />
          </IconButton>
        ) : (
          <Logo size={32} />
        )}
        <StepIndicator current={position + 1} total={steps.length} />
        <span className="shrink-0 num text-caption text-fg-2">
          {position + 1}/{steps.length}
        </span>
      </header>

      <div className="flex-1 py-6">
        {step === "intro" && <IntroStep onNext={() => setStep("mode")} />}
        {step === "mode" && <ModeStep onCreate={startCreate} onRestore={startRestore} />}
        {step === "phrase" && secret !== null && (
          <PhraseStep mnemonic={secretToMnemonic(secret)} onConfirmed={() => setStep("security")} />
        )}
        {step === "restore" && (
          <RestoreStep
            onRestored={(restored) => {
              setSecret(restored);
              setStep("security");
            }}
          />
        )}
        {step === "security" && (
          <SecurityStep
            passkeySupport={passkeySupport}
            busy={busy}
            onDone={(pin, withPasskey) => void finishSecurity(pin, withPasskey)}
          />
        )}
        {(step === "accounts" ||
          step === "categories" ||
          step === "drive" ||
          step === "import") && (
          <DataBoundary>
            {step === "accounts" && <AccountsStep onNext={() => setStep("categories")} />}
            {step === "categories" && <CategoriesStep onNext={() => setStep("drive")} />}
            {step === "drive" && (
              <DriveStep
                available={connectDrive !== undefined}
                busy={busy}
                onConnect={() => void handleDrive()}
                onSkip={() => setStep("import")}
              />
            )}
            {step === "import" && (
              <ImportStep
                onFinish={() => void finish("/")}
                onImport={() => void finish("/importar")}
              />
            )}
          </DataBoundary>
        )}
      </div>
    </main>
  );
};
