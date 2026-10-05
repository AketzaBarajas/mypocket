import { ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";

import { useLedger, useRepo } from "@/data";
import {
  type BudgetEditMode,
  type BudgetKey,
  categoryKey,
  effectiveBudget,
  planBudgetEdit,
  SAVINGS_KEY,
} from "@/domain/budgets";
import { childrenOfCategory } from "@/domain/categories";
import { addMonthsYm, formatMonthName } from "@/domain/dates";
import { type CategoryBudgetLine, GROUP_LABELS, type GroupSummary, planSummary } from "@/domain/groups";
import { formatMoney, formatPercent, ZERO_CENTS } from "@/domain/money";
import { monthRangeOf, spendingByCategory } from "@/domain/spending";
import type { Cents, YearMonth } from "@/domain/types";
import { MonthSwitcher } from "@/features/shared/MonthSwitcher";
import {
  BottomSheet,
  Button,
  Card,
  cn,
  EmojiChip,
  Field,
  Money,
  MoneyInput,
  ProgressBar,
  SegmentedControl,
  toast,
} from "@/ui";

import { spentOfBudget, STATE_TEXT, STATE_TONE } from "./GroupTile";

interface Editing {
  readonly key: BudgetKey;
  readonly title: string;
  readonly emoji: string;
  readonly spent: Cents;
  readonly budget: Cents | null;
  /** Categoría de primer nivel, para listar sus subcategorías. */
  readonly categoryId: string | null;
}

const BudgetForm = ({
  editing,
  month,
  onDone,
}: {
  readonly editing: Editing;
  readonly month: YearMonth;
  readonly onDone: () => void;
}) => {
  const ledger = useLedger();
  const repo = useRepo();
  const [amount, setAmount] = useState<Cents | null>(editing.budget);
  const [mode, setMode] = useState<BudgetEditMode>("fromThisMonth");
  const isSavings = editing.key.scope === "savings";

  const children = useMemo(() => {
    if (editing.categoryId === null) return [];
    const byLeaf = spendingByCategory(ledger.transactions, ledger.index, monthRangeOf(month)).byLeaf;
    return childrenOfCategory(ledger.index, editing.categoryId).map((child) => ({
      child,
      spent: byLeaf.get(child.id) ?? ZERO_CENTS,
    }));
  }, [editing.categoryId, ledger.transactions, ledger.index, month]);

  const save = (next: Cents | null) => {
    repo.applyBudgetWrites(planBudgetEdit(ledger.budgets, editing.key, month, next, mode));
    toast(
      next === null
        ? "Presupuesto quitado"
        : mode === "onlyThisMonth"
          ? `Presupuesto de ${formatMonthName(month)} actualizado`
          : "Presupuesto actualizado",
    );
    onDone();
  };

  return (
    <form
      noValidate
      className="flex flex-col gap-4 pt-2"
      onSubmit={(event) => {
        event.preventDefault();
        save(amount);
      }}
    >
      <div className="flex items-center gap-3">
        <EmojiChip emoji={editing.emoji} size="lg" />
        <div className="min-w-0">
          <div className="text-body text-fg truncate">{editing.title}</div>
          <div className="text-caption text-fg-2">
            {isSavings ? "Aportado" : "Gastado"} en {formatMonthName(month)}: {formatMoney(editing.spent)}
          </div>
        </div>
      </div>

      <Field
        label={isSavings ? "Objetivo de ahorro mensual" : "Presupuesto mensual"}
        hint="Déjalo vacío para no tener presupuesto."
      >
        {(aria) => <MoneyInput value={amount} onValueChange={setAmount} placeholder="Sin presupuesto" autoFocus {...aria} />}
      </Field>

      <SegmentedControl
        ariaLabel="Alcance del cambio"
        value={mode}
        onValueChange={setMode}
        options={[
          { value: "fromThisMonth", label: "Desde este mes" },
          { value: "onlyThisMonth", label: "Solo este mes" },
        ]}
      />
      <p className="text-caption text-fg-2 -mt-2">
        {mode === "fromThisMonth"
          ? `Se aplica a ${formatMonthName(month)} y a los meses siguientes.`
          : `Solo cambia ${formatMonthName(month)}; ${formatMonthName(addMonthsYm(month, 1))} vuelve al importe anterior.`}
      </p>

      {children.length > 0 && (
        <section className="flex flex-col gap-1">
          <h3 className="text-caption text-fg-2">Subcategorías este mes</h3>
          <ul className="border-border divide-border divide-y rounded-[12px] border">
            {children.map(({ child, spent }) => (
              <li key={child.id} className="flex h-11 items-center justify-between gap-3 px-3">
                <span className="text-body text-fg truncate">{child.name}</span>
                <Money value={spent} className="text-body text-fg-2" />
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="flex flex-col gap-2">
        <Button type="submit" variant="primary" size="lg" fullWidth>
          Guardar
        </Button>
        {editing.budget !== null && (
          <Button variant="ghost" fullWidth onClick={() => save(null)}>
            Quitar presupuesto
          </Button>
        )}
      </div>
    </form>
  );
};

const CategoryLine = ({
  line,
  onEdit,
}: {
  readonly line: CategoryBudgetLine;
  readonly onEdit: () => void;
}) => (
  <button
    type="button"
    onClick={onEdit}
    className="hover:bg-chip flex w-full min-w-0 items-center gap-3 px-4 py-3 text-left transition-colors"
  >
    <EmojiChip emoji={line.category.emoji} />
    <span className="min-w-0 flex-1">
      <span className="flex min-w-0 items-baseline gap-2">
        <span className="text-body text-fg min-w-0 flex-1 truncate">{line.category.name}</span>
        <span className={cn("num text-caption shrink-0", STATE_TEXT[line.status.state])}>
          {line.status.state === "danger"
            ? `+${formatMoney(line.status.excess)}`
            : line.status.ratio === null
              ? ""
              : formatPercent(line.status.ratio)}
        </span>
      </span>
      <ProgressBar
        className="mt-1.5"
        value={line.status.ratio ?? 0}
        state={line.budget === null ? "neutral" : line.status.state}
        label={`${line.category.name}: ${spentOfBudget(line.spent, line.budget)}`}
      />
      <span className="num text-caption text-fg-2 mt-1 block truncate">
        {spentOfBudget(line.spent, line.budget)}
      </span>
    </span>
    <ChevronRight aria-hidden="true" size={16} strokeWidth={1.75} className="text-fg-3 shrink-0" />
  </button>
);

const GroupSection = ({
  summary,
  onEdit,
}: {
  readonly summary: GroupSummary;
  readonly onEdit: (editing: Editing) => void;
}) => {
  const { name, emoji } = GROUP_LABELS[summary.group];
  return (
    <section aria-label={name}>
      {/* El borde del grupo toma el color de su peor categoría. */}
      <Card padding="none" tone={STATE_TONE[summary.worstState]} className="overflow-hidden">
        <header className="border-border flex items-center gap-3 border-b px-4 py-3">
          <span aria-hidden="true" className="text-[18px]">
            {emoji}
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-title text-fg">{name}</h2>
            <p className="num text-caption text-fg-2 truncate">
              {spentOfBudget(summary.spent, summary.budget)}
              {summary.ideal !== null && ` · ideal ${formatMoney(summary.ideal, { whole: true })}`}
            </p>
          </div>
          <span className={cn("num text-title shrink-0", STATE_TEXT[summary.status.state])}>
            {summary.status.ratio === null ? "—" : formatPercent(summary.status.ratio)}
          </span>
        </header>
        <ul className="divide-border divide-y">
          {summary.lines.map((line) => (
            <li key={line.category.id}>
              <CategoryLine
                line={line}
                onEdit={() =>
                  onEdit({
                    key: categoryKey(line.category.id),
                    title: line.category.name,
                    emoji: line.category.emoji,
                    spent: line.spent,
                    budget: line.budget,
                    categoryId: line.category.id,
                  })
                }
              />
            </li>
          ))}
        </ul>
      </Card>
    </section>
  );
};

export const BudgetsTab = ({
  month,
  onMonthChange,
}: {
  readonly month: YearMonth;
  readonly onMonthChange: (month: YearMonth) => void;
}) => {
  const ledger = useLedger();
  const [editing, setEditing] = useState<Editing | null>(null);
  const plan = useMemo(() => planSummary(ledger, ledger.index, month), [ledger, month]);
  const savings = plan.savings;
  const savingsBudget = effectiveBudget(ledger.budgets, SAVINGS_KEY, month);
  const savingsLabel = GROUP_LABELS.savings;

  return (
    <div className="flex flex-col gap-4">
      <MonthSwitcher value={month} onChange={onMonthChange} className="self-center sm:self-start" />

      <div className="grid gap-4 lg:grid-cols-2">
        <GroupSection summary={plan.needs} onEdit={setEditing} />
        <GroupSection summary={plan.wants} onEdit={setEditing} />
      </div>

      <section aria-label={savingsLabel.name}>
        <Card padding="none" className="overflow-hidden">
          <button
            type="button"
            className="hover:bg-chip flex w-full items-center gap-3 px-4 py-3 text-left transition-colors"
            onClick={() =>
              setEditing({
                key: SAVINGS_KEY,
                title: savingsLabel.name,
                emoji: savingsLabel.emoji,
                spent: savings.spent,
                budget: savingsBudget,
                categoryId: null,
              })
            }
          >
            <span aria-hidden="true" className="text-[18px]">
              {savingsLabel.emoji}
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-baseline gap-2">
                <span className="text-title text-fg min-w-0 flex-1">{savingsLabel.name}</span>
                <span className="num text-title text-fg-2 shrink-0">
                  {savings.status.ratio === null ? "—" : formatPercent(savings.status.ratio)}
                </span>
              </span>
              <ProgressBar
                className="mt-2"
                value={savings.status.ratio ?? 0}
                state="ok"
                label={`Ahorro: aportado ${formatMoney(savings.spent)}${savingsBudget === null ? "" : ` de ${formatMoney(savingsBudget)}`}`}
              />
              <span className="num text-caption text-fg-2 mt-1 block truncate">
                Aportado {formatMoney(savings.spent, { whole: true })}
                {savingsBudget === null ? " · sin objetivo" : ` / ${formatMoney(savingsBudget, { whole: true })}`}
                {savings.ideal !== null && ` · ideal ${formatMoney(savings.ideal, { whole: true })}`}
              </span>
            </span>
            <ChevronRight aria-hidden="true" size={16} strokeWidth={1.75} className="text-fg-3 shrink-0" />
          </button>
        </Card>
        <p className="text-caption text-fg-2 mt-2 px-1">
          El ahorro cuenta las transferencias del mes hacia cuentas de ahorro o inversión, menos lo
          que retires de ellas.
        </p>
      </section>

      <BottomSheet
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
        title="Editar presupuesto"
        size="sm"
      >
        {editing && (
          <BudgetForm
            key={`${editing.key.scope}-${editing.categoryId ?? ""}`}
            editing={editing}
            month={month}
            onDone={() => setEditing(null)}
          />
        )}
      </BottomSheet>
    </div>
  );
};
