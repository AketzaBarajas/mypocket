import { Info } from "lucide-react";

import { useLedger } from "@/data";
import { formatShortDate } from "@/domain/dates";
import type { ImportDraft } from "@/domain/importing/pipeline";
import { summarizeDrafts } from "@/domain/importing/session";
import { negCents } from "@/domain/money";
import { Button, Card, HeroCard, Money, Notice, Switch } from "@/ui";

const plural = (count: number, one: string, many: string): string =>
  `${count} ${count === 1 ? one : many}`;

const Stat = ({
  label,
  count,
  children,
}: {
  readonly label: string;
  readonly count: number;
  readonly children?: React.ReactNode;
}) => (
  <div className="min-w-0">
    <dt className="truncate text-caption text-fg-2">{label}</dt>
    <dd className="mt-1 num text-h2 text-fg">{count}</dd>
    <dd className="mt-0.5 h-4 truncate text-caption text-fg-2">{children}</dd>
  </div>
);

export interface ConfirmStepProps {
  readonly fileName: string;
  readonly profileName: string;
  readonly drafts: ReadonlyArray<ImportDraft>;
  /** Filas del archivo que no se importan. */
  readonly leftOut: number;
  readonly remember: boolean;
  readonly onRememberChange: (remember: boolean) => void;
  readonly onBack: () => void;
  readonly onConfirm: () => void;
}

/** Paso 4: resumen de lo que se va a escribir, antes de escribirlo. */
export const ConfirmStep = ({
  fileName,
  profileName,
  drafts,
  leftOut,
  remember,
  onRememberChange,
  onBack,
  onConfirm,
}: ConfirmStepProps) => {
  const { accounts, accountById } = useLedger();
  const summary = summarizeDrafts(drafts, accounts);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
      <HeroCard className="flex flex-col gap-5">
        <div className="min-w-0">
          <h2 className="text-h2 text-fg">
            Vas a importar {plural(summary.count, "movimiento", "movimientos")}
          </h2>
          <p className="mt-1 truncate text-body text-fg-2">
            «{fileName}»
            {summary.firstDate !== null &&
              summary.lastDate !== null &&
              (summary.firstDate === summary.lastDate
                ? ` · ${formatShortDate(summary.firstDate)}`
                : ` · del ${formatShortDate(summary.firstDate)} al ${formatShortDate(summary.lastDate)}`)}
          </p>
        </div>

        <dl className="grid grid-cols-3 gap-3 border-y border-border py-4">
          <Stat label="Gastos" count={summary.expenses}>
            {summary.expenses > 0 && <Money value={negCents(summary.expenseTotal)} />}
          </Stat>
          <Stat label="Ingresos" count={summary.income}>
            {summary.income > 0 && (
              <Money value={summary.incomeTotal} sign="always" className="text-accent" />
            )}
          </Stat>
          <Stat label="Transferencias" count={summary.transfers} />
        </dl>

        <ul className="flex flex-col gap-2">
          {summary.byAccount.map(({ accountId, count }) => {
            const account = accountById.get(accountId);
            return (
              <li key={accountId} className="flex min-w-0 items-center gap-2 text-body">
                <span aria-hidden="true">{account?.emoji ?? "💳"}</span>
                <span className="min-w-0 flex-1 truncate text-fg">
                  {account?.name ?? "Cuenta nueva"}
                </span>
                <span className="shrink-0 text-fg-2">
                  <span className="num">{count}</span> {count === 1 ? "movimiento" : "movimientos"}
                </span>
              </li>
            );
          })}
        </ul>
      </HeroCard>

      {leftOut > 0 && (
        <Notice icon={<Info size={16} strokeWidth={1.75} />}>
          {plural(leftOut, "fila del archivo se queda", "filas del archivo se quedan")} fuera:
          duplicadas, con error, sin categoría o desmarcadas.
        </Notice>
      )}
      {summary.beforeOpening > 0 && (
        <Notice icon={<Info size={16} strokeWidth={1.75} />}>
          {plural(summary.beforeOpening, "movimiento es anterior", "movimientos son anteriores")} a
          la fecha de apertura de su cuenta. Se guardan para el análisis, pero no cambian el saldo:
          el saldo inicial ya los da por contados.
        </Notice>
      )}

      <Card className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-body text-fg">Recordar estas columnas</div>
          <div className="text-caption text-fg-2">
            La próxima vez que elijas «{profileName}» se aplicará este mismo mapeo.
          </div>
        </div>
        <Switch
          checked={remember}
          onCheckedChange={onRememberChange}
          label="Recordar estas columnas"
        />
      </Card>

      <div className="flex justify-between gap-2">
        <Button variant="ghost" onClick={onBack}>
          Atrás
        </Button>
        <Button variant="primary" disabled={summary.count === 0} onClick={onConfirm}>
          Importar {plural(summary.count, "movimiento", "movimientos")}
        </Button>
      </div>
    </div>
  );
};
