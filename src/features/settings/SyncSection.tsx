import { useState } from "react";

import { DEFAULT_RELAY_URL } from "@/data";
import { syncLabel, useNow, useSyncTracker } from "@/features/shell/StatusFooter";
import { useUi } from "@/features/shell/uiStore";
import { checkRelayUrl, IS_DEMO, setRelayUrl, useSession } from "@/security/session";
import { Badge, Button, Field, Input, Notice, toast } from "@/ui";

import { SettingRow, SettingsCard, SettingsSection } from "./shared";

const formatMoment = (timestamp: number): string =>
  new Date(timestamp).toLocaleString("es-ES", { dateStyle: "medium", timeStyle: "short" });

export const SyncSection = () => {
  const status = useSyncTracker();
  const lastSyncedAt = useUi((state) => state.lastSyncedAt);
  const relayUrl = useSession((state) => state.relayUrl);
  const now = useNow();
  const [draft, setDraft] = useState(relayUrl);
  const [saving, setSaving] = useState(false);

  const url = draft.trim();
  const check = checkRelayUrl(url);
  const changed = url !== relayUrl;

  const save = async () => {
    setSaving(true);
    try {
      await setRelayUrl(url);
      toast("Relay cambiado. Sincronizando con el nuevo.");
    } catch {
      toast({ message: "No se pudo cambiar el relay. Sigue activo el anterior.", tone: "danger" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <SettingsSection
      title="Sincronización"
      description="Tus datos viajan cifrados de extremo a extremo: el relay solo ve bytes ilegibles."
    >
      <SettingsCard>
        <SettingRow label="Estado" hint={syncLabel(status, lastSyncedAt, now)}>
          {status === "synced" ? (
            <Badge tone="accent">Al día</Badge>
          ) : status === "error" ? (
            <Badge tone="danger">Error</Badge>
          ) : status === "off" ? (
            <Badge>Desactivada</Badge>
          ) : status === "offline" ? (
            <Badge tone="warning">Sin conexión</Badge>
          ) : (
            <Badge>Sincronizando</Badge>
          )}
        </SettingRow>
        <SettingRow
          label="Última sincronización"
          hint={
            lastSyncedAt === null
              ? "Todavía no se ha completado ninguna."
              : formatMoment(lastSyncedAt)
          }
        />
      </SettingsCard>

      <form
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (changed && check === "ok" && !IS_DEMO) void save();
        }}
      >
        <SettingsCard>
          <div className="flex flex-col gap-3 p-4">
            <Field
              label="URL del relay"
              error={
                url !== "" && check === "invalid"
                  ? "Debe ser una dirección wss:// válida."
                  : undefined
              }
              hint="Se guarda solo en este dispositivo. Cámbiala en todos para que se sigan viendo."
            >
              {(aria) => (
                <Input
                  type="url"
                  inputMode="url"
                  autoComplete="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  className="num"
                  value={draft}
                  disabled={IS_DEMO}
                  onChange={(event) => setDraft(event.currentTarget.value)}
                  {...aria}
                />
              )}
            </Field>
            <div className="flex flex-wrap justify-end gap-2">
              {relayUrl !== DEFAULT_RELAY_URL && (
                <Button variant="ghost" onClick={() => setDraft(DEFAULT_RELAY_URL)}>
                  Usar el relay gratuito
                </Button>
              )}
              <Button
                type="submit"
                variant="primary"
                pending={saving}
                disabled={!changed || check !== "ok" || IS_DEMO}
              >
                Guardar relay
              </Button>
            </div>
          </div>
        </SettingsCard>
      </form>

      {check === "not-in-csp" && (
        <Notice tone="warning">
          Esta compilación no permite conectarse a ese relay. Añade su origen a{" "}
          <span className="num">VITE_RELAY_ORIGINS</span> y vuelve a desplegar la app.
        </Notice>
      )}
      {url === DEFAULT_RELAY_URL && (
        <Notice>
          El relay gratuito de Evolu es de pruebas y puede borrar sus datos. No pasa nada: cada
          dispositivo guarda una copia completa, y para lo demás está la copia en Drive.
        </Notice>
      )}
      {IS_DEMO && <Notice>El perfil demo no sincroniza ni permite cambiar el relay.</Notice>}
    </SettingsSection>
  );
};
