import { createFileRoute } from "@tanstack/react-router";

import { RouteError } from "@/features/shell/RouteError";
import { EmptyState, PageHeader } from "@/ui";

export const Route = createFileRoute("/_app/analisis")({
  component: AnlisisPage,
  errorComponent: RouteError,
});

function AnlisisPage() {
  return (
    <>
      <PageHeader title="Análisis" />
      <EmptyState icon="📈" title="Tus gráficas aparecerán aquí" />
    </>
  );
}
