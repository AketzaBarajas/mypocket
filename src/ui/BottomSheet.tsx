import { AnimatePresence, motion, useDragControls, useReducedMotion } from "motion/react";
import { Dialog, VisuallyHidden } from "radix-ui";
import type { ReactNode, RefObject } from "react";

import { cn } from "./cn";
import { DURATION, EASE } from "./motion";
import { useIsTabletUp } from "./useMediaQuery";

export interface BottomSheetProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly title: string;
  readonly description?: string;
  /** Oculta visualmente el título (sigue existiendo para lectores de pantalla). */
  readonly hideTitle?: boolean;
  /** "fast" entra en 150 ms: capa de escritura. "base" en 220 ms. */
  readonly speed?: "fast" | "base";
  readonly size?: "sm" | "md" | "lg";
  /** Elemento que recibe el foco al abrir. */
  readonly initialFocus?: RefObject<HTMLElement | null>;
  readonly header?: ReactNode;
  readonly footer?: ReactNode;
  readonly className?: string;
  readonly children: ReactNode;
}

const widths = { sm: "sm:max-w-sm", md: "sm:max-w-md", lg: "sm:max-w-2xl" } as const;

/**
 * Hoja inferior sobre Radix Dialog. En móvil sube desde abajo y se cierra
 * arrastrando el tirador; desde 640 px se presenta como diálogo centrado.
 */
export const BottomSheet = ({
  open,
  onOpenChange,
  title,
  description,
  hideTitle = false,
  speed = "base",
  size = "md",
  initialFocus,
  header,
  footer,
  className,
  children,
}: BottomSheetProps) => {
  const reduceMotion = useReducedMotion();
  const isTabletUp = useIsTabletUp();
  const dragControls = useDragControls();
  const duration = reduceMotion ? 0 : speed === "fast" ? 0.15 : DURATION.base;
  const transition = { duration, ease: EASE };

  const titleNode = <Dialog.Title className="truncate text-title text-fg">{title}</Dialog.Title>;

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open && (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild forceMount>
              <motion.div
                className="fixed inset-0 z-40 bg-scrim"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={transition}
              />
            </Dialog.Overlay>
            <div className="pointer-events-none fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
              <Dialog.Content
                asChild
                forceMount
                // Sin descripción, se indica a Radix que no hay texto que enlazar.
                {...(description == null ? { "aria-describedby": undefined } : {})}
                onOpenAutoFocus={(event) => {
                  if (initialFocus?.current) {
                    event.preventDefault();
                    initialFocus.current.focus();
                  }
                }}
              >
                <motion.div
                  className={cn(
                    "pointer-events-auto relative flex max-h-[92dvh] w-full flex-col rounded-t-sheet border border-b-0 border-border bg-raised shadow-(--shadow-raised) outline-none",
                    "sm:max-h-[86dvh] sm:rounded-hero sm:border-b",
                    widths[size],
                    className,
                  )}
                  initial={isTabletUp ? { opacity: 0, scale: 0.98, y: 8 } : { y: "100%" }}
                  animate={isTabletUp ? { opacity: 1, scale: 1, y: 0 } : { y: 0 }}
                  exit={isTabletUp ? { opacity: 0, scale: 0.98, y: 8 } : { y: "100%" }}
                  transition={transition}
                  drag={isTabletUp ? false : "y"}
                  dragControls={dragControls}
                  dragListener={false}
                  dragConstraints={{ top: 0, bottom: 0 }}
                  dragElastic={{ top: 0, bottom: 0.7 }}
                  onDragEnd={(_, info) => {
                    if (info.offset.y > 96 || info.velocity.y > 600) onOpenChange(false);
                  }}
                >
                  <div
                    className="flex shrink-0 touch-none flex-col items-center pt-2 sm:hidden"
                    onPointerDown={(event) => dragControls.start(event)}
                  >
                    <span aria-hidden="true" className="h-1 w-9 rounded-full bg-border-strong" />
                  </div>
                  {hideTitle ? (
                    <VisuallyHidden.Root>{titleNode}</VisuallyHidden.Root>
                  ) : (
                    <div className="flex shrink-0 items-center gap-3 px-4 pt-3 pb-2 sm:px-5 sm:pt-5">
                      <div className="min-w-0 flex-1">{titleNode}</div>
                      {header}
                    </div>
                  )}
                  {description != null && (
                    <Dialog.Description
                      className={cn(
                        "px-4 pb-2 text-caption text-fg-2 sm:px-5",
                        hideTitle && "sr-only",
                      )}
                    >
                      {description}
                    </Dialog.Description>
                  )}
                  <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4 sm:px-5 sm:pb-5">
                    {children}
                  </div>
                  {footer != null && (
                    <div className="shrink-0 border-t border-border px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-5 sm:pb-5">
                      {footer}
                    </div>
                  )}
                  {footer == null && <div className="shrink-0 pb-safe sm:hidden" />}
                </motion.div>
              </Dialog.Content>
            </div>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  );
};
