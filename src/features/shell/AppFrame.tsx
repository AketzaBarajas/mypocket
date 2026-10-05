import { Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useEffectEvent, useMemo } from "react";

import { useLedger, useRepo } from "@/data";
import { pendingTransactions } from "@/domain/transactions";
import { QuickAddSheet } from "@/features/quickadd/QuickAddSheet";
import { setAutoLockMinutes } from "@/security/session";
import { getStoredTheme, setTheme } from "@/ui";

import { AppShell } from "./AppShell";
import { StatusFooter } from "./StatusFooter";
import { useUi } from "./uiStore";
import { useToday } from "./useToday";

const isTyping = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement &&
  (target.isContentEditable ||
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement);

/** Atajos de escritorio: N = nuevo movimiento y / = buscar. Esc lo gestionan los diálogos. */
const useShortcuts = (onNew: () => void, onSearch: () => void) => {
  const handle = useEffectEvent((event: KeyboardEvent) => {
    if (event.metaKey || event.ctrlKey || event.altKey || event.defaultPrevented) return;
    if (isTyping(event.target)) return;
    // Con un diálogo abierto, las teclas son suyas.
    if (document.querySelector('[role="dialog"], [role="alertdialog"]')) return;
    if (event.key === "n" || event.key === "N") {
      event.preventDefault();
      onNew();
    } else if (event.key === "/") {
      event.preventDefault();
      onSearch();
    }
  });
  useEffect(() => {
    const listener = (event: KeyboardEvent) => handle(event);
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);
};

/**
 * Genera los pendientes de las recurrencias al desbloquear y al volver a primer
 * plano. No hay tareas en segundo plano: en iOS todo ocurre al abrir la app.
 */
const useRecurrenceRunner = () => {
  const { recurrences, transactions } = useLedger();
  const repo = useRepo();
  const today = useToday();

  const run = useEffectEvent(() => {
    repo.runRecurrences(recurrences, transactions, today);
  });

  useEffect(() => {
    run();
    const onVisible = () => {
      if (document.visibilityState === "visible") run();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
    // También al cambiar de día y cuando cambian las recurrencias (una nueva, o
    // las que llegan por sincronización). Es idempotente: repetirlo no duplica.
  }, [today, recurrences]);
};

/** Marco de la app con datos: shell, alta rápida global y tareas de primer plano. */
export const AppFrame = () => {
  const navigate = useNavigate();
  const { transactions, settings } = useLedger();
  const today = useToday();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const requestSearchFocus = useUi((state) => state.requestSearchFocus);

  const pendingCount = useMemo(
    () => pendingTransactions(transactions, today).length,
    [transactions, today],
  );

  const openQuickAdd = () =>
    void navigate({ to: ".", search: (prev) => ({ ...prev, nuevo: "gasto" as const }) });

  useShortcuts(openQuickAdd, () => {
    requestSearchFocus();
    if (pathname !== "/movimientos") void navigate({ to: "/movimientos" });
  });
  useRecurrenceRunner();

  // Ajustes sincronizados que afectan a este dispositivo.
  useEffect(() => {
    setAutoLockMinutes(settings.autoLockMinutes);
  }, [settings.autoLockMinutes]);
  useEffect(() => {
    if (getStoredTheme() !== settings.theme) setTheme(settings.theme);
  }, [settings.theme]);

  return (
    <AppShell pendingCount={pendingCount} onAdd={openQuickAdd} status={<StatusFooter />}>
      <Outlet />
      <QuickAddSheet />
    </AppShell>
  );
};
