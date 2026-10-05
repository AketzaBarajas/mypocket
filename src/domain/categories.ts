import type { BudgetGroup, Category, CategoryId, CategoryKind } from "./types";

/** Índice de categorías para resolver jerarquía sin recorrer la lista cada vez. */
export interface CategoryIndex {
  readonly byId: ReadonlyMap<CategoryId, Category>;
  readonly childrenOf: ReadonlyMap<CategoryId, ReadonlyArray<Category>>;
  readonly all: ReadonlyArray<Category>;
}

const bySortOrder = (a: Category, b: Category): number =>
  a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "es");

export const buildCategoryIndex = (categories: ReadonlyArray<Category>): CategoryIndex => {
  const byId = new Map<CategoryId, Category>();
  for (const category of categories) byId.set(category.id, category);

  const childrenOf = new Map<CategoryId, Category[]>();
  for (const category of categories) {
    // Una hija cuya madre no existe (aún no sincronizada) se trata como de primer nivel.
    if (category.parentId === null || !byId.has(category.parentId)) continue;
    const siblings = childrenOf.get(category.parentId) ?? [];
    siblings.push(category);
    childrenOf.set(category.parentId, siblings);
  }
  for (const siblings of childrenOf.values()) siblings.sort(bySortOrder);

  return { byId, childrenOf, all: [...categories].sort(bySortOrder) };
};

export const parentOf = (index: CategoryIndex, category: Category): Category | null =>
  category.parentId === null ? null : (index.byId.get(category.parentId) ?? null);

/** Categoría de primer nivel de una categoría (ella misma si no tiene madre). */
export const topLevelOf = (index: CategoryIndex, categoryId: CategoryId): Category | null => {
  const category = index.byId.get(categoryId);
  if (!category) return null;
  return parentOf(index, category) ?? category;
};

export const childrenOfCategory = (
  index: CategoryIndex,
  categoryId: CategoryId,
): ReadonlyArray<Category> => index.childrenOf.get(categoryId) ?? [];

/** Una categoría es hoja si no tiene hijas. Solo las hojas se asignan a movimientos. */
export const isLeaf = (index: CategoryIndex, categoryId: CategoryId): boolean =>
  index.byId.has(categoryId) && childrenOfCategory(index, categoryId).length === 0;

export const isTopLevel = (index: CategoryIndex, category: Category): boolean =>
  parentOf(index, category) === null;

export const topLevelCategories = (
  index: CategoryIndex,
  kind: CategoryKind,
  options: { readonly includeArchived?: boolean } = {},
): ReadonlyArray<Category> =>
  index.all.filter(
    (category) =>
      category.kind === kind &&
      isTopLevel(index, category) &&
      (options.includeArchived === true || !category.archived),
  );

/** Hojas asignables de un tipo, sin las archivadas ni las hijas de madres archivadas. */
export const leafCategories = (index: CategoryIndex, kind: CategoryKind): ReadonlyArray<Category> =>
  index.all.filter((category) => {
    if (category.kind !== kind || category.archived || !isLeaf(index, category.id)) return false;
    const parent = parentOf(index, category);
    return !parent?.archived;
  });

/** Grupo 50/30/20 de una categoría: el de su categoría de primer nivel. */
export const budgetGroupOf = (index: CategoryIndex, categoryId: CategoryId): BudgetGroup | null =>
  topLevelOf(index, categoryId)?.budgetGroup ?? null;

/** "Alimentación › Supermercado", o solo el nombre si es de primer nivel. */
export const categoryPath = (index: CategoryIndex, categoryId: CategoryId): string => {
  const category = index.byId.get(categoryId);
  if (!category) return "";
  const parent = parentOf(index, category);
  return parent ? `${parent.name} › ${category.name}` : category.name;
};

export interface CategoryValidationInput {
  readonly id: CategoryId | null;
  readonly kind: CategoryKind;
  readonly parentId: CategoryId | null;
  readonly budgetGroup: BudgetGroup | null;
}

/** Valida las reglas de jerarquía. Devuelve un mensaje de error o `null`. */
export const validateCategory = (
  index: CategoryIndex,
  input: CategoryValidationInput,
): string | null => {
  if (input.parentId !== null) {
    const parent = index.byId.get(input.parentId);
    if (!parent) return "La categoría madre no existe.";
    if (parent.id === input.id) return "Una categoría no puede ser su propia madre.";
    if (parent.parentId !== null)
      return "Solo hay dos niveles: una subcategoría no puede tener hijas.";
    if (parent.kind !== input.kind) return "La subcategoría debe ser del mismo tipo que su madre.";
    if (input.id !== null && childrenOfCategory(index, input.id).length > 0) {
      return "Esta categoría tiene subcategorías y no puede convertirse en subcategoría.";
    }
    return null;
  }
  if (input.kind === "expense" && input.budgetGroup === null) {
    return "Elige si es una necesidad o un deseo.";
  }
  return null;
};
