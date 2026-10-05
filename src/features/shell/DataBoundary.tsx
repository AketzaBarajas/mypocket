import { Suspense, useEffect, useRef, type ReactNode } from "react";

import { DataProvider, seedDemo, useDataError, useLedger, useRepo } from "@/data";
import { IS_DEMO, useSession } from "@/security/session";
import { Notice, Skeleton, SkeletonGroup } from "@/ui";

import { useToday } from "./useToday";

/** Esqueleto de una pantalla mientras se cargan las tablas la primera vez. */
export const ScreenSkeleton = () => (
  <SkeletonGroup label="Cargando tus datos" className="flex flex-col gap-3 py-6">
    <Skeleton className="h-8 w-40" />
    <Skeleton className="h-44 w-full rounded-hero" />
    <div className="grid grid-cols-2 gap-3">
      <Skeleton className="h-24 rounded-card" />
      <Skeleton className="h-24 rounded-card" />
    </div>
    <Skeleton className="h-40 w-full rounded-card" />
  </SkeletonGroup>
);

const DATA_ERRORS = {
  "unsupported-version":
    "Tus datos necesitan una versión más nueva de MyPocket. Actualiza la app o cierra las demás pestañas.",
  "other-build": "MyPocket está abierta en otra pestaña con otra versión. Ciérrala para continuar.",
  unknown: "Algo ha fallado al guardar. Cierra esta pestaña y vuelve a abrir la app.",
} as const;

/** Aviso de un error de la base de datos. Va fuera del Suspense para no quedar oculto. */
const DataErrorNotice = () => {
  const error = useDataError();
  if (error === null) return null;
  return (
    <div role="alert" className="py-3">
      <Notice tone="danger">{DATA_ERRORS[error]}</Notice>
    </div>
  );
};

/** En el perfil demo, carga los datos ficticios la primera vez. */
const DemoSeeder = () => {
  const { accounts } = useLedger();
  const repo = useRepo();
  const today = useToday();
  const seeded = useRef(false);

  useEffect(() => {
    if (!IS_DEMO || seeded.current || accounts.length > 0) return;
    seeded.current = true;
    seedDemo(repo, today);
  }, [accounts.length, repo, today]);

  return null;
};

/**
 * Límite de datos: monta el proveedor con la base abierta y muestra un
 * skeleton hasta la primera carga. Sin sesión desbloqueada no renderiza nada.
 */
export const DataBoundary = ({
  children,
  fallback = <ScreenSkeleton />,
}: {
  readonly children: ReactNode;
  readonly fallback?: ReactNode;
}) => {
  const db = useSession((state) => state.db);
  if (db === null) return null;
  return (
    <>
      <DataErrorNotice />
      <Suspense fallback={fallback}>
        <DataProvider db={db}>
          {IS_DEMO && <DemoSeeder />}
          {children}
        </DataProvider>
      </Suspense>
    </>
  );
};
