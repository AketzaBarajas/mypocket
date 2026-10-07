import { useState } from "react";

import { useAccounts, useRepo, useSettings } from "@/data";
import { wipeDevice } from "@/security/session";
import {
  Button,
  ConfirmDialog,
  Field,
  Input,
  SegmentedControl,
  Select,
  setTheme,
  type ThemePreference,
  toast,
} from "@/ui";

import { SettingRow, SettingsCard, SettingsSection } from "./shared";

/* ───────────────────────── Perfil ───────────────────────── */

export const ProfileSection = () => {
  const settings = useSettings();
  const repo = useRepo();
  const [name, setName] = useState(settings.profileName);
  const [initials, setInitials] = useState(settings.profileInitials);
  const cleanName = name.trim();
  const cleanInitials = initials.trim().toUpperCase();
  const changed = cleanName !== settings.profileName || cleanInitials !== settings.profileInitials;
  const valid = cleanName !== "" && cleanInitials !== "";

  return (
    <SettingsSection title="Perfil" description="Cómo te saluda MyPocket y qué muestra tu avatar.">
      <form
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (!valid || !changed) return;
          repo.setSetting("profileName", cleanName);
          repo.setSetting("profileInitials", cleanInitials);
          toast("Perfil guardado");
        }}
      >
        <SettingsCard>
          <div className="grid gap-3 p-4 sm:grid-cols-[1fr_8rem]">
            <Field label="Nombre">
              {(aria) => (
                <Input
                  value={name}
                  maxLength={40}
                  autoComplete="off"
                  onChange={(event) => setName(event.currentTarget.value)}
                  {...aria}
                />
              )}
            </Field>
            <Field label="Iniciales">
              {(aria) => (
                <Input
                  value={initials}
                  maxLength={3}
                  autoComplete="off"
                  autoCapitalize="characters"
                  className="uppercase"
                  onChange={(event) => setInitials(event.currentTarget.value)}
                  {...aria}
                />
              )}
            </Field>
          </div>
        </SettingsCard>
        <div className="flex justify-end">
          <Button type="submit" variant="primary" disabled={!valid || !changed}>
            Guardar
          </Button>
        </div>
      </form>
    </SettingsSection>
  );
};

/* ───────────────────────── Cuentas por defecto ───────────────────────── */

const LAST_USED = "__last__";

export const DefaultsSection = () => {
  const settings = useSettings();
  const accounts = useAccounts();
  const repo = useRepo();

  return (
    <SettingsSection
      title="Cuentas por defecto"
      description="La cuenta con la que se abre el alta rápida y a la que van los CSV sin cuenta."
    >
      <SettingsCard>
        <SettingRow
          label="Cuenta al apuntar"
          hint="«La última usada» recuerda la del movimiento anterior."
        >
          <div className="w-56 max-w-full">
            <Select
              ariaLabel="Cuenta al apuntar"
              value={settings.defaultAccountId ?? LAST_USED}
              onValueChange={(value) =>
                repo.setSetting("defaultAccountId", value === LAST_USED ? null : value)
              }
              options={[
                { value: LAST_USED, label: "La última usada" },
                ...accounts.map((account) => ({
                  value: account.id,
                  label: account.name,
                  emoji: account.emoji,
                })),
              ]}
            />
          </div>
        </SettingRow>
      </SettingsCard>
    </SettingsSection>
  );
};

/* ───────────────────────── Apariencia ───────────────────────── */

const THEME_OPTIONS = [
  { value: "system", label: "Sistema" },
  { value: "light", label: "Claro" },
  { value: "dark", label: "Oscuro" },
] as const;

export const AppearanceSection = () => {
  const settings = useSettings();
  const repo = useRepo();
  const change = (theme: ThemePreference) => {
    // Se aplica ya en este dispositivo; el ajuste sincronizado llega después al resto.
    setTheme(theme);
    repo.setSetting("theme", theme);
  };

  return (
    <SettingsSection
      title="Apariencia"
      description="«Sistema» sigue el modo claro u oscuro del dispositivo."
    >
      <SegmentedControl
        ariaLabel="Tema"
        value={settings.theme}
        onValueChange={change}
        options={THEME_OPTIONS}
        className="max-w-md"
      />
    </SettingsSection>
  );
};

/* ───────────────────────── Acerca de ───────────────────────── */

export const AboutSection = () => (
  <SettingsSection title="Acerca de">
    <SettingsCard>
      <SettingRow
        label="MyPocket"
        hint="Finanzas personales privadas, cifradas de extremo a extremo."
      >
        <span className="num text-body text-fg-2">v{__APP_VERSION__}</span>
      </SettingRow>
      <SettingRow
        label="Privacidad"
        hint="Sin analítica, sin telemetría y sin conexiones a bancos. Tus datos solo salen de este dispositivo cifrados con tu frase."
      />
    </SettingsCard>
  </SettingsSection>
);

/* ───────────────────────── Zona de peligro ───────────────────────── */

export const DangerSection = () => {
  const [step, setStep] = useState<"idle" | "warn" | "type">("idle");

  return (
    <SettingsSection
      title="Zona de peligro"
      description="Afecta solo a este dispositivo. Tus otros dispositivos y las copias de Drive no cambian."
    >
      <SettingsCard tone="danger">
        <SettingRow
          label="Borrar los datos de este dispositivo"
          hint="Elimina la base de datos local, la passkey y el PIN. Para volver a entrar necesitarás tu frase de 12 palabras."
        >
          <Button variant="danger" onClick={() => setStep("warn")}>
            Borrar datos
          </Button>
        </SettingRow>
      </SettingsCard>

      <ConfirmDialog
        open={step === "warn"}
        onOpenChange={(open) => {
          if (!open) setStep((current) => (current === "warn" ? "idle" : current));
        }}
        tone="danger"
        title="¿Borrar los datos de este dispositivo?"
        description="Comprueba antes que tienes guardada tu frase de 12 palabras: sin ella no hay forma de recuperar nada."
        confirmLabel="Continuar"
        onConfirm={() => setStep("type")}
      />
      <ConfirmDialog
        open={step === "type"}
        onOpenChange={(open) => {
          if (!open) setStep("idle");
        }}
        tone="danger"
        title="Última confirmación"
        description="Esta acción no se puede deshacer en este dispositivo."
        requireText="BORRAR"
        confirmLabel="Borrar definitivamente"
        onConfirm={() => void wipeDevice()}
      />
    </SettingsSection>
  );
};
