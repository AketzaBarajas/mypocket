import type { ErrorComponentProps } from "@tanstack/react-router";
import { TriangleAlert } from "lucide-react";

import { Button, EmptyState } from "@/ui";

/**
 * ErrorBoundary por ruta. Nunca muestra ni registra el detalle del error:
 * podría contener datos financieros.
 */
export const RouteError = ({ reset }: ErrorComponentProps) => (
  <div role="alert" className="px-4">
    <EmptyState
      icon={<TriangleAlert aria-hidden="true" size={22} strokeWidth={1.75} />}
      title="Algo ha fallado en esta pantalla"
      description="Tus datos están a salvo en este dispositivo. Vuelve a intentarlo o recarga la app."
      actions={
        <>
          <Button variant="primary" onClick={reset}>
            Reintentar
          </Button>
          <Button variant="ghost" onClick={() => window.location.reload()}>
            Recargar
          </Button>
        </>
      }
    />
  </div>
);

export const RouteNotFound = () => (
  <div className="px-4">
    <EmptyState
      icon="🧭"
      title="Esta página no existe"
      description="Puede que el enlace esté incompleto o que el movimiento se haya borrado."
      actions={
        <Button variant="primary" asChild>
          <a href="/">Ir a Inicio</a>
        </Button>
      }
    />
  </div>
);
