import { useRegisterSW } from "virtual:pwa-register/react";

import { Button, Notice } from "@/ui";

/**
 * Registra el service worker y avisa cuando hay una versión nueva esperando.
 * La actualización nunca se aplica sola: recargar a mitad de un apunte lo
 * perdería, así que decide el usuario.
 */
export const UpdatePrompt = () => {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  if (!needRefresh) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[80] flex justify-center px-4 pt-safe">
      <Notice
        tone="accent"
        className="pointer-events-auto mt-3 w-full max-w-md shadow-(--shadow-raised)"
        action={
          <Button size="sm" variant="primary" onClick={() => void updateServiceWorker(true)}>
            Actualizar
          </Button>
        }
      >
        <span role="status">Nueva versión disponible</span>
      </Notice>
    </div>
  );
};
