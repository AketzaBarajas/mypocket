import { createFileRoute } from "@tanstack/react-router";

import { RouteError } from "@/features/shell/RouteError";
import { EmptyState, PageHeader } from "@/ui";

export const Route = createFileRoute("/_app/importar")({
  component: ImportarPage,
  errorComponent: RouteError,
});

function ImportarPage() {
  return (
    <>
      <PageHeader title="Importar" />
      <EmptyState icon="📥" title="Sube un CSV de tu banco o de Notion" />
    </>
  );
}
