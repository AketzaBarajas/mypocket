import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { isYearMonth } from "@/domain/dates";
import type { YearMonth } from "@/domain/types";
import { PLAN_TABS, PlanPage } from "@/features/plan/PlanPage";
import { RouteError } from "@/features/shell/RouteError";

const planSearch = z.object({
  pestana: z.enum(PLAN_TABS).optional().catch(undefined),
  mes: z
    .custom<YearMonth>((value) => typeof value === "string" && isYearMonth(value))
    .optional()
    .catch(undefined),
});

export const Route = createFileRoute("/_app/plan")({
  validateSearch: planSearch,
  component: PlanRoute,
  errorComponent: RouteError,
});

function PlanRoute() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <PlanPage
      tab={search.pestana ?? "presupuestos"}
      month={search.mes}
      onTabChange={(pestana) =>
        void navigate({ search: (prev) => ({ ...prev, pestana }), replace: true })
      }
      onMonthChange={(mes) => void navigate({ search: (prev) => ({ ...prev, mes }), replace: true })}
    />
  );
}
