import {
  AlertDialog,
  ContextMenu,
  DropdownMenu,
  Switch as RadixSwitch,
  Tooltip as RadixTooltip,
} from "radix-ui";
import { useState, type ReactNode } from "react";

import { Button } from "./Button";
import { cn } from "./cn";
import { Input } from "./Input";

/* ───────────────────────── Confirmación ───────────────────────── */

export interface ConfirmDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly title: string;
  readonly description: ReactNode;
  readonly confirmLabel: string;
  readonly cancelLabel?: string;
  readonly tone?: "default" | "danger";
  /** Segunda confirmación: el usuario debe escribir este texto exacto. */
  readonly requireText?: string;
  readonly onConfirm: () => void;
}

export const ConfirmDialog = ({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel = "Cancelar",
  tone = "default",
  requireText,
  onConfirm,
}: ConfirmDialogProps) => {
  const [typed, setTyped] = useState("");
  const blocked = requireText !== undefined && typed.trim() !== requireText;

  return (
    <AlertDialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) setTyped("");
        onOpenChange(next);
      }}
    >
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-[90] animate-fade-in bg-scrim" />
        <div className="pointer-events-none fixed inset-0 z-[91] flex items-center justify-center p-4">
          <AlertDialog.Content className="pointer-events-auto flex w-full max-w-sm animate-pop-in flex-col gap-3 rounded-hero border border-border bg-raised p-5 shadow-(--shadow-raised) outline-none">
            <AlertDialog.Title className="text-title text-fg">{title}</AlertDialog.Title>
            <AlertDialog.Description asChild>
              <div className="text-body text-fg-2">{description}</div>
            </AlertDialog.Description>
            {requireText !== undefined && (
              <label className="flex flex-col gap-1.5 text-caption text-fg-2">
                <span>
                  Escribe <span className="num text-fg">{requireText}</span> para confirmar
                </span>
                <Input
                  value={typed}
                  onChange={(event) => setTyped(event.currentTarget.value)}
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                />
              </label>
            )}
            <div className="mt-2 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <AlertDialog.Cancel asChild>
                <Button variant="ghost">{cancelLabel}</Button>
              </AlertDialog.Cancel>
              <AlertDialog.Action asChild>
                <Button
                  variant={tone === "danger" ? "danger" : "primary"}
                  disabled={blocked}
                  onClick={onConfirm}
                >
                  {confirmLabel}
                </Button>
              </AlertDialog.Action>
            </div>
          </AlertDialog.Content>
        </div>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
};

/* ───────────────────────── Menús ───────────────────────── */

export interface MenuAction {
  readonly label: string;
  readonly icon?: ReactNode;
  readonly tone?: "default" | "danger";
  readonly disabled?: boolean;
  readonly onSelect: () => void;
}

const menuContentClass =
  "bg-raised border-border rounded-card animate-pop-in z-[70] min-w-44 border p-1 shadow-(--shadow-raised)";

const menuItemClass = (tone: MenuAction["tone"]) =>
  cn(
    "flex h-10 cursor-pointer items-center gap-2.5 rounded-[8px] px-2.5 text-body outline-none select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-40 data-[highlighted]:bg-chip",
    tone === "danger" ? "text-danger" : "text-fg",
  );

const itemIcon = (icon: ReactNode) =>
  icon != null && (
    <span aria-hidden="true" className="inline-flex w-4 justify-center">
      {icon}
    </span>
  );

export interface MenuProps {
  readonly actions: ReadonlyArray<MenuAction>;
  /** Disparador: debe ser un único elemento que acepte ref. */
  readonly children: ReactNode;
  readonly align?: "start" | "center" | "end";
}

/** Menú desplegable de acciones. */
export const Menu = ({ actions, children, align = "end" }: MenuProps) => (
  <DropdownMenu.Root>
    <DropdownMenu.Trigger asChild>{children}</DropdownMenu.Trigger>
    <DropdownMenu.Portal>
      <DropdownMenu.Content
        align={align}
        sideOffset={6}
        collisionPadding={12}
        className={menuContentClass}
      >
        {actions.map((action) => (
          <DropdownMenu.Item
            key={action.label}
            disabled={action.disabled ?? false}
            onSelect={action.onSelect}
            className={menuItemClass(action.tone)}
          >
            {itemIcon(action.icon)}
            {action.label}
          </DropdownMenu.Item>
        ))}
      </DropdownMenu.Content>
    </DropdownMenu.Portal>
  </DropdownMenu.Root>
);

/** Menú contextual (clic derecho) para filas de tablas en escritorio. */
export const RowContextMenu = ({ actions, children }: Omit<MenuProps, "align">) => (
  <ContextMenu.Root>
    <ContextMenu.Trigger asChild>{children}</ContextMenu.Trigger>
    <ContextMenu.Portal>
      <ContextMenu.Content collisionPadding={12} className={menuContentClass}>
        {actions.map((action) => (
          <ContextMenu.Item
            key={action.label}
            disabled={action.disabled ?? false}
            onSelect={action.onSelect}
            className={menuItemClass(action.tone)}
          >
            {itemIcon(action.icon)}
            {action.label}
          </ContextMenu.Item>
        ))}
      </ContextMenu.Content>
    </ContextMenu.Portal>
  </ContextMenu.Root>
);

/* ───────────────────────── Tooltip ───────────────────────── */

export const TooltipProvider = ({ children }: { readonly children: ReactNode }) => (
  <RadixTooltip.Provider delayDuration={350} skipDelayDuration={200}>
    {children}
  </RadixTooltip.Provider>
);

export interface TipProps {
  readonly label: ReactNode;
  readonly side?: "top" | "right" | "bottom" | "left";
  readonly children: ReactNode;
}

/** Tooltip. Requiere un `TooltipProvider` por encima. */
export const Tip = ({ label, side = "top", children }: TipProps) => (
  <RadixTooltip.Root>
    <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
    <RadixTooltip.Portal>
      <RadixTooltip.Content
        side={side}
        sideOffset={8}
        collisionPadding={8}
        className="z-[95] animate-fade-in rounded-[8px] border border-border bg-raised px-2.5 py-1.5 text-caption text-fg shadow-(--shadow-raised)"
      >
        {label}
      </RadixTooltip.Content>
    </RadixTooltip.Portal>
  </RadixTooltip.Root>
);

/* ───────────────────────── Interruptor ───────────────────────── */

export interface SwitchProps {
  readonly checked: boolean;
  readonly onCheckedChange: (checked: boolean) => void;
  readonly label: string;
  readonly id?: string;
  readonly disabled?: boolean;
}

export const Switch = ({ checked, onCheckedChange, label, id, disabled = false }: SwitchProps) => (
  <RadixSwitch.Root
    id={id}
    checked={checked}
    onCheckedChange={onCheckedChange}
    disabled={disabled}
    aria-label={label}
    className="hit-44 inline-flex h-6 w-10 shrink-0 items-center rounded-full border border-border bg-track px-0.5 transition-colors disabled:opacity-40 data-[state=checked]:border-accent data-[state=checked]:bg-accent"
  >
    <RadixSwitch.Thumb className="block size-4.5 rounded-full bg-fg transition-transform duration-[120ms] data-[state=checked]:translate-x-4 data-[state=checked]:bg-on-accent" />
  </RadixSwitch.Root>
);
