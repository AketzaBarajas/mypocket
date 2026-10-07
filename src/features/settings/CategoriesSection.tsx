import {
  Archive,
  ArchiveRestore,
  ArrowDown,
  ArrowUp,
  Ellipsis,
  Merge,
  Pencil,
  Plus,
} from "lucide-react";
import { useMemo, useState } from "react";

import { nextSortOrder, useLedger, useRepo } from "@/data";
import {
  childrenOfCategory,
  leafCategories,
  parentOf,
  topLevelCategories,
  validateCategory,
} from "@/domain/categories";
import type { BudgetGroup, Category, CategoryKind } from "@/domain/types";
import {
  Badge,
  BottomSheet,
  Button,
  cn,
  Combobox,
  ConfirmDialog,
  EmojiChip,
  Field,
  IconButton,
  Input,
  Menu,
  type MenuAction,
  SegmentedControl,
  Select,
  toast,
} from "@/ui";

import { SettingsCard, SettingsSection } from "./shared";

const ICON = { size: 16, strokeWidth: 1.75 } as const;
const NO_PARENT = "__none__";

const KIND_OPTIONS = [
  { value: "expense", label: "Gastos" },
  { value: "income", label: "Ingresos" },
] as const;

const GROUP_LABELS: Record<BudgetGroup, string> = { needs: "Necesidad", wants: "Deseo" };
const GROUP_OPTIONS = [
  { value: "needs", label: "Necesidades" },
  { value: "wants", label: "Deseos" },
] as const;

/** Categoría que se edita, o los datos de partida de una nueva. */
type Editing =
  | { readonly mode: "edit"; readonly category: Category }
  | { readonly mode: "create"; readonly kind: CategoryKind; readonly parentId: string | null };

/* ───────────────────────── Formulario ───────────────────────── */

const CategoryForm = ({
  editing,
  onDone,
}: {
  readonly editing: Editing;
  readonly onDone: () => void;
}) => {
  const { index } = useLedger();
  const repo = useRepo();
  const current = editing.mode === "edit" ? editing.category : null;
  const kind = current?.kind ?? (editing.mode === "create" ? editing.kind : "expense");
  const [name, setName] = useState(current?.name ?? "");
  const [emoji, setEmoji] = useState(current?.emoji ?? "🏷️");
  const [parentId, setParentId] = useState<string | null>(
    current ? current.parentId : editing.mode === "create" ? editing.parentId : null,
  );
  const [budgetGroup, setBudgetGroup] = useState<BudgetGroup | null>(
    current?.budgetGroup ?? (kind === "expense" ? "wants" : null),
  );
  const [error, setError] = useState<string | null>(null);

  const hasChildren = current !== null && childrenOfCategory(index, current.id).length > 0;
  const parents = topLevelCategories(index, kind).filter((category) => category.id !== current?.id);

  const save = () => {
    const cleanName = name.trim();
    if (cleanName === "") {
      setError("Ponle un nombre.");
      return;
    }
    const group = parentId === null && kind === "expense" ? budgetGroup : null;
    const problem = validateCategory(index, {
      id: current?.id ?? null,
      kind,
      parentId,
      budgetGroup: group,
    });
    if (problem !== null) {
      setError(problem);
      return;
    }
    const input = {
      name: cleanName,
      emoji: emoji.trim() === "" ? "🏷️" : emoji.trim(),
      kind,
      parentId,
      budgetGroup: group,
    };
    if (current) {
      repo.updateCategory(current.id, input);
      toast("Categoría guardada");
    } else {
      const siblings =
        parentId === null
          ? topLevelCategories(index, kind, { includeArchived: true })
          : childrenOfCategory(index, parentId);
      repo.createCategory(input, nextSortOrder(siblings));
      toast("Categoría creada");
    }
    onDone();
  };

  return (
    <form
      noValidate
      className="flex flex-col gap-4 pt-2"
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
    >
      <div className="grid grid-cols-[5rem_1fr] gap-3">
        <Field label="Emoji">
          {(aria) => (
            <Input
              className="text-center"
              maxLength={16}
              value={emoji}
              onChange={(event) => setEmoji(event.currentTarget.value)}
              {...aria}
            />
          )}
        </Field>
        <Field label="Nombre" error={error ?? undefined}>
          {(aria) => (
            <Input
              maxLength={60}
              autoComplete="off"
              value={name}
              onChange={(event) => {
                setName(event.currentTarget.value);
                setError(null);
              }}
              {...aria}
            />
          )}
        </Field>
      </div>

      <Field
        label="Dentro de"
        hint={
          hasChildren
            ? "Tiene subcategorías: no puede pasar a ser una subcategoría."
            : "Solo hay dos niveles."
        }
      >
        {(aria) => (
          <Select
            value={parentId ?? NO_PARENT}
            disabled={hasChildren}
            onValueChange={(value) => {
              setParentId(value === NO_PARENT ? null : value);
              setError(null);
            }}
            options={[
              { value: NO_PARENT, label: "Ninguna: es de primer nivel" },
              ...parents.map((parent) => ({
                value: parent.id,
                label: parent.name,
                emoji: parent.emoji,
              })),
            ]}
            {...aria}
          />
        )}
      </Field>

      {kind === "expense" && parentId === null && (
        <Field label="Grupo 50/30/20" hint="Sus subcategorías lo heredan.">
          {() => (
            <SegmentedControl
              ariaLabel="Grupo 50/30/20"
              value={budgetGroup ?? "wants"}
              onValueChange={setBudgetGroup}
              options={GROUP_OPTIONS}
            />
          )}
        </Field>
      )}

      <Button type="submit" variant="primary" size="lg" fullWidth>
        {current ? "Guardar" : "Crear categoría"}
      </Button>
    </form>
  );
};

/* ───────────────────────── Fusión ───────────────────────── */

const MergeSheet = ({
  source,
  uses,
  onClose,
}: {
  readonly source: Category | null;
  readonly uses: number;
  readonly onClose: () => void;
}) => {
  const ledger = useLedger();
  const repo = useRepo();
  const [target, setTarget] = useState<Category | null>(null);
  const options = useMemo(
    () =>
      source === null
        ? []
        : leafCategories(ledger.index, source.kind)
            .filter((category) => category.id !== source.id)
            .map((category) => ({
              value: category.id,
              label: category.name,
              emoji: category.emoji,
              hint: parentOf(ledger.index, category)?.name,
            })),
    [ledger.index, source],
  );

  return (
    <>
      <BottomSheet
        open={source !== null}
        onOpenChange={(open) => {
          if (!open) onClose();
        }}
        title={`Fusionar «${source?.name ?? ""}» con…`}
        size="sm"
      >
        <Combobox
          ariaLabel="Categoría de destino"
          placeholder="Buscar categoría"
          options={options}
          selected={[]}
          autoFocus
          className="h-[min(60dvh,24rem)]"
          onSelect={(id) => setTarget(ledger.index.byId.get(id) ?? null)}
        />
      </BottomSheet>
      <ConfirmDialog
        open={source !== null && target !== null}
        onOpenChange={(open) => {
          if (!open) setTarget(null);
        }}
        tone="danger"
        title={`¿Fusionar con «${target?.name ?? ""}»?`}
        description={`${uses === 1 ? "Su movimiento pasa" : `Sus ${uses} movimientos pasan`} a «${
          target?.name ?? ""
        }», junto con sus reglas y recurrencias, y «${source?.name ?? ""}» desaparece. No se puede deshacer.`}
        confirmLabel="Fusionar"
        onConfirm={() => {
          if (source === null || target === null) return;
          repo.mergeCategory(source.id, target.id, ledger);
          toast(`«${source.name}» fusionada con «${target.name}»`);
          setTarget(null);
          onClose();
        }}
      />
    </>
  );
};

/* ───────────────────────── Árbol ───────────────────────── */

const CategoryRow = ({
  category,
  uses,
  child,
  actions,
  onEdit,
}: {
  readonly category: Category;
  readonly uses: number;
  readonly child: boolean;
  readonly actions: ReadonlyArray<MenuAction>;
  readonly onEdit: () => void;
}) => (
  <div className={cn("flex min-h-13 items-center gap-1 pr-2", category.archived && "opacity-55")}>
    <button
      type="button"
      onClick={onEdit}
      className={cn(
        "flex min-w-0 flex-1 items-center gap-3 py-2 pr-2 text-left transition-colors hover:bg-chip",
        child ? "pl-14" : "pl-4",
      )}
    >
      {!child && <EmojiChip emoji={category.emoji} size="sm" />}
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-center gap-2">
          <span className={cn("truncate text-body", child ? "text-fg-2" : "text-fg")}>
            {category.name}
          </span>
          {!child && category.budgetGroup !== null && (
            <Badge>{GROUP_LABELS[category.budgetGroup]}</Badge>
          )}
          {category.archived && <Badge>Archivada</Badge>}
        </span>
      </span>
      {uses > 0 && <span className="shrink-0 num text-caption text-fg-3">{uses}</span>}
    </button>
    <Menu actions={actions}>
      <IconButton label={`Acciones de ${category.name}`} size="sm">
        <Ellipsis aria-hidden="true" {...ICON} />
      </IconButton>
    </Menu>
  </div>
);

export const CategoriesSection = () => {
  const { index, transactions } = useLedger();
  const repo = useRepo();
  const [kind, setKind] = useState<CategoryKind>("expense");
  const [editing, setEditing] = useState<Editing | null>(null);
  const [merging, setMerging] = useState<Category | null>(null);

  const usage = useMemo(() => {
    const counts = new Map<string, number>();
    for (const transaction of transactions) {
      if (transaction.categoryId !== null && !transaction.isDeleted) {
        counts.set(transaction.categoryId, (counts.get(transaction.categoryId) ?? 0) + 1);
      }
    }
    return counts;
  }, [transactions]);

  const tops = topLevelCategories(index, kind, { includeArchived: true });

  const move = (siblings: ReadonlyArray<Category>, category: Category, step: -1 | 1) => {
    const ids = siblings.map((item) => item.id);
    const from = ids.indexOf(category.id);
    const to = from + step;
    if (from === -1 || to < 0 || to >= ids.length) return;
    ids.splice(to, 0, ...ids.splice(from, 1));
    repo.reorderCategories(ids);
  };

  const actionsFor = (category: Category, siblings: ReadonlyArray<Category>): MenuAction[] => {
    const position = siblings.findIndex((item) => item.id === category.id);
    const isLeaf = childrenOfCategory(index, category.id).length === 0;
    return [
      {
        label: "Editar",
        icon: <Pencil {...ICON} />,
        onSelect: () => setEditing({ mode: "edit", category }),
      },
      ...(category.parentId === null
        ? [
            {
              label: "Añadir subcategoría",
              icon: <Plus {...ICON} />,
              onSelect: () =>
                setEditing({ mode: "create", kind: category.kind, parentId: category.id }),
            },
          ]
        : []),
      {
        label: "Subir",
        icon: <ArrowUp {...ICON} />,
        disabled: position <= 0,
        onSelect: () => move(siblings, category, -1),
      },
      {
        label: "Bajar",
        icon: <ArrowDown {...ICON} />,
        disabled: position === -1 || position >= siblings.length - 1,
        onSelect: () => move(siblings, category, 1),
      },
      {
        label: "Fusionar con…",
        icon: <Merge {...ICON} />,
        // Solo se fusionan las categorías que llevan movimientos: las hojas.
        disabled: !isLeaf,
        onSelect: () => setMerging(category),
      },
      {
        label: category.archived ? "Recuperar" : "Archivar",
        icon: category.archived ? <ArchiveRestore {...ICON} /> : <Archive {...ICON} />,
        onSelect: () => {
          repo.setCategoryArchived(category.id, !category.archived);
          toast(category.archived ? "Categoría recuperada" : "Categoría archivada");
        },
      },
    ];
  };

  return (
    <SettingsSection
      title="Categorías"
      description="Una categoría con movimientos no se borra: se archiva o se fusiona con otra."
      actions={
        <Button
          variant="secondary"
          leading={<Plus aria-hidden="true" {...ICON} />}
          onClick={() => setEditing({ mode: "create", kind, parentId: null })}
        >
          Nueva
        </Button>
      }
    >
      <SegmentedControl
        ariaLabel="Tipo de categoría"
        value={kind}
        onValueChange={setKind}
        options={KIND_OPTIONS}
        className="max-w-xs"
      />
      <SettingsCard>
        {tops.map((top) => {
          const children = childrenOfCategory(index, top.id);
          return (
            <div key={top.id}>
              <CategoryRow
                category={top}
                uses={usage.get(top.id) ?? 0}
                child={false}
                actions={actionsFor(top, tops)}
                onEdit={() => setEditing({ mode: "edit", category: top })}
              />
              {children.map((child) => (
                <CategoryRow
                  key={child.id}
                  category={child}
                  uses={usage.get(child.id) ?? 0}
                  child
                  actions={actionsFor(child, children)}
                  onEdit={() => setEditing({ mode: "edit", category: child })}
                />
              ))}
            </div>
          );
        })}
      </SettingsCard>
      <p className="px-1 text-caption text-fg-2">
        El número a la derecha son los movimientos que usan la categoría.
      </p>

      <BottomSheet
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
        title={
          editing?.mode === "edit"
            ? "Editar categoría"
            : editing?.mode === "create" && editing.parentId !== null
              ? "Nueva subcategoría"
              : "Nueva categoría"
        }
        size="sm"
      >
        {editing && (
          <CategoryForm
            key={editing.mode === "edit" ? editing.category.id : `new-${editing.parentId ?? "top"}`}
            editing={editing}
            onDone={() => setEditing(null)}
          />
        )}
      </BottomSheet>
      <MergeSheet
        source={merging}
        uses={merging === null ? 0 : (usage.get(merging.id) ?? 0)}
        onClose={() => setMerging(null)}
      />
    </SettingsSection>
  );
};
