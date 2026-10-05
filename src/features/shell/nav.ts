import { ArrowLeftRight, ChartLine, House, Settings, Target, Upload, Wallet } from "lucide-react";

import type { NavItem } from "@/ui";

const home: NavItem = { to: "/", label: "Inicio", icon: House, exact: true };
const transactions: NavItem = { to: "/movimientos", label: "Movimientos", icon: ArrowLeftRight };
const accounts: NavItem = { to: "/cuentas", label: "Cuentas", icon: Wallet };
const plan: NavItem = { to: "/plan", label: "Plan", icon: Target };
const analysis: NavItem = { to: "/analisis", label: "Análisis", icon: ChartLine };
const importer: NavItem = { to: "/importar", label: "Importar", icon: Upload };
const settings: NavItem = { to: "/ajustes", label: "Ajustes", icon: Settings };

const withBadge = (item: NavItem, badge: number): NavItem => ({ ...item, badge });

/** Barra inferior del móvil: cuatro destinos alrededor del ＋. */
export const tabItems = (pendingCount: number): readonly [NavItem, NavItem, NavItem, NavItem] => [
  home,
  withBadge(transactions, pendingCount),
  plan,
  analysis,
];

/** Raíl de tablet y barra lateral de escritorio. */
export const sideItems = (pendingCount: number): ReadonlyArray<NavItem> => [
  home,
  withBadge(transactions, pendingCount),
  accounts,
  plan,
  analysis,
  importer,
  settings,
];
