import { createFileRoute } from "@tanstack/react-router";

import { RouteError } from "@/features/shell/RouteError";
import { EmptyState, PageHeader } from "@/ui";

export const Route = createFileRoute("/_app/plan")({
  component: PlanPage,
  errorComponent: RouteError,
});

function PlanPage() {
  return (
    <>
      <PageHeader title="Plan" />
      <EmptyState icon="🎯" title="Presupuestos, metas y recurrentes" />
    </>
  );
}
