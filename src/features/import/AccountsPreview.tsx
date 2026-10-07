import { ACCOUNT_TYPE_LABELS, defaultIsLiquid } from "@/domain/catalog";
import { formatShortDate } from "@/domain/dates";
import { ACCOUNT_TYPES } from "@/domain/types";
import { Badge, Button, Card, Checkbox, cn, EmptyState, Money, Select } from "@/ui";

import type { AccountDraftRow } from "./types";

export interface AccountsPreviewProps {
  readonly drafts: ReadonlyArray<AccountDraftRow>;
  readonly onChange: (drafts: ReadonlyArray<AccountDraftRow>) => void;
  readonly onBack: () => void;
  readonly onContinue: () => void;
}

const TYPE_OPTIONS = ACCOUNT_TYPES.map((value) => ({ value, label: ACCOUNT_TYPE_LABELS[value] }));

/** Paso 3 del CSV de cuentas de Notion: qué cuentas se crean y cuáles se actualizan. */
export const AccountsPreview = ({ drafts, onChange, onBack, onContinue }: AccountsPreviewProps) => {
  const included = drafts.filter((draft) => draft.include);
  const created = included.filter((draft) => draft.existingId === null).length;
  const updated = included.length - created;
  const patch = (name: string, change: Partial<AccountDraftRow>) =>
    onChange(drafts.map((draft) => (draft.name === name ? { ...draft, ...change } : draft)));

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <div className="min-w-0 flex-1 basis-64">
          <h2 className="text-title text-fg">
            {included.length === 0
              ? "No hay ninguna cuenta marcada"
              : `${created} ${created === 1 ? "cuenta nueva" : "cuentas nuevas"} · ${updated} ${
                  updated === 1 ? "actualizada" : "actualizadas"
                }`}
          </h2>
          <p className="mt-1 text-body text-fg-2">
            En las que ya existen solo cambian el saldo inicial y la fecha de apertura. Este archivo
            no crea movimientos.
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button variant="ghost" onClick={onBack}>
            Atrás
          </Button>
          <Button variant="primary" disabled={included.length === 0} onClick={onContinue}>
            Revisar e importar
          </Button>
        </div>
      </Card>

      {drafts.length === 0 ? (
        <Card>
          <EmptyState
            compact
            icon="🏦"
            title="El archivo no trae cuentas"
            description="Vuelve atrás y comprueba qué columna tiene el nombre."
          />
        </Card>
      ) : (
        <Card padding="none" className="overflow-hidden">
          <ul className="divide-y divide-border">
            {drafts.map((draft) => (
              <li
                key={draft.name}
                className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5"
              >
                <Checkbox
                  label={`Importar ${draft.name}`}
                  checked={draft.include}
                  onCheckedChange={(include) => patch(draft.name, { include })}
                />
                <div className={cn("min-w-0 flex-1 basis-44", !draft.include && "opacity-55")}>
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="truncate text-body text-fg">{draft.name}</span>
                    {draft.existingId === null ? (
                      <Badge tone="accent">Nueva</Badge>
                    ) : (
                      <Badge>Ya existe</Badge>
                    )}
                  </div>
                  <div className="truncate text-caption text-fg-2">
                    {draft.openingDate === null
                      ? "Sin fecha de apertura"
                      : `Abierta el ${formatShortDate(draft.openingDate)}`}
                  </div>
                </div>
                <div className="w-40 shrink-0">
                  {draft.existingId === null ? (
                    <Select
                      ariaLabel={`Tipo de ${draft.name}`}
                      size="sm"
                      value={draft.type}
                      onValueChange={(type) =>
                        patch(draft.name, { type, isLiquid: defaultIsLiquid(type) })
                      }
                      options={TYPE_OPTIONS}
                    />
                  ) : (
                    <span className="px-2.5 text-caption text-fg-2">
                      {ACCOUNT_TYPE_LABELS[draft.type]}
                    </span>
                  )}
                </div>
                <span className="w-28 shrink-0 text-right">
                  {draft.openingBalance === null ? (
                    <span className="num text-body text-fg-3">—</span>
                  ) : (
                    <Money value={draft.openingBalance} className="text-body text-fg" />
                  )}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
};
