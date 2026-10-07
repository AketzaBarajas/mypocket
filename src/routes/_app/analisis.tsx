import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { isYearMonth } from "@/domain/dates";
import type { YearMonth } from "@/domain/types";
import { AnalysisPage } from "@/features/analysis/AnalysisPage";
import { ANALYSIS_TABS, PERIODS } from "@/features/analysis/params";
import { RouteError } from "@/features/shell/RouteError";

const analysisSearch = z.object({
  pestana: z.enum(ANALYSIS_TABS).optional().catch(undefined),
  periodo: z.enum(PERIODS).optional().catch(undefined),
  mes: z
    .custom<YearMonth>((value) => typeof value === "string" && isYearMonth(value))
    .optional()
    .catch(undefined),
});

export const Route = createFileRoute("/_app/analisis")({
  validateSearch: analysisSearch,
  component: AnalisisRoute,
  errorComponent: RouteError,
});

function AnalisisRoute() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <AnalysisPage
      tab={search.pestana ?? "patrimonio"}
      period={search.periodo ?? "mes"}
      month={search.mes}
      onChange={(patch) =>
        void navigate({ search: (prev) => ({ ...prev, ...patch }), replace: true })
      }
    />
  );
}
