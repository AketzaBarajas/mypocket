import type { ReactNode } from "react";

import { Rail, Sidebar, TabBar } from "@/ui";

import { sideItems, tabItems } from "./nav";

export interface AppShellProps {
  readonly pendingCount: number;
  readonly onAdd: () => void;
  /** Estado de cifrado, sincronización y copia (pie de la barra lateral). */
  readonly status?: ReactNode;
  readonly children: ReactNode;
}

/**
 * Shell responsive: barra inferior en móvil (< 640 px), raíl de iconos en
 * tablet (640-1024 px) y barra lateral de 240 px en escritorio (≥ 1024 px).
 */
export const AppShell = ({ pendingCount, onAdd, status, children }: AppShellProps) => (
  <div className="min-h-dvh">
    <a
      href="#contenido"
      className="sr-only z-[100] rounded-control border border-border bg-raised px-4 py-2 text-fg focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
    >
      Saltar al contenido
    </a>
    <Sidebar items={sideItems(pendingCount)} footer={status} />
    <Rail items={sideItems(pendingCount)} onAdd={onAdd} />
    <main
      id="contenido"
      tabIndex={-1}
      className="pt-safe pb-[calc(84px+2rem)] outline-none sm:pb-10 sm:pl-[72px] lg:pl-60"
    >
      <div className="mx-auto w-full max-w-[1280px] px-safe sm:px-6 lg:px-8">{children}</div>
    </main>
    <TabBar items={tabItems(pendingCount)} onAdd={onAdd} />
  </div>
);
