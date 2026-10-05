import { X } from "lucide-react";
import { useEffect } from "react";
import { create } from "zustand";

import { cn } from "./cn";

export interface ToastAction {
  readonly label: string;
  readonly onClick: () => void;
}

export interface ToastOptions {
  readonly message: string;
  readonly action?: ToastAction | undefined;
  /** Milisegundos visible. Por defecto 5000. */
  readonly duration?: number;
  readonly tone?: "neutral" | "danger";
}

interface ToastItem extends ToastOptions {
  readonly id: number;
}

interface ToastState {
  readonly toasts: ReadonlyArray<ToastItem>;
  readonly push: (options: ToastOptions) => number;
  readonly dismiss: (id: number) => void;
  readonly clear: () => void;
}

let nextId = 1;
const MAX_VISIBLE = 3;

const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  push: (options) => {
    const id = nextId++;
    set((state) => ({ toasts: [...state.toasts, { ...options, id }].slice(-MAX_VISIBLE) }));
    return id;
  },
  dismiss: (id) => set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) })),
  clear: () => set({ toasts: [] }),
}));

/** Muestra un aviso breve. Se puede llamar desde cualquier sitio, también fuera de React. */
export const toast = (options: ToastOptions | string): number =>
  useToastStore.getState().push(typeof options === "string" ? { message: options } : options);

export const dismissToast = (id: number): void => useToastStore.getState().dismiss(id);
export const clearToasts = (): void => useToastStore.getState().clear();

const ToastCard = ({ item }: { readonly item: ToastItem }) => {
  const dismiss = useToastStore((state) => state.dismiss);
  const duration = item.duration ?? 5000;

  useEffect(() => {
    const timer = window.setTimeout(() => dismiss(item.id), duration);
    return () => window.clearTimeout(timer);
  }, [dismiss, item.id, duration]);

  return (
    <div
      className={cn(
        "pointer-events-auto flex min-h-12 w-full animate-toast-in items-center gap-1 rounded-card border bg-raised py-1 pr-1 pl-4 shadow-(--shadow-raised)",
        item.tone === "danger" ? "border-danger/60" : "border-border-strong",
      )}
    >
      <p className="min-w-0 flex-1 py-2 text-body text-fg">{item.message}</p>
      {item.action && (
        <button
          type="button"
          onClick={() => {
            item.action?.onClick();
            dismiss(item.id);
          }}
          className="h-10 shrink-0 rounded-[8px] px-3 text-body font-semibold whitespace-nowrap text-accent transition-colors hover:bg-accent-soft"
        >
          {item.action.label}
        </button>
      )}
      <button
        type="button"
        aria-label="Cerrar aviso"
        onClick={() => dismiss(item.id)}
        className="inline-flex size-10 shrink-0 items-center justify-center rounded-[8px] text-fg-2 transition-colors hover:bg-chip hover:text-fg"
      >
        <X aria-hidden="true" size={16} strokeWidth={1.75} />
      </button>
    </div>
  );
};

/**
 * Región viva de avisos. Está siempre montada para que los lectores de
 * pantalla anuncien los mensajes nuevos (aria-live).
 */
export const ToastViewport = ({ className }: { readonly className?: string }) => {
  const toasts = useToastStore((state) => state.toasts);
  return (
    <div
      role="status"
      aria-live="polite"
      aria-relevant="additions text"
      className={cn(
        "pointer-events-none fixed inset-x-0 z-[80] mx-auto flex w-full max-w-md flex-col gap-2 px-4",
        "bottom-[calc(84px+0.75rem)] sm:bottom-6",
        className,
      )}
    >
      {toasts.map((item) => (
        <ToastCard key={item.id} item={item} />
      ))}
    </div>
  );
};
