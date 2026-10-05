import { monthOf } from "@/domain/dates";
import type { YearMonth } from "@/domain/types";
import { useToday } from "@/features/shell/useToday";
import { PageHeader, SegmentedControl } from "@/ui";

import { BudgetsTab } from "./BudgetsTab";
import { GoalsTab } from "./GoalsTab";
import { RecurringTab } from "./RecurringTab";

export const PLAN_TABS = ["presupuestos", "metas", "recurrentes"] as const;
export type PlanTab = (typeof PLAN_TABS)[number];

const TAB_OPTIONS = [
  { value: "presupuestos", label: "Presupuestos" },
  { value: "metas", label: "Metas" },
  { value: "recurrentes", label: "Recurrentes" },
] as const;

export interface PlanPageProps {
  readonly tab: PlanTab;
  /** Mes de los presupuestos; por defecto, el actual. */
  readonly month: YearMonth | undefined;
  readonly onTabChange: (tab: PlanTab) => void;
  readonly onMonthChange: (month: YearMonth) => void;
}

/** Plan: presupuestos versionados, metas y recurrentes. */
export const PlanPage = ({ tab, month, onTabChange, onMonthChange }: PlanPageProps) => {
  const today = useToday();
  return (
    <>
      <PageHeader title="Plan" />
      <div className="flex flex-col gap-5">
        <SegmentedControl
          ariaLabel="Sección del plan"
          value={tab}
          onValueChange={onTabChange}
          options={TAB_OPTIONS}
          className="sm:max-w-md"
        />
        {tab === "presupuestos" && (
          <BudgetsTab month={month ?? monthOf(today)} onMonthChange={onMonthChange} />
        )}
        {tab === "metas" && <GoalsTab />}
        {tab === "recurrentes" && <RecurringTab />}
      </div>
    </>
  );
};
