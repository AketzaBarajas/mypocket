import { Link, type LinkProps } from "@tanstack/react-router";
import { ArrowLeft, Plus, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { Fab } from "./Button";
import { cn } from "./cn";
import { Tip } from "./Overlays";

export interface NavItem {
  readonly to: NonNullable<LinkProps["to"]>;
  readonly label: string;
  readonly icon: LucideIcon;
  /** Contador (por ejemplo, movimientos pendientes). */
  readonly badge?: number | undefined;
  /** Solo activa con coincidencia exacta de ruta (Inicio). */
  readonly exact?: boolean;
}

/** Marca de MyPocket: un bolsillo geométrico en menta sobre casi negro. */
export const Logo = ({
  size = 28,
  className,
}: {
  readonly size?: number;
  readonly className?: string;
}) => (
  <svg
    viewBox="0 0 64 64"
    width={size}
    height={size}
    role="img"
    aria-label="MyPocket"
    className={cn("shrink-0", className)}
  >
    <rect width="64" height="64" rx="14" fill="#09090B" />
    <path
      d="M18 24a6 6 0 0 1 6-6h16a6 6 0 0 1 6 6v8a14 14 0 0 1-28 0z"
      fill="none"
      stroke="#3DF5A7"
      strokeWidth="5"
      strokeLinejoin="round"
    />
    <path
      d="M26 28l6 6 6-6"
      fill="none"
      stroke="#3DF5A7"
      strokeWidth="5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const CountBadge = ({
  count,
  className,
}: {
  readonly count: number;
  readonly className?: string;
}) => (
  <span
    className={cn(
      "inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-accent-soft px-1.5 num text-micro font-semibold text-accent",
      className,
    )}
  >
    <span className="sr-only">Pendientes: </span>
    {count > 99 ? "99+" : count}
  </span>
);

/* ───────────────────────── Barra inferior (móvil) ───────────────────────── */

export interface TabBarProps {
  /** Exactamente cuatro destinos; el ＋ ocupa la ranura central. */
  readonly items: readonly [NavItem, NavItem, NavItem, NavItem];
  readonly onAdd: () => void;
  readonly className?: string;
}

const TabLink = ({ item }: { readonly item: NavItem }) => {
  const Icon = item.icon;
  return (
    <Link
      to={item.to}
      activeOptions={{ exact: item.exact ?? false }}
      className="relative flex h-14 min-w-0 flex-col items-center justify-center gap-1 text-fg-2 transition-colors data-[status=active]:text-fg"
    >
      <span className="relative inline-flex">
        <Icon aria-hidden="true" size={22} strokeWidth={1.75} />
        {item.badge !== undefined && item.badge > 0 && (
          <span
            aria-hidden="true"
            className="absolute -top-0.5 -right-1 size-2 rounded-full bg-accent"
          />
        )}
      </span>
      <span className="max-w-full truncate px-1 text-micro">{item.label}</span>
      {item.badge !== undefined && item.badge > 0 && (
        <span className="sr-only">{item.badge} pendientes</span>
      )}
    </Link>
  );
};

/** Barra inferior fija: 84 px incluido el safe-area y ＋ sobresaliendo 24 px. */
export const TabBar = ({ items, onAdd, className }: TabBarProps) => (
  <nav
    aria-label="Principal"
    className={cn(
      "fixed inset-x-0 bottom-0 z-30 h-[84px] border-t border-border bg-bg sm:hidden",
      className,
    )}
  >
    <div className="mx-auto grid h-14 max-w-lg grid-cols-5 items-center">
      <TabLink item={items[0]} />
      <TabLink item={items[1]} />
      <div className="relative flex h-14 justify-center">
        <Fab label="Nuevo movimiento" onClick={onAdd} className="absolute -top-6">
          <Plus aria-hidden="true" size={26} strokeWidth={2} />
        </Fab>
      </div>
      <TabLink item={items[2]} />
      <TabLink item={items[3]} />
    </div>
  </nav>
);

/* ───────────────────────── Raíl (tablet) ───────────────────────── */

export interface RailProps {
  readonly items: ReadonlyArray<NavItem>;
  readonly onAdd: () => void;
  readonly footer?: ReactNode;
  readonly className?: string;
}

export const Rail = ({ items, onAdd, footer, className }: RailProps) => (
  <nav
    aria-label="Principal"
    className={cn(
      "fixed inset-y-0 left-0 z-30 hidden w-[72px] flex-col items-center gap-1 border-r border-border bg-bg py-4 sm:flex lg:hidden",
      className,
    )}
  >
    <Logo size={32} className="mb-3" />
    <Tip label="Nuevo movimiento" side="right">
      <Fab label="Nuevo movimiento" onClick={onAdd} className="mb-3 size-11 rounded-[12px]">
        <Plus aria-hidden="true" size={22} strokeWidth={2} />
      </Fab>
    </Tip>
    {items.map((item) => {
      const Icon = item.icon;
      return (
        <Tip key={item.to} label={item.label} side="right">
          <Link
            to={item.to}
            aria-label={item.label}
            activeOptions={{ exact: item.exact ?? false }}
            className="relative inline-flex size-11 items-center justify-center rounded-control text-fg-2 transition-colors hover:bg-chip hover:text-fg data-[status=active]:bg-chip data-[status=active]:text-fg"
          >
            <Icon aria-hidden="true" size={20} strokeWidth={1.75} />
            {item.badge !== undefined && item.badge > 0 && (
              <span
                aria-hidden="true"
                className="absolute top-2 right-2 size-2 rounded-full bg-accent"
              />
            )}
          </Link>
        </Tip>
      );
    })}
    {footer != null && <div className="mt-auto flex flex-col items-center gap-1">{footer}</div>}
  </nav>
);

/* ───────────────────────── Barra lateral (escritorio) ───────────────────────── */

export interface SidebarProps {
  readonly items: ReadonlyArray<NavItem>;
  /** Estado de cifrado, sincronización y copia, al pie. */
  readonly footer?: ReactNode;
  readonly className?: string;
}

export const Sidebar = ({ items, footer, className }: SidebarProps) => (
  <aside
    className={cn(
      "fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-border bg-bg lg:flex",
      className,
    )}
  >
    <div className="flex h-16 shrink-0 items-center gap-2.5 px-5">
      <Logo size={28} />
      <span className="text-title tracking-tight text-fg">MyPocket</span>
    </div>
    <nav
      aria-label="Principal"
      className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-3 py-2"
    >
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <Link
            key={item.to}
            to={item.to}
            activeOptions={{ exact: item.exact ?? false }}
            className="flex h-10 items-center gap-3 rounded-control px-3 text-body text-fg-2 transition-colors hover:bg-chip hover:text-fg data-[status=active]:bg-chip data-[status=active]:text-fg"
          >
            <Icon aria-hidden="true" size={18} strokeWidth={1.75} className="shrink-0" />
            <span className="min-w-0 flex-1 truncate">{item.label}</span>
            {item.badge !== undefined && item.badge > 0 && <CountBadge count={item.badge} />}
          </Link>
        );
      })}
    </nav>
    {footer != null && <div className="shrink-0 border-t border-border px-5 py-4">{footer}</div>}
  </aside>
);

/* ───────────────────────── Cabecera de página ───────────────────────── */

export interface PageHeaderProps {
  readonly title: ReactNode;
  readonly subtitle?: ReactNode;
  /** Texto pequeño sobre el título (por ejemplo, la fecha). */
  readonly eyebrow?: ReactNode;
  readonly leading?: ReactNode;
  readonly actions?: ReactNode;
  /** Muestra un botón de volver que navega a esta ruta. */
  readonly backTo?: NonNullable<LinkProps["to"]> | undefined;
  readonly className?: string;
}

export const PageHeader = ({
  title,
  subtitle,
  eyebrow,
  leading,
  actions,
  backTo,
  className,
}: PageHeaderProps) => (
  <header className={cn("flex min-w-0 items-center gap-3 pt-4 pb-4 lg:pt-8 lg:pb-6", className)}>
    {backTo !== undefined && (
      <Link
        to={backTo}
        aria-label="Volver"
        className="-ml-2 inline-flex size-11 shrink-0 items-center justify-center rounded-control text-fg-2 transition-colors hover:bg-chip hover:text-fg"
      >
        <ArrowLeft aria-hidden="true" size={20} strokeWidth={1.75} />
      </Link>
    )}
    {leading}
    <div className="min-w-0 flex-1">
      {eyebrow != null && <div className="truncate text-caption text-fg-2">{eyebrow}</div>}
      <h1 className="truncate text-h1 text-fg">{title}</h1>
      {subtitle != null && <div className="mt-0.5 truncate text-body text-fg-2">{subtitle}</div>}
    </div>
    {actions != null && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
  </header>
);
