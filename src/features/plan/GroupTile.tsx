import type { BudgetState } from "@/domain/budgets";
import { GROUP_LABELS, type GroupSummary } from "@/domain/groups";
import { formatMoney, formatPercent } from "@/domain/money";
import { Card, type CardTone, cn, Money, ProgressBar, type ProgressState } from "@/ui";

export const STATE_TONE: Record<BudgetState, CardTone> = {
  ok: "default",
  warning: "warning",
  danger: "danger",
};

export const STATE_TEXT: Record<BudgetState, string> = {
  ok: "text-fg-2",
  warning: "text-warning",
  danger: "text-danger",
};

/** Texto "gastado / presupuestado" de un grupo o categoría. */
export const spentOfBudget = (
  spent: Parameters<typeof formatMoney>[0],
  budget: GroupSummary["budget"],
) =>
  budget === null
    ? `${formatMoney(spent, { whole: true })} · sin presupuesto`
    : `${formatMoney(spent, { whole: true })} / ${formatMoney(budget, { whole: true })}`;

export interface GroupTileProps {
  readonly summary: GroupSummary;
  readonly className?: string;
}

/**
 * Baldosa de un grupo 50/30/20: emoji, nombre, porcentaje, "gastado /
 * presupuestado" y barra cuyo color indica el estado. Los grupos se distinguen
 * por emoji y nombre, nunca por color.
 */
export const GroupTile = ({ summary, className }: GroupTileProps) => {
  const { name, emoji } = GROUP_LABELS[summary.group];
  const isSavings = summary.group === "savings";
  const ratio = summary.status.ratio;
  const state: ProgressState = isSavings ? "ok" : summary.status.state;
  const verb = isSavings ? "aportado" : "gastado";
  // La marca del ideal se pinta sobre el presupuesto, cuando ambos existen.
  const marker =
    summary.ideal !== null && summary.budget !== null && summary.budget > 0
      ? summary.ideal / summary.budget
      : undefined;

  return (
    <Card
      tone={isSavings ? "default" : STATE_TONE[summary.worstState]}
      className={cn("flex min-w-0 flex-col gap-2", className)}
    >
      <div className="flex min-w-0 items-center gap-2">
        <span aria-hidden="true">{emoji}</span>
        <h3 className="min-w-0 flex-1 truncate text-caption text-fg-2">{name}</h3>
        <span
          className={cn(
            "shrink-0 num text-caption",
            isSavings ? "text-fg-2" : STATE_TEXT[summary.status.state],
          )}
        >
          {ratio === null ? "—" : formatPercent(ratio)}
        </span>
      </div>
      <Money value={summary.spent} className="block truncate text-h2 text-fg" />
      <ProgressBar
        value={ratio ?? 0}
        state={state}
        marker={marker}
        label={`${name}: ${verb} ${formatMoney(summary.spent)}${
          summary.budget === null ? ", sin presupuesto" : ` de ${formatMoney(summary.budget)}`
        }`}
      />
      <p className="truncate text-caption text-fg-2">
        {summary.budget === null
          ? isSavings
            ? "Sin objetivo"
            : "Sin presupuesto"
          : `de ${formatMoney(summary.budget, { whole: true })}`}
        {summary.ideal !== null && ` · ideal ${formatMoney(summary.ideal, { whole: true })}`}
      </p>
      {!isSavings && summary.status.state === "danger" && (
        <p className="truncate text-caption text-danger">
          Te has pasado {formatMoney(summary.status.excess)}
        </p>
      )}
    </Card>
  );
};
