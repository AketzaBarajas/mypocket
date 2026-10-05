import { useId, type ComponentProps, type ReactNode } from "react";

import { cn } from "./cn";

export const controlClass =
  "h-11 w-full min-w-0 rounded-control border border-border bg-surface px-3 text-fg transition-colors hover:border-border-strong focus:border-border-strong disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-danger";

export interface InputProps extends ComponentProps<"input"> {
  readonly leading?: ReactNode;
  readonly trailing?: ReactNode;
}

export const Input = ({ leading, trailing, className, type, ...props }: InputProps) => {
  if (leading == null && trailing == null) {
    return <input type={type ?? "text"} className={cn(controlClass, className)} {...props} />;
  }
  return (
    <div className={cn("relative flex min-w-0 items-center", className)}>
      {leading != null && (
        <span className="pointer-events-none absolute left-3 inline-flex text-fg-3">{leading}</span>
      )}
      <input
        type={type ?? "text"}
        className={cn(controlClass, leading != null && "pl-10", trailing != null && "pr-10")}
        {...props}
      />
      {trailing != null && <span className="absolute right-1 inline-flex">{trailing}</span>}
    </div>
  );
};

export const Textarea = ({ className, rows, ...props }: ComponentProps<"textarea">) => (
  <textarea
    rows={rows ?? 3}
    className={cn(controlClass, "h-auto min-h-20 resize-y py-2.5", className)}
    {...props}
  />
);

export interface FieldProps {
  readonly label: ReactNode;
  readonly hint?: ReactNode;
  readonly error?: string | undefined;
  readonly className?: string;
  /** Recibe el id y los atributos ARIA que debe llevar el control. */
  readonly children: (control: {
    readonly id: string;
    readonly "aria-describedby": string | undefined;
    readonly "aria-invalid": boolean | undefined;
  }) => ReactNode;
}

/** Etiqueta, control, pista y error enlazados para lectores de pantalla. */
export const Field = ({ label, hint, error, className, children }: FieldProps) => {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = error != null ? errorId : hint != null ? hintId : undefined;

  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <label htmlFor={id} className="text-caption text-fg-2">
        {label}
      </label>
      {children({
        id,
        "aria-describedby": describedBy,
        "aria-invalid": error != null ? true : undefined,
      })}
      {error != null ? (
        <p id={errorId} role="alert" className="text-caption text-danger">
          {error}
        </p>
      ) : (
        hint != null && (
          <p id={hintId} className="text-caption text-fg-2">
            {hint}
          </p>
        )
      )}
    </div>
  );
};
