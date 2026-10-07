import { Plus } from "lucide-react";
import { useMemo } from "react";

import { nextSortOrder, useLedger, useRepo } from "@/data";
import { topLevelCategories } from "@/domain/categories";
import { type PreviewRow, unknownNames } from "@/domain/importing/pipeline";
import { countUnknown, earliestDateForAccount } from "@/domain/importing/session";
import { ZERO_CENTS } from "@/domain/money";
import type { BudgetGroup, CategoryKind } from "@/domain/types";
import { useToday } from "@/features/shell/useToday";
import { TYPE_LABELS } from "@/features/transactions/view";
import { Badge, Button, Card, Menu, toast } from "@/ui";

import { AccountPicker, CategoryPicker, PickerButton } from "./pickers";
import type { ResolveTarget } from "./types";

const ICON = { size: 14, strokeWidth: 1.75 } as const;

const rowsLabel = (count: number): string => `${count} ${count === 1 ? "fila" : "filas"}`;

const UnknownRow = ({
  name,
  detail,
  children,
}: {
  readonly name: string;
  readonly detail: string;
  readonly children: React.ReactNode;
}) => (
  <li className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5">
    <div className="min-w-0 flex-1 basis-40">
      <div className="truncate text-body text-fg">«{name}»</div>
      <div className="truncate text-caption text-fg-2">{detail}</div>
    </div>
    <div className="flex shrink-0 items-center gap-2">{children}</div>
  </li>
);

export interface UnknownNamesProps {
  readonly rows: ReadonlyArray<PreviewRow>;
  readonly onResolve: (target: ResolveTarget) => void;
}

/**
 * Cuentas y categorías del archivo que no existen en MyPocket (migración desde
 * Notion). Cada nombre se asigna a algo existente o se crea, y la decisión se
 * aplica a todas las filas que lo traían.
 */
export const UnknownNames = ({ rows, onResolve }: UnknownNamesProps) => {
  const { accounts, index } = useLedger();
  const repo = useRepo();
  const today = useToday();
  const unknown = useMemo(() => unknownNames(rows), [rows]);

  if (unknown.accounts.length === 0 && unknown.categories.length === 0) return null;

  const createAccount = (name: string) => {
    const id = repo.createAccount(
      {
        name,
        emoji: "💳",
        color: "slate",
        type: "checking",
        openingBalance: ZERO_CENTS,
        // Desde su primer movimiento, para que todos cuenten en el saldo.
        openingDate: earliestDateForAccount(rows, name) ?? today,
        isLiquid: true,
        includeInNetWorth: true,
      },
      nextSortOrder(accounts),
    );
    onResolve({ kind: "account", name, id });
    toast(`Cuenta «${name}» creada. Puedes cambiar su tipo en Cuentas.`);
  };

  const createCategory = (name: string, kind: CategoryKind, budgetGroup: BudgetGroup | null) => {
    const id = repo.createCategory(
      { name, emoji: "🏷️", kind, parentId: null, budgetGroup },
      nextSortOrder(topLevelCategories(index, kind)),
    );
    onResolve({ kind: "category", name, type: kind, id });
    toast(`Categoría «${name}» creada`);
  };

  const total = unknown.accounts.length + unknown.categories.length;

  return (
    <Card padding="none" tone="warning" className="overflow-hidden">
      <div className="flex items-center gap-2 px-4 pt-4 pb-2">
        <h2 className="min-w-0 flex-1 text-title text-fg">Nombres que no conocemos</h2>
        <Badge tone="warning">{total}</Badge>
      </div>
      <p className="px-4 pb-3 text-body text-fg-2">
        El archivo trae cuentas o categorías que no existen en MyPocket. Asígnalas a una que ya
        tengas o créalas; se aplica a todas sus filas.
      </p>
      <ul className="divide-y divide-border border-t border-border">
        {unknown.accounts.map((name) => (
          <UnknownRow
            key={`account-${name}`}
            name={name}
            detail={`Cuenta · ${rowsLabel(countUnknown(rows, { kind: "account", name }))}`}
          >
            <AccountPicker
              action
              look="chip"
              label={`Asignar «${name}» a una cuenta`}
              value={null}
              placeholder="Asignar a"
              onChange={(id) => onResolve({ kind: "account", name, id })}
            />
            <Button
              size="sm"
              variant="secondary"
              leading={<Plus aria-hidden="true" {...ICON} />}
              onClick={() => createAccount(name)}
            >
              Crear
            </Button>
          </UnknownRow>
        ))}
        {unknown.categories.map(({ name, kind }) => (
          <UnknownRow
            key={`category-${kind}-${name}`}
            name={name}
            detail={`Categoría de ${TYPE_LABELS[kind].toLowerCase()} · ${rowsLabel(
              countUnknown(rows, { kind: "category", name, type: kind }),
            )}`}
          >
            <CategoryPicker
              kind={kind}
              value={null}
              onChange={(id) => onResolve({ kind: "category", name, type: kind, id })}
            >
              <PickerButton look="chip" aria-label={`Asignar «${name}» a una categoría`}>
                Asignar a
              </PickerButton>
            </CategoryPicker>
            {kind === "expense" ? (
              <Menu
                actions={[
                  {
                    label: "Crear en Necesidades",
                    onSelect: () => createCategory(name, kind, "needs"),
                  },
                  {
                    label: "Crear en Deseos",
                    onSelect: () => createCategory(name, kind, "wants"),
                  },
                ]}
              >
                <Button
                  size="sm"
                  variant="secondary"
                  leading={<Plus aria-hidden="true" {...ICON} />}
                >
                  Crear
                </Button>
              </Menu>
            ) : (
              <Button
                size="sm"
                variant="secondary"
                leading={<Plus aria-hidden="true" {...ICON} />}
                onClick={() => createCategory(name, kind, null)}
              >
                Crear
              </Button>
            )}
          </UnknownRow>
        ))}
      </ul>
    </Card>
  );
};
