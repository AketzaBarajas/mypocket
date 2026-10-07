import { Link } from "@tanstack/react-router";
import {
  ChevronRight,
  CloudUpload,
  FolderTree,
  Hash,
  Info,
  type LucideIcon,
  Palette,
  RefreshCw,
  ShieldCheck,
  TriangleAlert,
  UserRound,
  Wallet,
  Wand2,
} from "lucide-react";
import type { ReactNode } from "react";

import { Card, cn, PageHeader, useIsDesktop } from "@/ui";

import { BackupSection } from "./BackupSection";
import { CategoriesSection } from "./CategoriesSection";
import {
  AboutSection,
  AppearanceSection,
  DangerSection,
  DefaultsSection,
  ProfileSection,
} from "./GeneralSections";
import { RulesSection } from "./RulesSection";
import { SecuritySection } from "./SecuritySection";
import { SETTINGS_SECTIONS, type SettingsSectionKey } from "./sections";
import { SyncSection } from "./SyncSection";
import { TagsSection } from "./TagsSection";

const SECTIONS: Record<
  SettingsSectionKey,
  { readonly label: string; readonly icon: LucideIcon; readonly render: () => ReactNode }
> = {
  perfil: { label: "Perfil", icon: UserRound, render: () => <ProfileSection /> },
  categorias: { label: "Categorías", icon: FolderTree, render: () => <CategoriesSection /> },
  reglas: { label: "Reglas", icon: Wand2, render: () => <RulesSection /> },
  etiquetas: { label: "Etiquetas", icon: Hash, render: () => <TagsSection /> },
  cuentas: { label: "Cuentas por defecto", icon: Wallet, render: () => <DefaultsSection /> },
  seguridad: { label: "Seguridad", icon: ShieldCheck, render: () => <SecuritySection /> },
  sincronizacion: { label: "Sincronización", icon: RefreshCw, render: () => <SyncSection /> },
  copias: { label: "Copias", icon: CloudUpload, render: () => <BackupSection /> },
  apariencia: { label: "Apariencia", icon: Palette, render: () => <AppearanceSection /> },
  acerca: { label: "Acerca de", icon: Info, render: () => <AboutSection /> },
  peligro: { label: "Zona de peligro", icon: TriangleAlert, render: () => <DangerSection /> },
};

export interface SettingsPageProps {
  readonly section: SettingsSectionKey | undefined;
}

/**
 * Ajustes. En escritorio, índice a la izquierda y sección a la derecha; en
 * móvil y tablet, el índice es la pantalla y cada sección se abre aparte.
 */
export const SettingsPage = ({ section }: SettingsPageProps) => {
  const isDesktop = useIsDesktop();

  if (isDesktop) {
    const current = section ?? "perfil";
    return (
      <>
        <PageHeader title="Ajustes" />
        <div className="grid grid-cols-[14rem_minmax(0,1fr)] items-start gap-8">
          <nav aria-label="Secciones de ajustes" className="sticky top-6 flex flex-col gap-0.5">
            {SETTINGS_SECTIONS.map((key) => {
              const { label, icon: Icon } = SECTIONS[key];
              return (
                <Link
                  key={key}
                  to="/ajustes"
                  search={{ seccion: key }}
                  replace
                  aria-current={key === current ? "page" : undefined}
                  className={cn(
                    "flex h-10 items-center gap-3 rounded-control px-3 text-body transition-colors",
                    key === current ? "bg-chip text-fg" : "text-fg-2 hover:bg-chip hover:text-fg",
                    key === "peligro" && key !== current && "hover:text-danger",
                  )}
                >
                  <Icon aria-hidden="true" size={18} strokeWidth={1.75} className="shrink-0" />
                  <span className="min-w-0 flex-1 truncate">{label}</span>
                </Link>
              );
            })}
          </nav>
          <div key={current} className="flex max-w-3xl min-w-0 flex-col gap-3">
            {SECTIONS[current].render()}
          </div>
        </div>
      </>
    );
  }

  if (section === undefined) {
    return (
      <>
        <PageHeader title="Ajustes" backTo="/" />
        <Card padding="none" className="divide-y divide-border overflow-hidden">
          {SETTINGS_SECTIONS.map((key) => {
            const { label, icon: Icon } = SECTIONS[key];
            return (
              <Link
                key={key}
                to="/ajustes"
                search={{ seccion: key }}
                className="flex min-h-13 items-center gap-3 px-4 py-2 transition-colors hover:bg-chip"
              >
                <Icon
                  aria-hidden="true"
                  size={18}
                  strokeWidth={1.75}
                  className={cn("shrink-0", key === "peligro" ? "text-danger" : "text-fg-2")}
                />
                <span className="min-w-0 flex-1 truncate text-body text-fg">{label}</span>
                <ChevronRight
                  aria-hidden="true"
                  size={16}
                  strokeWidth={1.75}
                  className="shrink-0 text-fg-3"
                />
              </Link>
            );
          })}
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Ajustes" backTo="/ajustes" />
      <div className="flex flex-col gap-3">{SECTIONS[section].render()}</div>
    </>
  );
};
